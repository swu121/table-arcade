import '../../styles/flappy.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GameFrame, ScoreTile } from '../../components/GameChrome.jsx'
import { pad } from '../../lib/format.js'

/* World units: 1 = playfield height. The stage is locked to 1.6:1 by CSS, so
   both tablets see exactly the same slice of the same course. */
const VIEW_W = 1.6
const STEP = 1 / 120
const GRAVITY = 3.2
const FLAP_V = -0.86
const MAX_FALL = 1.55
const SCROLL = 0.62
const GATE_SPACING = 0.95
const FIRST_GATE = 1.55
const PIPE_HW = 0.065
const BOTTLE_H = 0.105
const BOTTLE_X = 0.46
const HIT_HW = 0.04
const HIT_HH = 0.019
const GROUND_Y = 0.965
const REPORT_DELAY = 900

const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

function drawBottle(ctx, px, py, h, angle) {
  const w = h * 0.44
  const hw = w / 2
  const nh = w * 0.16
  const top = -h / 2
  const capH = h * 0.09
  const neckEnd = top + capH + h * 0.19
  const shoulder = neckEnd + h * 0.13
  const bottom = h / 2
  const r = w * 0.16

  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(angle)

  ctx.beginPath()
  ctx.moveTo(-nh, top + capH)
  ctx.lineTo(-nh, neckEnd)
  ctx.quadraticCurveTo(-hw, neckEnd + (shoulder - neckEnd) * 0.6, -hw, shoulder)
  ctx.lineTo(-hw, bottom - r)
  ctx.quadraticCurveTo(-hw, bottom, -hw + r, bottom)
  ctx.lineTo(hw - r, bottom)
  ctx.quadraticCurveTo(hw, bottom, hw, bottom - r)
  ctx.lineTo(hw, shoulder)
  ctx.quadraticCurveTo(hw, neckEnd + (shoulder - neckEnd) * 0.6, nh, neckEnd)
  ctx.lineTo(nh, top + capH)
  ctx.closePath()

  const glass = ctx.createLinearGradient(-hw, 0, hw, 0)
  glass.addColorStop(0, '#1f5c27')
  glass.addColorStop(0.3, '#5fb548')
  glass.addColorStop(0.62, '#3a8c36')
  glass.addColorStop(1, '#14401d')
  ctx.fillStyle = glass
  ctx.shadowColor = 'rgba(95, 181, 72, 0.55)'
  ctx.shadowBlur = h * 0.5
  ctx.fill()
  ctx.shadowBlur = 0

  ctx.save()
  ctx.clip()

  ctx.fillStyle = 'rgba(255,255,255,0.34)'
  ctx.fillRect(-hw * 0.62, top, w * 0.13, h)

  const labelTop = bottom - h * 0.42
  const labelH = h * 0.3
  ctx.fillStyle = '#f7f5f0'
  ctx.fillRect(-hw, labelTop, w, labelH)
  ctx.fillStyle = '#2f6fd0'
  ctx.fillRect(-hw, labelTop + labelH * 0.34, w, labelH * 0.3)
  ctx.fillStyle = 'rgba(20,40,80,0.35)'
  ctx.fillRect(-hw, labelTop + labelH * 0.82, w, labelH * 0.1)

  ctx.restore()

  ctx.lineWidth = Math.max(1, h * 0.028)
  ctx.strokeStyle = 'rgba(9, 32, 14, 0.85)'
  ctx.stroke()

  const cap = ctx.createLinearGradient(-nh, 0, nh, 0)
  cap.addColorStop(0, '#7f9a78')
  cap.addColorStop(0.4, '#dbe9d3')
  cap.addColorStop(1, '#6d8767')
  ctx.fillStyle = cap
  ctx.beginPath()
  ctx.rect(-nh * 1.22, top, nh * 2.44, capH)
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

function drawSky(ctx, w, h, camX) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#090913')
  sky.addColorStop(0.45, '#1a1130')
  sky.addColorStop(1, '#39163f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  const moonX = w * 0.78 - camX * 0.02 * h
  ctx.fillStyle = 'rgba(247,245,240,0.9)'
  ctx.beginPath()
  ctx.arc(moonX, h * 0.2, h * 0.055, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,182,39,0.09)'
  ctx.beginPath()
  ctx.arc(moonX, h * 0.2, h * 0.16, 0, Math.PI * 2)
  ctx.fill()

  const starLayer = camX * 0.06
  const first = Math.floor(starLayer / 0.11) - 1
  const last = Math.floor((starLayer + VIEW_W) / 0.11) + 1
  for (let i = first; i <= last; i++) {
    const x = (i * 0.11 - starLayer) * h
    const y = hash(i * 3.3) * h * 0.6
    const a = 0.2 + hash(i * 7.7) * 0.6
    ctx.fillStyle = `rgba(247,245,240,${a})`
    ctx.fillRect(x, y, Math.max(1, h * 0.004), Math.max(1, h * 0.004))
  }

  skyline(ctx, h, camX, 0.16, 0.42, '#150f2b', 0.1, 0.2, false)
  skyline(ctx, h, camX, 0.36, 0.3, '#0e0a1e', 0.14, 0.26, true)
}

function skyline(ctx, h, camX, parallax, spacing, color, minH, varH, lit) {
  const layer = camX * parallax
  const first = Math.floor(layer / spacing) - 1
  const last = Math.floor((layer + VIEW_W) / spacing) + 1
  for (let i = first; i <= last; i++) {
    const bw = spacing * (0.55 + hash(i * 1.7) * 0.35)
    const bh = minH + hash(i * 5.1) * varH
    const x = (i * spacing - layer) * h
    const y = GROUND_Y * h - bh * h
    ctx.fillStyle = color
    ctx.fillRect(x, y, bw * h, bh * h + h)
    if (!lit) continue
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (hash(i * 31 + r * 7 + c * 3) < 0.55) continue
        ctx.fillStyle = hash(i + r + c * 11) > 0.6 ? 'rgba(255,182,39,0.5)' : 'rgba(22,224,189,0.32)'
        ctx.fillRect(x + bw * h * (0.2 + c * 0.28), y + h * (0.03 + r * 0.045), h * 0.011, h * 0.018)
      }
    }
  }
}

function drawGate(ctx, gate, gx, camX, h, cleared) {
  const x = (gx - camX) * h
  const pw = PIPE_HW * 2 * h
  const left = x - PIPE_HW * h
  const top = (gate.center - gate.gap / 2) * h
  const bottom = (gate.center + gate.gap / 2) * h
  const accent = cleared ? '#16e0bd' : '#ffb627'

  const body = ctx.createLinearGradient(left, 0, left + pw, 0)
  body.addColorStop(0, '#2a2a3c')
  body.addColorStop(0.35, '#15151f')
  body.addColorStop(1, '#232331')

  const columns = [
    [-h * 0.2, top],
    [bottom, GROUND_Y * h + h * 0.2]
  ]

  for (const [y0, y1] of columns) {
    ctx.fillStyle = body
    ctx.fillRect(left, y0, pw, y1 - y0)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(left, y0, Math.max(1, h * 0.004), y1 - y0)
  }

  const capH = h * 0.028
  ctx.shadowColor = accent
  ctx.shadowBlur = h * 0.05
  for (const [y, dir] of [
    [top - capH, -1],
    [bottom, 1]
  ]) {
    const glow = ctx.createLinearGradient(0, y, 0, y + capH)
    glow.addColorStop(dir < 0 ? 0 : 1, cleared ? '#0c6f60' : '#8a5a06')
    glow.addColorStop(dir < 0 ? 1 : 0, accent)
    ctx.fillStyle = glow
    ctx.fillRect(left - h * 0.008, y, pw + h * 0.016, capH)
  }
  ctx.shadowBlur = 0

  const beam = ctx.createLinearGradient(0, top, 0, bottom)
  beam.addColorStop(0, cleared ? 'rgba(22,224,189,0.16)' : 'rgba(255,182,39,0.16)')
  beam.addColorStop(0.5, 'transparent')
  beam.addColorStop(1, cleared ? 'rgba(22,224,189,0.16)' : 'rgba(255,182,39,0.16)')
  ctx.fillStyle = beam
  ctx.fillRect(left, top, pw, bottom - top)
}

function drawGround(ctx, w, h, camX) {
  const y = GROUND_Y * h
  const g = ctx.createLinearGradient(0, y, 0, h)
  g.addColorStop(0, '#3a2a12')
  g.addColorStop(1, '#0b0810')
  ctx.fillStyle = g
  ctx.fillRect(0, y, w, h - y)
  ctx.fillStyle = 'rgba(255,182,39,0.75)'
  ctx.fillRect(0, y, w, Math.max(1, h * 0.005))

  const spacing = 0.09
  const off = (camX % spacing) * h
  ctx.fillStyle = 'rgba(255,182,39,0.18)'
  for (let x = -off; x < w; x += spacing * h) ctx.fillRect(x, y + h * 0.012, h * 0.03, h * 0.006)
}

export function Flappy({ game, act }) {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const simRef = useRef(null)
  const actRef = useRef(act)
  const gameRef = useRef(game)

  const [count, setCount] = useState(3)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState('ready')
  const [reason, setReason] = useState(null)

  useEffect(() => {
    actRef.current = act
    gameRef.current = game
  })

  const flap = useCallback(() => {
    const sim = simRef.current
    if (!sim || sim.phase !== 'flying' || gameRef.current.opponentGone) return
    sim.v = FLAP_V
    for (let i = 0; i < 5; i++) {
      sim.puffs.push({
        x: sim.x - 0.045 + Math.random() * 0.02,
        y: sim.y + 0.01 + Math.random() * 0.03,
        vx: -0.18 - Math.random() * 0.16,
        vy: 0.05 + Math.random() * 0.14,
        r: 0.004 + Math.random() * 0.007,
        life: 1
      })
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp') return
      e.preventDefault()
      if (!e.repeat) flap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const ctx = canvas.getContext('2d')

    const gates = gameRef.current.state?.course?.gates ?? []
    const startsAt = gameRef.current.state?.startsAt ?? Date.now()

    const sim = {
      phase: 'ready',
      t: 0,
      x: BOTTLE_X,
      y: 0.5,
      prevY: 0.5,
      prevX: BOTTLE_X,
      v: 0,
      spin: 0,
      score: 0,
      puffs: [],
      pop: 0,
      shake: 0,
      flash: 0,
      endedAt: 0,
      tumble: false,
      reported: false,
      cssW: stage.clientWidth || 1,
      cssH: stage.clientHeight || 1
    }
    simRef.current = sim

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const w = stage.clientWidth
      const h = stage.clientHeight
      if (!w || !h) return
      sim.cssW = w
      sim.cssH = h
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)

    const gateX = (i) => FIRST_GATE + i * GATE_SPACING

    const end = (why) => {
      sim.phase = 'dead'
      sim.endedAt = Date.now()
      sim.tumble = why === 'crash'
      sim.shake = why === 'crash' ? 1 : 0
      sim.flash = why === 'crash' ? 1 : 0
      setPhase('dead')
      setReason(why)
    }

    const step = () => {
      sim.t += STEP
      sim.prevX = sim.x
      sim.prevY = sim.y
      sim.pop *= 0.9
      sim.shake *= 0.9
      sim.flash *= 0.88

      for (const p of sim.puffs) {
        p.x += p.vx * STEP
        p.y += p.vy * STEP
        p.life -= STEP * 1.9
      }
      for (let i = sim.puffs.length - 1; i >= 0; i--) if (sim.puffs[i].life <= 0) sim.puffs.splice(i, 1)

      if (sim.phase === 'ready') {
        sim.y = 0.5 + Math.sin(sim.t * 3.4) * 0.022
        return
      }

      if (sim.phase === 'dead') {
        if (!sim.tumble) {
          sim.x += SCROLL * 0.4 * STEP
          sim.y += Math.sin(sim.t * 2.6) * 0.0006
          return
        }
        // Let the bottle tumble out of the frame so the crash reads as a crash.
        sim.spin += STEP * 5.2
        if (sim.y < GROUND_Y - 0.02) {
          sim.v = Math.min(sim.v + GRAVITY * STEP, MAX_FALL)
          sim.y += sim.v * STEP
        }
        return
      }

      sim.v = Math.min(sim.v + GRAVITY * STEP, MAX_FALL)
      sim.y += sim.v * STEP
      sim.x += SCROLL * STEP

      if (sim.y < HIT_HH) {
        sim.y = HIT_HH
        sim.v = 0
      }

      if (sim.y + HIT_HH >= GROUND_Y) {
        sim.y = GROUND_Y - HIT_HH
        return end('crash')
      }

      for (let i = sim.score; i < gates.length; i++) {
        const gx = gateX(i)
        if (gx - PIPE_HW > sim.x + HIT_HW) break
        const gate = gates[i]
        const overlap = Math.abs(gx - sim.x) < PIPE_HW + HIT_HW
        if (overlap) {
          const top = gate.center - gate.gap / 2
          const bottom = gate.center + gate.gap / 2
          if (sim.y - HIT_HH < top || sim.y + HIT_HH > bottom) return end('crash')
        }
        if (sim.x - HIT_HW > gx + PIPE_HW) {
          sim.score = i + 1
          sim.pop = 1
          setScore(sim.score)
          actRef.current({ type: 'progress', score: sim.score })
          if (sim.score >= gates.length) return end('cleared')
        }
      }
    }

    const draw = (alpha) => {
      const w = sim.cssW
      const h = sim.cssH
      const x = sim.prevX + (sim.x - sim.prevX) * alpha
      const y = sim.prevY + (sim.y - sim.prevY) * alpha
      const camX = x - BOTTLE_X

      ctx.save()
      if (sim.shake > 0.01) {
        const s = sim.shake * h * 0.02
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
      }

      drawSky(ctx, w, h, camX)

      const from = Math.max(0, Math.floor((camX - PIPE_HW) / GATE_SPACING) - 2)
      const to = Math.min(gates.length - 1, Math.ceil((camX + VIEW_W) / GATE_SPACING) + 1)
      for (let i = from; i <= to; i++) {
        const gx = gateX(i)
        if (gx + PIPE_HW < camX || gx - PIPE_HW > camX + VIEW_W) continue
        drawGate(ctx, gates[i], gx, camX, h, i < sim.score)
      }

      drawGround(ctx, w, h, camX)

      for (const p of sim.puffs) {
        ctx.fillStyle = `rgba(22,224,189,${0.34 * p.life})`
        ctx.beginPath()
        ctx.arc((p.x - camX) * h, p.y * h, p.r * h * (1.6 - p.life * 0.6), 0, Math.PI * 2)
        ctx.fill()
      }

      const tilt = sim.tumble ? sim.spin : clamp(sim.v * 0.62, -0.5, 1.0)
      drawBottle(ctx, BOTTLE_X * h, y * h, BOTTLE_H * h, Math.PI / 2 + tilt)

      if (sim.phase !== 'ready') {
        const size = h * 0.17 * (1 + sim.pop * 0.16)
        ctx.font = `400 ${size}px Anton, Haettenschweiler, Impact, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.lineWidth = size * 0.09
        ctx.strokeStyle = 'rgba(7,7,11,0.75)'
        ctx.strokeText(String(sim.score), w / 2, h * 0.06)
        ctx.fillStyle = sim.pop > 0.3 ? '#ffb627' : 'rgba(247,245,240,0.92)'
        ctx.fillText(String(sim.score), w / 2, h * 0.06)
      }

      ctx.restore()

      if (sim.flash > 0.01) {
        ctx.fillStyle = `rgba(255,46,99,${sim.flash * 0.45})`
        ctx.fillRect(0, 0, w, h)
      }
    }

    let raf = 0
    let acc = 0
    let shown = 3
    let last = performance.now()

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.25) dt = 0.25

      const wall = Date.now()
      const next =
        wall < startsAt
          ? Math.min(3, Math.max(1, Math.ceil((startsAt - wall) / 1000)))
          : wall < startsAt + 700
            ? 0
            : -1
      if (next !== shown) {
        shown = next
        setCount(next)
      }

      if (sim.phase === 'ready' && wall >= startsAt) {
        sim.phase = 'flying'
        sim.v = FLAP_V * 0.6
        setPhase('flying')
      }

      if (gameRef.current.opponentGone) {
        acc = 0
      } else {
        // Fixed timestep: identical physics on a 60Hz tablet and a 120Hz one.
        acc += dt
        let guard = 0
        while (acc >= STEP && guard++ < 240) {
          step()
          acc -= STEP
        }
      }

      if (sim.phase === 'dead' && !sim.reported && Date.now() - sim.endedAt > REPORT_DELAY) {
        sim.reported = true
        actRef.current({ type: 'done', score: sim.score })
      }

      draw(clamp(acc / STEP, 0, 1))
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      simRef.current = null
    }
  }, [])

  const state = game.state ?? {}
  const total = state.course?.gates?.length ?? 60
  const oppScore = state.opponent?.score ?? 0
  const oppDone = state.opponent?.done ?? false
  const label = state.scoreLabel ?? 'gates'
  const lead = score > oppScore

  const status = game.opponentGone
    ? { head: 'Paused', note: 'Waiting for the other table' }
    : phase === 'ready'
      ? { head: 'Get ready', note: 'Tap anywhere to flap' }
      : phase === 'flying'
        ? oppDone
          ? { head: `Beat ${oppScore}`, note: `Table ${pad(game.opponent)} is done — keep flying` }
          : { head: 'Fly', note: 'Tap anywhere to flap' }
        : reason === 'cleared'
          ? { head: 'Course cleared', note: oppDone ? 'Scoring…' : `Waiting on Table ${pad(game.opponent)}` }
          : { head: "You're out", note: oppDone ? 'Scoring…' : `Waiting on Table ${pad(game.opponent)}` }

  const aside = (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <ScoreTile label="You" value={score} unit={label} tone="gold-text" lead={lead} />
        <ScoreTile
          label={`Table ${pad(game.opponent)}`}
          value={oppScore}
          unit={oppDone ? 'final' : label}
          tone="text-[#ff7599]"
        />
      </div>

      <div className="panel space-y-3 px-4 py-3.5">
        <div>
          <div className="overline mb-1.5">Your run</div>
          <div className="fl-rail">
            <div className="fl-rail-fill fl-rail-you" style={{ width: `${Math.min(100, (score / total) * 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="overline mb-1.5">Table {pad(game.opponent)}</div>
          <div className="fl-rail">
            <div
              className="fl-rail-fill fl-rail-them"
              style={{ width: `${Math.min(100, (oppScore / total) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div
        className={`panel grid flex-1 place-items-center px-4 py-6 text-center ${
          phase === 'dead' ? 'border-neon/50!' : lead ? 'border-gold/50!' : ''
        }`}
      >
        <div>
          <div className="display text-[clamp(1.5rem,5vw,2.4rem)] leading-none">
            {phase === 'dead' ? (
              <span className="text-[#ff7599]">{status.head}</span>
            ) : (
              <span className="gold-text">{status.head}</span>
            )}
          </div>
          <div className="overline mt-2">{status.note}</div>
        </div>
      </div>
    </>
  )

  return (
    <GameFrame game={game} aside={aside}>
      <div ref={stageRef} className="fl-stage" onPointerDown={flap}>
        <canvas ref={canvasRef} className="fl-canvas" />

        {count >= 0 && (
          <div className="fl-veil fl-veil-dim">
            {count > 0 ? (
              <>
                <span className="fl-ring" />
                <span key={count} className="display fl-count tnum">
                  {count}
                </span>
              </>
            ) : (
              <span className="display fl-go gold-text">Go</span>
            )}
          </div>
        )}

        {count < 0 && phase === 'flying' && score === 0 && (
          <div className="fl-hint">
            <span className="overline">Tap anywhere to flap</span>
          </div>
        )}

        {phase === 'dead' && (
          <div className="fl-veil fl-veil-dim anim-fade-in">
            <div className="anim-slam">
              <div className="overline">{reason === 'cleared' ? 'Full course' : 'Bottle down'}</div>
              <div className="display fl-out mt-1">
                {reason === 'cleared' ? (
                  <span className="gold-text">Cleared</span>
                ) : (
                  <span className="text-[#ff7599]">You&rsquo;re out</span>
                )}
              </div>
              <div className="display tnum mt-4 text-[clamp(3rem,13cqw,7rem)] leading-none text-chalk">{score}</div>
              <div className="overline mt-1">{label} cleared</div>
              <div className="mt-5 text-sm text-dim">
                {oppDone
                  ? `Table ${pad(game.opponent)} finished on ${oppScore}`
                  : `Table ${pad(game.opponent)} is still flying — ${oppScore} so far`}
              </div>
            </div>
          </div>
        )}
      </div>
    </GameFrame>
  )
}
