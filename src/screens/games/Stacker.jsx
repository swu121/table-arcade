import '../../styles/stacker.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameFrame, ScoreTile } from '../../components/GameChrome.jsx'
import { pad } from '../../lib/format.js'

const GO_MS = 560

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

function BlockGroup({ left, width, cols, className, style }) {
  return (
    <div
      className={`stk-group ${className ?? ''}`}
      style={{ left: `${(left * 100) / cols}%`, width: `${(width * 100) / cols}%`, ...style }}
    >
      {Array.from({ length: width }, (_, i) => (
        <span key={i} className="stk-block" style={{ left: `${(i * 100) / width}%`, width: `${100 / width}%` }} />
      ))}
    </div>
  )
}

export function Stacker({ game, act, onExit }) {
  const { course, startsAt, scoreLabel } = game.state
  const { rows, cols, height } = course

  const firstWidth = Math.min(cols, rows[0].width)

  const [stack, setStack] = useState([])
  const [width, setWidth] = useState(firstWidth)
  const [pos, setPos] = useState(() => clamp(rows[0].start, 0, cols - firstWidth))
  const [chops, setChops] = useState([])
  const [outcome, setOutcome] = useState(null)
  const [count, setCount] = useState(null)

  const stackRef = useRef(stack)
  const widthRef = useRef(width)
  const posRef = useRef(pos)
  const overRef = useRef(false)
  const rowStartRef = useRef(startsAt)
  const startedRef = useRef(false)
  const goAtRef = useRef(0)
  const chopSeq = useRef(0)

  const serverDone = game.state.you?.done ?? false
  const oppScore = game.state.opponent?.score ?? 0
  const oppDone = game.state.opponent?.done ?? false

  // A remount mid-run (reconnect) can't rebuild the tower, but it must not keep
  // sending scores the server has already closed out.
  useEffect(() => {
    if (serverDone) overRef.current = true
  }, [serverDone])

  const lock = useCallback(() => {
    if (overRef.current || !startedRef.current || game.opponentGone) return

    const i = stackRef.current.length
    const w = widthRef.current
    const left = posRef.current
    const below = i === 0 ? { left: 0, width: cols } : stackRef.current[i - 1]

    const keepLeft = Math.max(left, below.left)
    const keepRight = Math.min(left + w, below.left + below.width)
    const keepWidth = Math.max(0, keepRight - keepLeft)

    const dropped = []
    for (let c = left; c < left + w; c++) {
      if (c < keepLeft || c >= keepRight) {
        dropped.push({ id: `c${chopSeq.current++}`, row: i, col: c, dir: c < keepLeft ? -1 : 1 })
      }
    }
    if (dropped.length) setChops((prev) => [...prev, ...dropped])

    if (keepWidth === 0) {
      overRef.current = true
      setOutcome('bust')
      act({ type: 'done', score: i })
      return
    }

    const next = [...stackRef.current, { left: keepLeft, width: keepWidth }]
    stackRef.current = next
    setStack(next)

    if (next.length >= height) {
      overRef.current = true
      setOutcome('top')
      act({ type: 'done', score: height })
      return
    }

    act({ type: 'progress', score: next.length })

    const nextRow = rows[next.length]
    const nextWidth = Math.min(keepWidth, nextRow.width)
    const nextPos = clamp(nextRow.start, 0, cols - nextWidth)
    widthRef.current = nextWidth
    posRef.current = nextPos
    rowStartRef.current = Date.now()
    setWidth(nextWidth)
    setPos(nextPos)
  }, [act, cols, height, rows, game.opponentGone])

  useEffect(() => {
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const now = Date.now()

      if (now < startsAt) {
        // The server's lead-in is a shade over 3s; hold on "3" rather than flash a 4.
        setCount(clamp(Math.ceil((startsAt - now) / 1000), 1, 3))
        return
      }
      if (!startedRef.current) {
        startedRef.current = true
        rowStartRef.current = startsAt
        goAtRef.current = now
        setCount('go')
      }
      if (goAtRef.current && now - goAtRef.current > GO_MS) {
        goAtRef.current = 0
        setCount(null)
      }

      if (overRef.current || game.opponentGone) return

      const row = rows[stackRef.current.length]
      if (!row) return

      const span = cols - widthRef.current
      let p = 0
      if (span > 0) {
        const steps = Math.floor((now - rowStartRef.current) / row.speed) + clamp(row.start, 0, span)
        const m = ((steps % (2 * span)) + 2 * span) % (2 * span)
        p = m <= span ? m : 2 * span - m
      }
      posRef.current = p
      setPos(p)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [startsAt, cols, rows, game.opponentGone])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      e.preventDefault()
      lock()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lock])

  const youScore = Math.max(stack.length, game.state.you?.score ?? 0)
  const done = outcome !== null || serverDone
  const playing = startedRef.current && !done && count !== 'go'
  const slideMs = Math.min(120, Math.round((rows[stack.length]?.speed ?? 200) * 0.55))
  const tierRows = useMemo(() => new Set(rows.map((r, i) => (i > 0 && r.width !== rows[i - 1].width ? i : -1))), [rows])

  const aside = (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
        <ScoreTile label="Your tower" value={youScore} unit={scoreLabel} tone="gold-text" lead={youScore >= oppScore} />
        <ScoreTile
          label={`Table ${pad(game.opponent)}`}
          value={oppScore}
          unit={oppDone ? `${scoreLabel} · final` : scoreLabel}
          tone="text-neon"
          lead={oppScore > youScore}
        />
      </div>

      <div
        className={`panel flex flex-1 flex-col items-center justify-center gap-3 px-4 py-5 text-center ${
          done ? '' : 'border-gold/45!'
        }`}
      >
        {done ? (
          <>
            <div className="display text-[clamp(1.5rem,5vw,2.4rem)] leading-none">
              {outcome === 'top' ? (
                <span className="gold-text">Topped out</span>
              ) : (
                <span className="text-neon">Tower down</span>
              )}
            </div>
            <div className="overline">
              {youScore} {scoreLabel} climbed
            </div>
            <p className="text-xs leading-relaxed text-dim">
              {oppDone
                ? 'Both towers are in. Settling the tab…'
                : `Waiting on Table ${pad(game.opponent)} — they're on ${oppScore}.`}
            </p>
          </>
        ) : (
          <>
            <div className="display text-4xl leading-none text-chalk">
              <span className="tnum">{width}</span> <span className="text-dim">{width === 1 ? 'block' : 'blocks'}</span>
            </div>
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: firstWidth }, (_, i) => (
                <span key={i} className="stk-pip" data-on={i < width} />
              ))}
            </div>
            <div className="overline">{playing ? 'Tap anywhere to lock' : 'Get ready'}</div>
            {oppDone && (
              <p className="text-xs leading-relaxed text-dim">
                Table {pad(game.opponent)} finished on {oppScore}. Beat it.
              </p>
            )}
          </>
        )}
      </div>
    </>
  )

  return (
    <GameFrame game={game} aside={aside} onExit={onExit}>
      <div className="stk-cabinet" onPointerDown={lock}>
        <div className="stk-crown" data-lit={outcome === 'top'}>
          <span className="overline leading-none">Top out</span>
          <span className={`display stk-crown-name text-base ${outcome === 'top' ? 'gold-text' : 'text-chalk/70'}`}>
            {game.item.name}
          </span>
          <span className="overline tnum leading-none">{height} rows</span>
        </div>

        <div className="stk-body">
          <div className="stk-tower">
            {rows.map((_, r) => (
              <div key={r} className="stk-row" data-tier={tierRows.has(r)}>
                <div className="stk-wells" style={{ '--cols': cols }}>
                  {Array.from({ length: cols }, (_, c) => (
                    <span key={c} className="stk-well" />
                  ))}
                </div>

                {r < stack.length && (
                  <BlockGroup
                    key={`set-${r}`}
                    left={stack[r].left}
                    width={stack[r].width}
                    cols={cols}
                    className="stk-group-set"
                  />
                )}

                {r === stack.length && !done && startedRef.current && (
                  <BlockGroup
                    key={`live-${r}`}
                    left={pos}
                    width={width}
                    cols={cols}
                    className="stk-group-live"
                    style={{ transitionDuration: `${slideMs}ms` }}
                  />
                )}

                {chops
                  .filter((chop) => chop.row === r)
                  .map((chop) => (
                    <span
                      key={chop.id}
                      className="stk-chop"
                      style={{
                        left: `${(chop.col * 100) / cols}%`,
                        width: `${100 / cols}%`,
                        '--dx': `${chop.dir * 120}%`,
                        '--rot': `${chop.dir * 90}deg`
                      }}
                      onAnimationEnd={() => setChops((prev) => prev.filter((x) => x.id !== chop.id))}
                    />
                  ))}
              </div>
            ))}

            {oppScore > 0 && (
              <div className="stk-oppline" style={{ bottom: `${(Math.min(oppScore, height) * 100) / height}%` }} />
            )}
          </div>

          <div className="stk-gauge">
            {Array.from({ length: height }, (_, i) => (
              <span key={i} className="stk-tick" data-on={i < oppScore} data-head={!oppDone && i === oppScore - 1} />
            ))}
          </div>
        </div>

        {count !== null && (
          <div className="stk-count anim-fade-in" data-go={count === 'go'}>
            <div key={String(count)} className="display stk-count-num anim-slam gold-text">
              {count === 'go' ? 'Go' : count}
            </div>
            <div className="overline mt-3">{count === 'go' ? 'Climb' : `Table ${pad(game.opponent)} is ready`}</div>
          </div>
        )}

        {done && (
          <div className="stk-stamp anim-slam">
            <div className={`display stk-stamp-text ${outcome === 'top' ? 'gold-text' : 'text-neon'}`}>
              {outcome === 'top' ? 'Topped out' : 'Tower down'}
            </div>
            <div className="overline mt-2">
              {youScore} {scoreLabel}
            </div>
          </div>
        )}
      </div>
    </GameFrame>
  )
}
