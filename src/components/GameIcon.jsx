const GOLD = 'var(--color-gold, #ffb627)'
const CHALK = 'var(--color-chalk, #f7f5f0)'

function Connect4({ a, b }) {
  const holes = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const filled = (r === 2 && c < 3) || (r === 1 && c === 1)
      holes.push(
        <circle
          key={`${r}-${c}`}
          cx={8.4 + c * 5.1}
          cy={13.2 + r * 5.1}
          r="1.9"
          fill={filled ? a : b}
          opacity={filled ? 1 : 0.22}
        />
      )
    }
  }
  return (
    <>
      <rect x="4.6" y="9.4" width="22.8" height="18.2" rx="2.6" fill={b} opacity="0.16" stroke={b} strokeWidth="1.3" />
      <circle cx="13.5" cy="5.4" r="2.4" fill={a} />
      {holes}
    </>
  )
}

function BeerPong({ a, b }) {
  const cups = []
  const rows = [3, 2, 1]
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const x = 16 + (i - (count - 1) / 2) * 6.2
      const y = 15.6 + row * 5.4
      cups.push(
        <path
          key={`${row}-${i}`}
          d={`M${x - 2.7} ${y - 2.4}h5.4l-.85 5a1.6 1.6 0 0 1-1.6 1.3h-.5a1.6 1.6 0 0 1-1.6-1.3Z`}
          fill={a}
          opacity={row === 0 ? 1 : 0.82}
        />
      )
    }
  })
  return (
    <>
      <ellipse cx="16" cy="28.4" rx="12.6" ry="2.4" fill={b} opacity="0.14" />
      {cups}
      <circle cx="24.4" cy="6.6" r="3" fill={b} />
      <path d="M6 12.4c3-6 8.4-8.4 14.6-7.2" stroke={b} strokeWidth="1.3" fill="none" strokeDasharray="2 2.2" opacity="0.5" />
    </>
  )
}

function Flappy({ a, b }) {
  return (
    <g transform="rotate(-16 16 16)">
      <rect x="12.7" y="4.4" width="6.6" height="4.6" rx="1.2" fill={b} opacity="0.75" />
      <path d="M13 8.6h6l1.9 4.4v11.2a3.2 3.2 0 0 1-3.2 3.2h-3.4a3.2 3.2 0 0 1-3.2-3.2V13Z" fill={a} />
      <rect x="11.4" y="16.2" width="9.2" height="6" rx="1.1" fill={b} />
      <rect x="13.1" y="2.4" width="5.8" height="2.6" rx="1.1" fill={b} />
      <path d="M14.2 10.2h1.5v3.4h-1.5Z" fill={b} opacity="0.4" />
    </g>
  )
}

function Stacker({ a, b }) {
  return (
    <>
      <rect x="6.4" y="23.6" width="19.2" height="4.4" rx="1.1" fill={a} />
      <rect x="9.6" y="18.2" width="12.8" height="4.4" rx="1.1" fill={a} opacity="0.85" />
      <rect x="12.8" y="12.8" width="6.4" height="4.4" rx="1.1" fill={a} opacity="0.7" />
      <rect x="16" y="7.4" width="6.4" height="4.4" rx="1.1" fill={b} />
      <path d="M24.6 9.6h3.8M4 9.6h3.8" stroke={b} strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
    </>
  )
}

const ICONS = {
  connect4: Connect4,
  beerpong: BeerPong,
  flappy: Flappy,
  stacker: Stacker
}

export function GameIcon({ name, size = 32, a = GOLD, b = CHALK, className = '' }) {
  const Glyph = ICONS[name] ?? Connect4
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <Glyph a={a} b={b} />
    </svg>
  )
}
