export function Mark({ size = 40, className = '' }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mk-slab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2a3c" />
          <stop offset="100%" stopColor="#101018" />
        </linearGradient>
        <radialGradient id="mk-gold" cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffe4a3" />
          <stop offset="45%" stopColor="#ffb627" />
          <stop offset="100%" stopColor="#b9700a" />
        </radialGradient>
        <radialGradient id="mk-neon" cx="34%" cy="28%">
          <stop offset="0%" stopColor="#ffa6bf" />
          <stop offset="45%" stopColor="#ff2e63" />
          <stop offset="100%" stopColor="#9e0a33" />
        </radialGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill="url(#mk-slab)" stroke="#3a3a52" strokeWidth="1.5" />
      <circle cx="16.5" cy="16.5" r="6.6" fill="url(#mk-gold)" />
      <circle cx="31.5" cy="16.5" r="6.6" fill="#06060a" />
      <circle cx="16.5" cy="31.5" r="6.6" fill="#06060a" />
      <circle cx="31.5" cy="31.5" r="6.6" fill="url(#mk-neon)" />
    </svg>
  )
}

export function Wordmark({ className = '', size = 'text-xl' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Mark size={32} />
      <div className={`display ${size} leading-none`}>
        <span className="text-chalk">Table</span> <span className="gold-text">Arcade</span>
      </div>
    </div>
  )
}
