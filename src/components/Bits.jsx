import { useEffect, useMemo, useState } from 'react'

export function Backdrop() {
  return (
    <div className="aurora" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}

const STATUS = {
  idle: { label: 'Open', chip: 'chip-open' },
  playing: { label: 'In a game', chip: 'chip-busy' },
  challenging: { label: 'Challenging', chip: 'chip-wait' },
  challenged: { label: 'Deciding', chip: 'chip-wait' }
}

export function TableCard({ table, onChallenge, index = 0, enabled }) {
  const open = table.status === 'idle'
  const meta = STATUS[table.status] ?? STATUS.playing
  const pickable = enabled ?? open

  return (
    <button
      type="button"
      data-open={open}
      disabled={!pickable}
      onClick={onChallenge}
      style={{ animationDelay: `${index * 45}ms` }}
      className="table-card flex flex-col items-start gap-2 p-4 text-left disabled:cursor-not-allowed"
    >
      <span className="overline">Table</span>
      <span className="display tnum text-[clamp(2.4rem,6vw,3.6rem)] text-chalk">
        {String(table.number).padStart(2, '0')}
      </span>
      <span className={`chip ${meta.chip}`}>
        <span className={`dot ${open ? 'dot-live' : ''}`} />
        {meta.label}
      </span>
    </button>
  )
}

export function CountdownRing({ expiresAt, duration = 30_000, size = 92 }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  const remaining = Math.max(0, expiresAt - now)
  const frac = Math.max(0, Math.min(1, remaining / duration))
  const seconds = Math.ceil(remaining / 1000)
  const radius = size / 2 - 6
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={frac < 0.3 ? 'var(--color-neon)' : 'var(--color-gold)'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 120ms linear' }}
        />
      </svg>
      <span className="display tnum absolute inset-0 grid place-items-center text-2xl text-chalk">{seconds}</span>
    </div>
  )
}

const CONFETTI_COLORS = ['#ffb627', '#ff2e63', '#16e0bd', '#f7f5f0']

export function Confetti({ count = 52 }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2
        const distance = 150 + Math.random() * 300
        return {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 70,
          rot: `${Math.random() * 900 - 450}deg`,
          delay: Math.random() * 240,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
        }
      }),
    [count]
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {bits.map((bit, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            background: bit.color,
            '--dx': `${bit.dx}px`,
            '--dy': `${bit.dy}px`,
            '--rot': bit.rot,
            animationDelay: `${bit.delay}ms`
          }}
        />
      ))}
    </div>
  )
}

export function Toast({ toast }) {
  if (!toast) return null
  const bad = toast.tone === 'bad'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        className={`anim-fade-up panel flex items-center gap-3 px-5 py-3 text-sm font-semibold ${
          bad ? 'text-[#ff7599]' : 'text-mint'
        }`}
      >
        <span className="dot" />
        {toast.message}
      </div>
    </div>
  )
}

export function OfflineBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-neon/90 py-1.5 text-center text-[0.7rem] font-bold tracking-[0.2em] text-[#2a0110] uppercase">
      Reconnecting
    </div>
  )
}
