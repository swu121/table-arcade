const GOLD = 'var(--color-gold, #ffb627)'
const CHALK = 'var(--color-chalk, #f7f5f0)'

function Beer({ a, b }) {
  return (
    <>
      <circle cx="11.5" cy="9.6" r="3.2" fill={b} />
      <circle cx="16" cy="8.6" r="3.7" fill={b} />
      <circle cx="20.5" cy="9.6" r="3.2" fill={b} />
      <rect x="8.4" y="9.4" width="15.2" height="3.4" rx="1.5" fill={b} />
      <path d="M9 12.6h14l-1.5 13.6a2.5 2.5 0 0 1-2.5 2.2h-6a2.5 2.5 0 0 1-2.5-2.2Z" fill={a} />
      <circle cx="13.4" cy="17.6" r="1.25" fill={b} opacity="0.45" />
      <circle cx="18.2" cy="21.4" r="1.05" fill={b} opacity="0.35" />
    </>
  )
}

function Shot({ a, b }) {
  return (
    <>
      <path
        d="M11 10h10l-1.3 14a2.4 2.4 0 0 1-2.4 2.2h-2.6a2.4 2.4 0 0 1-2.4-2.2Z"
        fill={b}
        opacity="0.16"
        stroke={b}
        strokeWidth="1.4"
      />
      <path d="M12.5 16h7l-.78 8a2.4 2.4 0 0 1-2.4 2.2h-.64a2.4 2.4 0 0 1-2.4-2.2Z" fill={a} />
      <rect x="10.2" y="8.4" width="11.6" height="2.4" rx="1.2" fill={b} />
    </>
  )
}

function Pitcher({ a, b }) {
  return (
    <>
      <path d="M6.6 10.6 4 12.3l2.6 1.9Z" fill={b} />
      <path d="M21.4 14.4a5 5 0 0 1 0 8.4" stroke={b} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M7.4 11h13.4l-1.4 15a2.6 2.6 0 0 1-2.6 2.3h-5.4a2.6 2.6 0 0 1-2.6-2.3Z" fill={a} />
      <rect x="6.7" y="8.5" width="14.8" height="2.9" rx="1.45" fill={b} />
      <circle cx="11.6" cy="16.4" r="1.2" fill={b} opacity="0.4" />
    </>
  )
}

function Cocktail({ a, b }) {
  return (
    <>
      <path
        d="M9.6 11h12.8l-1.2 13.8a2.6 2.6 0 0 1-2.6 2.3h-5.2a2.6 2.6 0 0 1-2.6-2.3Z"
        fill={b}
        opacity="0.14"
        stroke={b}
        strokeWidth="1.4"
      />
      <path d="M11 17.2h10l-.76 7.6a2.6 2.6 0 0 1-2.6 2.3h-4a2.6 2.6 0 0 1-2.6-2.3Z" fill={a} />
      <rect
        x="13.3"
        y="12.9"
        width="5.6"
        height="5.6"
        rx="1.3"
        fill={b}
        opacity="0.8"
        transform="rotate(15 16.1 15.7)"
      />
      <rect x="8.6" y="9.1" width="14.8" height="2.5" rx="1.25" fill={b} />
    </>
  )
}

function Wings({ a, b }) {
  return (
    <g transform="rotate(-18 16 16)">
      <rect x="14.2" y="14.4" width="3.6" height="8.6" rx="0.8" fill={b} />
      <circle cx="13.9" cy="24" r="2.9" fill={b} />
      <circle cx="18.1" cy="24" r="2.9" fill={b} />
      <ellipse cx="16" cy="11.4" rx="6.9" ry="7.2" fill={a} />
      <ellipse cx="13.1" cy="8.9" rx="1.9" ry="1.3" fill={b} opacity="0.34" transform="rotate(-32 13.1 8.9)" />
    </g>
  )
}

function Nachos({ a, b }) {
  return (
    <>
      <path d="M12.6 18 7.6 6.2 17.4 10.6Z" fill={a} />
      <path d="M19.8 18 25.2 7.4 15.2 11.2Z" fill={a} opacity="0.72" />
      <path d="M4.4 17.2h23.2a1 1 0 0 1 .95 1.3C27.1 24.1 22 27.9 16 27.9S4.9 24.1 3.45 18.5a1 1 0 0 1 .95-1.3Z" fill={b} />
      <circle cx="12.3" cy="21.8" r="1.5" fill={a} />
      <circle cx="18.7" cy="22.6" r="1.3" fill={a} opacity="0.8" />
    </>
  )
}

function Burger({ a, b }) {
  return (
    <>
      <path d="M5.4 14.6a10.6 8.7 0 0 1 21.2 0Z" fill={a} />
      <ellipse cx="11.4" cy="11.4" rx="1.6" ry="1.05" fill={b} opacity="0.9" />
      <ellipse cx="16" cy="9.8" rx="1.6" ry="1.05" fill={b} opacity="0.9" />
      <ellipse cx="20.6" cy="11.4" rx="1.6" ry="1.05" fill={b} opacity="0.9" />
      <rect x="4.6" y="15.3" width="22.8" height="4.5" rx="2.25" fill={b} />
      <path d="M5.4 20.4h21.2v2.5a4.1 4.1 0 0 1-4.1 4.1H9.5a4.1 4.1 0 0 1-4.1-4.1Z" fill={a} />
    </>
  )
}

function Fries({ a, b }) {
  return (
    <>
      <rect x="10" y="8.2" width="2.9" height="10" rx="1.45" fill={a} transform="rotate(-13 11.4 13.2)" />
      <rect x="13.5" y="6.2" width="2.9" height="12" rx="1.45" fill={a} transform="rotate(-4 15 12.2)" />
      <rect x="16.9" y="6.6" width="2.9" height="11.6" rx="1.45" fill={a} transform="rotate(6 18.3 12.4)" />
      <rect x="20" y="8.6" width="2.9" height="9.8" rx="1.45" fill={a} transform="rotate(14 21.4 13.5)" />
      <path d="M9.2 17.6h13.6l-1.5 9.6a2.4 2.4 0 0 1-2.4 2.1h-5.8a2.4 2.4 0 0 1-2.4-2.1Z" fill={b} />
      <rect x="8.5" y="16.4" width="15" height="2.8" rx="1.4" fill={b} />
    </>
  )
}

const ICONS = {
  beer: Beer,
  shot: Shot,
  pitcher: Pitcher,
  cocktail: Cocktail,
  wings: Wings,
  nachos: Nachos,
  burger: Burger,
  fries: Fries
}

export function ItemIcon({ name, size = 32, a = GOLD, b = CHALK, className = '' }) {
  const Glyph = ICONS[name] ?? Beer
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <Glyph a={a} b={b} />
    </svg>
  )
}
