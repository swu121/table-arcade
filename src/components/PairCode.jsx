import { useEffect, useState } from 'react'
import { socket } from '../socket.js'

const CODE_TTL = 5 * 60_000

function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [expiresAt])
  return Math.max(0, (expiresAt ?? 0) - now)
}

// The "Pair a tablet" button and the sheet it opens: one six-digit code, big
// enough to read from across the pass, with how long it has left. The server
// mints it; the sheet only shows it.
export function PairCodeButton({ className = 'btn btn-ghost h-11 px-4 text-xs' }) {
  const [open, setOpen] = useState(false)
  const [issued, setIssued] = useState(null)

  useEffect(() => {
    const onCode = (payload) => setIssued(payload)
    socket.on('staff:pairCode', onCode)
    return () => socket.off('staff:pairCode', onCode)
  }, [])

  const request = () => {
    setIssued(null)
    setOpen(true)
    socket.emit('staff:pairCode')
  }

  return (
    <>
      <button type="button" className={className} onClick={request}>
        Pair a tablet
      </button>
      {open && <PairCodeSheet issued={issued} onAgain={() => socket.emit('staff:pairCode')} onClose={() => setOpen(false)} />}
    </>
  )
}

function PairCodeSheet({ issued, onAgain, onClose }) {
  const remaining = useCountdown(issued?.expiresAt)
  const expired = Boolean(issued) && remaining <= 0
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  const frac = issued ? remaining / CODE_TTL : 0

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-6" onClick={onClose}>
      <div className="anim-fade-up panel w-full max-w-md px-8 py-7 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="overline">Pairing code</div>
        <p className="mt-1 text-sm text-dim">On the new tablet, open this venue&apos;s address and type this in.</p>

        <div className={`display tnum mt-5 flex justify-center gap-1.5 ${expired ? 'text-edge' : 'gold-text'}`}>
          {(issued?.code ?? '······').split('').map((digit, i) => (
            <span key={i} className={`text-[clamp(3rem,10vw,4.6rem)] leading-none ${i === 3 ? 'ml-4' : ''}`}>
              {digit}
            </span>
          ))}
        </div>

        <div className="mx-auto mt-5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${frac < 0.25 ? 'bg-neon' : 'bg-gold'}`}
            style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, transition: 'width 250ms linear' }}
          />
        </div>
        <div className="tnum mt-2 text-xs font-semibold tracking-wide text-dim">
          {!issued ? 'Asking the server…' : expired ? 'This code has expired' : `Works once · expires in ${minutes}:${String(seconds).padStart(2, '0')}`}
        </div>

        <div className="mt-6 flex gap-2.5">
          <button type="button" className="btn btn-ghost h-12 flex-1 text-xs" onClick={onAgain}>
            New code
          </button>
          <button type="button" className="btn btn-primary h-12 flex-1 text-xs" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
