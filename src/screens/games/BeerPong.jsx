import '../../styles/beerpong.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameFrame, ScoreTile, Seat } from '../../components/GameChrome.jsx'
import { pad } from '../../lib/format.js'

// Mirrors of server/games/beerpong.js. The meters have to describe the same
// space the server resolves throws in, or aiming would be a lie.
const HIT_RADIUS = 0.085
const angleToX = (angle) => (angle - 0.5) * 1.7
const powerToY = (power) => 1.12 - power * 1.22
const xToAngle = (x) => x / 1.7 + 0.5
const yToPower = (y) => (1.12 - y) / 1.22

// The full 0..1 range is mostly off-table, so the meters sweep the useful slice.
const ANGLE_LO = 0.3
const ANGLE_HI = 0.7
const POWER_LO = 0.18
const POWER_HI = 0.86

const ANGLE_PERIOD = 1500
const POWER_PERIOD = 1150
const FLIGHT_MS = 820

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const toAngle = (f) => ANGLE_LO + f * (ANGLE_HI - ANGLE_LO)
const toPower = (f) => POWER_LO + f * (POWER_HI - POWER_LO)
const angleFrac = (angle) => clamp((angle - ANGLE_LO) / (ANGLE_HI - ANGLE_LO), 0, 1)
const powerFrac = (power) => clamp((power - POWER_LO) / (POWER_HI - POWER_LO), 0, 1)

const triangle = (t, period) => {
  const p = (t % period) / period
  return p < 0.5 ? p * 2 : 2 - p * 2
}

// Table space -> screen percentages. Depth is projected through a camera so the
// far row compresses; without that the rack reads as a flat diagram.
const CAM = 1.62
const DEPTH_FAR = -0.05
const DEPTH_NEAR = 1.15
const INV_FAR = 1 / (CAM - DEPTH_FAR)
const INV_NEAR = 1 / (CAM - DEPTH_NEAR)

function project(x, y) {
  const inv = 1 / (CAM - clamp(y, DEPTH_FAR, DEPTH_NEAR))
  const t = (inv - INV_FAR) / (INV_NEAR - INV_FAR)
  const persp = 0.4 + 0.6 * t
  return { left: 50 + x * 118 * persp, top: 13 + 79 * t, persp }
}

const CUP_BASE = 13

function Felt() {
  return (
    <svg className="bp-felt" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M50 8 L96 96 L4 96 Z" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" />
      <line x1="4" y1="62" x2="96" y2="62" stroke="rgba(255,255,255,0.045)" strokeWidth="0.4" />
      <ellipse cx="50" cy="26" rx="20" ry="7" fill="none" stroke="rgba(255,182,39,0.12)" strokeWidth="0.4" />
    </svg>
  )
}

function Cup({ cup, live, sinking }) {
  const { left, top, persp } = project(cup.x, cup.y)
  const style = { left: `${left}%`, top: `${top}%`, '--w': `${CUP_BASE * persp}%`, zIndex: Math.round(top * 3) }

  if (!live && !sinking) return <span className="bp-ghost" style={style} />

  return (
    <div className="bp-cup" data-live={live} data-sinking={sinking} style={style}>
      <span className="bp-cup-rim" />
      <span className="bp-cup-beer" />
      <span className="bp-cup-body" />
    </div>
  )
}

function Splash({ at }) {
  const { left, top, persp } = project(at.x, at.y)
  const drops = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const angle = (i / 7) * Math.PI * 2
        return { dx: `${Math.cos(angle) * 130}%`, dy: `${Math.sin(angle) * 130 - 40}%`, delay: i * 18 }
      }),
    [at.id]
  )

  return (
    <span className="bp-splash" style={{ left: `${left}%`, top: `${top}%`, '--w': `${CUP_BASE * persp * 1.6}%` }}>
      <em />
      {drops.map((drop, i) => (
        <i key={i} style={{ '--dx': drop.dx, '--dy': drop.dy, animationDelay: `${drop.delay}ms` }} />
      ))}
    </span>
  )
}

export function BeerPong({ game, act, onExit }) {
  const { turn, yourCups, theirCups, lastThrow } = game.state

  const tableRef = useRef(null)
  const ballRef = useRef(null)
  const shadowRef = useRef(null)
  const aimRef = useRef(null)
  const needleRef = useRef(null)
  const fillRef = useRef(null)
  const aiming = useRef({ angle: 0.5, power: 0.5, lockedAngle: null })

  const [phase, setPhase] = useState('idle')
  const [flight, setFlight] = useState(null)
  const [sinking, setSinking] = useState(null)
  const [splash, setSplash] = useState(null)

  const myTurn = turn === game.you
  const frozen = game.opponentGone

  // While a throw is in the air the table has to show the rack being shot at,
  // which is the thrower's opposite — not whoever is on turn afterwards.
  const shooter = flight ? flight.by : turn
  const shootingAtTheirs = shooter === game.you
  const rack = shootingAtTheirs ? theirCups : yourCups

  const yourLeft = yourCups.filter((c) => c.alive).length
  const theirLeft = theirCups.filter((c) => c.alive).length

  const zones = useMemo(() => {
    const live = rack.filter((c) => c.alive)
    if (live.length === 0) return null

    const angles = live.map((c) => xToAngle(c.x))
    const powers = live.map((c) => yToPower(c.y))
    const angleSlack = HIT_RADIUS / 1.7
    const powerSlack = HIT_RADIUS / 1.22

    return {
      angle: [
        angleFrac(Math.min(...angles) - angleSlack),
        angleFrac(Math.max(...angles) + angleSlack)
      ],
      power: [
        powerFrac(Math.min(...powers) - powerSlack),
        powerFrac(Math.max(...powers) + powerSlack)
      ]
    }
  }, [rack])

  /* ------------------------------------------------------------- aiming --- */

  // `turn` and `lastThrow` land in the same update, so the re-arm effect can set
  // phase a render before the flight commits. Gating on flight here keeps the
  // meters, the aim marker and the hint in step with the rack on screen.
  const aimable = !flight && (phase === 'angle' || phase === 'power')

  useEffect(() => {
    if (!aimable) return
    let raf = 0

    const frame = () => {
      const now = performance.now()
      const state = aiming.current

      if (phase === 'angle') {
        state.angle = toAngle(triangle(now, ANGLE_PERIOD))
        state.power = 0.5
      } else {
        state.angle = state.lockedAngle
        state.power = toPower(triangle(now, POWER_PERIOD))
      }

      if (needleRef.current) {
        needleRef.current.style.left = `${angleFrac(state.angle) * 100}%`
      }
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleY(${phase === 'power' ? powerFrac(state.power) : 0})`
      }
      if (aimRef.current) {
        const { left, top, persp } = project(angleToX(state.angle), powerToY(state.power))
        aimRef.current.style.left = `${left}%`
        aimRef.current.style.top = `${top}%`
        aimRef.current.style.setProperty('--w', `${CUP_BASE * persp * 1.5}%`)
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [aimable, phase])

  const tap = useCallback(() => {
    if (phase === 'angle') {
      aiming.current.lockedAngle = aiming.current.angle
      setPhase('power')
      return
    }
    if (phase === 'power') {
      const { lockedAngle, power } = aiming.current
      setPhase('throwing')
      act({ angle: lockedAngle, power })
    }
  }, [phase, act])

  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      tap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tap])

  // Only re-arm when something real changed. Setting phase to 'throwing' must
  // not be clobbered by this effect, so 'throwing' is not in its dependencies.
  useEffect(() => {
    if (flight || frozen) return
    aiming.current.lockedAngle = null
    setPhase(myTurn ? 'angle' : 'idle')
  }, [flight, myTurn, frozen])

  /* ------------------------------------------------------------- flight --- */

  const seen = useRef(lastThrow?.throwId ?? 0)

  useEffect(() => {
    const id = lastThrow?.throwId
    if (!id || id === seen.current) return
    seen.current = id
    setFlight(lastThrow)
  }, [lastThrow])

  useEffect(() => {
    if (!flight) return

    const table = tableRef.current
    const ball = ballRef.current
    if (!table || !ball) {
      setFlight(null)
      return
    }

    const rect = table.getBoundingClientRect()
    const end = project(flight.x, flight.y)
    const size = rect.width * 0.03
    let raf = 0
    let start = 0

    const place = (node, leftPct, topPct, scale) => {
      if (!node) return
      const x = (leftPct / 100) * rect.width - size / 2
      const y = (topPct / 100) * rect.height - size / 2
      node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    }

    const frame = (now) => {
      if (!start) start = now
      const k = Math.min(1, (now - start) / FLIGHT_MS)

      const left = 50 + (end.left - 50) * k
      const top = 104 + (end.top - 104) * k
      const arc = 30 * 4 * k * (1 - k)
      const scale = 1 - (1 - end.persp) * k

      place(ball, left, top - arc, scale)
      place(shadowRef.current, left, top, scale * 0.9)

      if (k < 1) {
        raf = requestAnimationFrame(frame)
        return
      }

      if (flight.hitCup) {
        setSinking(flight.hitCup)
        setSplash({ id: flight.throwId, x: flight.x, y: flight.y })
      }
      setFlight(null)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [flight])

  useEffect(() => {
    if (!sinking) return
    const id = setTimeout(() => setSinking(null), 480)
    return () => clearTimeout(id)
  }, [sinking])

  useEffect(() => {
    if (!splash) return
    const id = setTimeout(() => setSplash(null), 640)
    return () => clearTimeout(id)
  }, [splash])

  /* --------------------------------------------------------------- view --- */

  const sank = Boolean(lastThrow?.hitCup) && lastThrow.by === game.you
  const onARun = sank && myTurn && !flight && phase !== 'throwing'

  const hint = frozen
    ? 'Waiting on your opponent'
    : flight
      ? flight.by === game.you
        ? 'Ball away…'
        : `Table ${pad(game.opponent)} is shooting`
      : phase === 'angle'
        ? 'Tap to set your line'
        : phase === 'power'
          ? 'Tap to set your power'
          : phase === 'throwing'
            ? 'Ball away…'
            : `Table ${pad(game.opponent)} is shooting`

  const aside = (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
        <Seat
          number={game.you}
          label="You"
          tone="disc-a"
          active={shootingAtTheirs}
          note={shootingAtTheirs ? 'To throw' : null}
        />
        <Seat
          number={game.opponent}
          label="Opponent"
          tone="disc-b"
          active={!shootingAtTheirs}
          note={shootingAtTheirs ? null : 'To throw'}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <ScoreTile label="Their cups" value={theirLeft} unit="left" tone="text-gold" lead={theirLeft < yourLeft} />
        <ScoreTile label="Your cups" value={yourLeft} unit="left" tone="text-neon" lead={yourLeft < theirLeft} />
      </div>

      <div className={`panel grid flex-1 place-items-center px-4 py-6 text-center ${myTurn ? 'border-gold/50!' : ''}`}>
        <div>
          <div className="display text-[clamp(1.4rem,4.6vw,2.2rem)] leading-none">
            {onARun ? (
              <span className="gold-text">Sank it — throw again</span>
            ) : myTurn ? (
              <span className="gold-text">Your throw</span>
            ) : (
              <span className="text-dim">Table {pad(game.opponent)}</span>
            )}
          </div>
          <div className="overline mt-2">{hint}</div>
        </div>
      </div>
    </>
  )

  return (
    <GameFrame game={game} aside={aside} onExit={onExit}>
      <div className="bp-stage">
        <div className="bp-play">
          <div
            ref={tableRef}
            className="bp-table"
            onPointerDown={aimable && !frozen ? tap : undefined}
            style={{ cursor: aimable && !frozen ? 'pointer' : 'default' }}
          >
            <Felt />

            <div className="overline absolute top-2 left-1/2 z-[440] -translate-x-1/2 text-[0.62rem]">
              {shootingAtTheirs ? `Table ${pad(game.opponent)}'s rack` : 'Your rack'}
            </div>

            {rack.map((cup) => (
              <Cup key={cup.id} cup={cup} live={cup.alive} sinking={sinking === cup.id} />
            ))}

            {splash && <Splash at={splash} />}

            {aimable && !frozen && <span ref={aimRef} className="bp-aim" />}

            {flight && (
              <>
                <span ref={shadowRef} className="bp-shadow" style={{ '--d': '3%' }} />
                <span ref={ballRef} className="bp-ball" style={{ '--d': '3%' }} />
              </>
            )}

            {onARun && (
              <div className="bp-banner bp-banner-hit">
                <span className="display gold-text text-[clamp(2rem,7cqw,3.4rem)] leading-none">Splash!</span>
              </div>
            )}

            <div className="bp-hint" data-armed={aimable}>
              <span className="overline leading-none">{hint}</span>
            </div>
          </div>

          <div className="bp-meter bp-power" data-armed={phase === 'power'} data-set={phase === 'throwing'}>
            {zones && (
              <span
                className="bp-zone"
                style={{ bottom: `${zones.power[0] * 100}%`, top: `${(1 - zones.power[1]) * 100}%` }}
              />
            )}
            {[0.25, 0.5, 0.75].map((t) => (
              <span key={t} className="bp-tick" style={{ bottom: `${t * 100}%` }} />
            ))}
            <span ref={fillRef} className="bp-power-fill" data-set={phase === 'throwing'} style={{ transform: 'scaleY(0)' }} />
          </div>
        </div>

        <div className="bp-deck">
          <div className="bp-meter bp-angle" data-armed={phase === 'angle'} data-set={phase !== 'angle' && aimable}>
            {zones && (
              <span
                className="bp-zone"
                style={{ left: `${zones.angle[0] * 100}%`, right: `${(1 - zones.angle[1]) * 100}%` }}
              />
            )}
            {rack.map((cup) => (
              <span
                key={cup.id}
                className="bp-pip"
                data-live={cup.alive}
                style={{ left: `${angleFrac(xToAngle(cup.x)) * 100}%`, top: `${18 + cup.y * 52}%` }}
              />
            ))}
            <span ref={needleRef} className="bp-angle-needle" data-set={phase !== 'angle'} style={{ left: '50%' }} />
          </div>
        </div>
      </div>
    </GameFrame>
  )
}
