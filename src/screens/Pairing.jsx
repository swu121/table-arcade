import { useState } from 'react'
import { Mark } from '../components/Logo.jsx'
import { TABLE_KEY } from '../socket.js'
import { pairDevice } from '../lib/device.js'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
const LENGTH = 6

// The screen a tablet lands on until staff have paired it: six boxes, the
// same keypad as table setup, and a code read off the staff screen. Nothing
// else is reachable from here — the socket is not connected.
export function Pairing({ onPaired }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const press = (key) => {
    if (busy) return
    setError('')
    if (key === 'clear') return setValue('')
    if (key === 'back') return setValue((v) => v.slice(0, -1))
    setValue((v) => (v + key).slice(0, LENGTH))
  }

  const submit = async () => {
    if (value.length !== LENGTH || busy) return
    setBusy(true)
    setError('')
    try {
      const table = Number(localStorage.getItem(TABLE_KEY)) || null
      await pairDevice(value, table ? `Table ${table}` : undefined)
      onPaired()
    } catch (err) {
      setError(err.message)
      setValue('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 mx-auto flex h-full w-full max-w-lg flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="anim-fade-up flex flex-col items-center gap-4">
        <Mark size={54} />
        <h1 className="display text-center text-[clamp(2.4rem,9vw,3.4rem)]">
          <span className="text-chalk">Table</span> <span className="gold-text">Arcade</span>
        </h1>
      </div>

      <div className="anim-fade-up panel w-full px-6 py-5 text-center" style={{ animationDelay: '80ms' }}>
        <div className="overline">Pair this tablet</div>
        <p className="mt-1 text-sm text-dim">Ask staff for a pairing code and type it in.</p>
        <div className="mt-4 flex justify-center gap-2" aria-label="Pairing code" role="group">
          {Array.from({ length: LENGTH }, (_, i) => {
            const digit = value[i] ?? ''
            const active = i === value.length && !busy
            return (
              <span
                key={i}
                className={`display tnum grid h-[clamp(3.6rem,11vw,4.6rem)] w-[clamp(2.6rem,8vw,3.4rem)] place-items-center rounded-2xl border text-[clamp(2rem,6.5vw,2.8rem)] leading-none ${
                  digit ? 'border-gold/60 bg-gold/10 gold-text' : active ? 'border-gold/40 bg-white/5 text-edge' : 'border-edge bg-white/[0.03] text-edge'
                }`}
              >
                {digit || '·'}
              </span>
            )
          })}
        </div>
        <div className="mt-3 h-5 text-xs font-semibold tracking-wide text-neon">{error}</div>
      </div>

      <div className="anim-fade-up grid w-full grid-cols-3 gap-2.5" style={{ animationDelay: '160ms' }}>
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={busy}
            className="key display grid h-[clamp(3.4rem,9vh,4.4rem)] place-items-center text-2xl"
            aria-label={key === 'back' ? 'Delete' : key === 'clear' ? 'Clear' : key}
          >
            {key === 'back' ? '⌫' : key === 'clear' ? 'C' : key}
          </button>
        ))}
      </div>

      <div className="anim-fade-up flex w-full gap-2.5" style={{ animationDelay: '240ms' }}>
        <button
          type="button"
          className="btn btn-primary h-14 flex-1 text-base"
          disabled={value.length !== LENGTH || busy}
          onClick={submit}
        >
          {busy ? 'Pairing…' : 'Pair this tablet'}
        </button>
      </div>

      <p className="text-center text-xs text-dim">
        Staff only. Codes come from the floor plan editor and last five minutes.
      </p>
    </div>
  )
}
