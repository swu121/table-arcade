import { useState } from 'react'
import { Mark } from '../components/Logo.jsx'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

export function Setup({ taken = [], onClaim, onCancel }) {
  const [value, setValue] = useState('')

  const number = Number(value)
  const isTaken = value !== '' && taken.includes(number)
  const valid = value !== '' && number >= 1 && number <= 99 && !isTaken

  const press = (key) => {
    if (key === 'clear') return setValue('')
    if (key === 'back') return setValue((v) => v.slice(0, -1))
    setValue((v) => (v + key).replace(/^0+/, '').slice(0, 2))
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
        <div className="overline">Assign this tablet to a table</div>
        <div
          className={`display tnum mt-1 text-[clamp(4rem,18vw,6rem)] leading-none ${
            value ? 'gold-text' : 'text-edge'
          }`}
        >
          {value || '00'}
        </div>
        <div className="mt-1 h-5 text-xs font-semibold tracking-wide text-neon">
          {isTaken ? `Table ${number} is already in play` : ''}
        </div>
      </div>

      <div className="anim-fade-up grid w-full grid-cols-3 gap-2.5" style={{ animationDelay: '160ms' }}>
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="key display grid h-[clamp(3.4rem,9vh,4.4rem)] place-items-center text-2xl"
            aria-label={key === 'back' ? 'Delete' : key === 'clear' ? 'Clear' : key}
          >
            {key === 'back' ? '⌫' : key === 'clear' ? 'C' : key}
          </button>
        ))}
      </div>

      <div className="anim-fade-up flex w-full gap-2.5" style={{ animationDelay: '240ms' }}>
        {onCancel && (
          <button type="button" className="btn btn-ghost h-14 flex-1 text-base" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary h-14 flex-[2] text-base"
          disabled={!valid}
          onClick={() => onClaim(number)}
        >
          Assign this table
        </button>
      </div>

      <p className="text-center text-xs text-dim">
        Staff only. This device stays Table {value || '—'} until someone changes it.
      </p>
    </div>
  )
}
