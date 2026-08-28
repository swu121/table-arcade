import { useState } from 'react'
import { ItemIcon } from '../components/ItemIcon.jsx'
import { money, pad } from '../lib/format.js'

export function GiftSheet({ target, menu, onCancel, onSend }) {
  const [item, setItem] = useState(null)

  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-void/85 p-4 backdrop-blur-md">
      <div className="anim-sheet panel flex max-h-full w-full max-w-4xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-6">
          <div>
            <div className="overline">Sending to</div>
            <div className="display text-4xl leading-none">
              <span className="text-dim">Table</span> <span className="gold-text">{pad(target.number)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="overline">Your tab</div>
            <div className="display text-2xl leading-none text-chalk">{item ? money(item.price) : '—'}</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
          <div className="mb-3 overline">Pick something off the menu</div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {menu.map((option) => {
              const selected = item?.id === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setItem(option)}
                  className={`table-card flex flex-col items-center gap-2 px-2 py-4 text-center transition ${
                    selected ? 'border-gold! shadow-[0_0_0_1px_var(--color-gold)]' : ''
                  }`}
                >
                  <ItemIcon name={option.icon} size={40} />
                  <span className="text-[0.8rem] leading-tight font-semibold text-chalk">{option.name}</span>
                  <span className={`text-xs font-bold ${selected ? 'text-gold' : 'text-dim'}`}>
                    {money(option.price)}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="mt-4 text-xs text-dim">
            It goes straight to the bar and onto your tab — no waiting on them to accept.
          </p>
        </div>

        <div className="mt-6 flex shrink-0 gap-3 border-t border-edge bg-black/25 px-6 py-5">
          <button type="button" className="btn btn-ghost h-14 flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary h-14 flex-[2]"
            disabled={!item}
            onClick={() => onSend({ item: item.id })}
          >
            {item ? `Send Table ${pad(target.number)} a ${item.name}` : 'Pick an item'}
          </button>
        </div>
      </div>
    </div>
  )
}
