import { useState } from 'react'
import { ItemIcon } from '../components/ItemIcon.jsx'
import { GameIcon } from '../components/GameIcon.jsx'
import { money, pad } from '../lib/format.js'

function Step({ index, label }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-raised text-[0.7rem] font-bold text-gold">
        {index}
      </span>
      <span className="overline">{label}</span>
    </div>
  )
}

export function WagerSheet({ target, menu, games, onCancel, onSend }) {
  const [game, setGame] = useState(null)
  const [item, setItem] = useState(null)

  const cta = !game ? 'Pick a game first' : !item ? 'Now pick the stake' : `Play ${game.name} for ${item.name}`

  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-void/85 p-4 backdrop-blur-md">
      <div className="anim-sheet panel flex max-h-full w-full max-w-4xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-6">
          <div>
            <div className="overline">Challenging</div>
            <div className="display text-4xl leading-none">
              <span className="text-dim">Table</span> <span className="gold-text">{pad(target.number)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="overline">Stake</div>
            <div className="display text-2xl leading-none text-chalk">
              {item ? money(item.price) : '—'}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
          <Step index={1} label="What are you playing?" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {games.map((option) => {
              const selected = game?.id === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setGame(option)}
                  className={`table-card flex flex-col items-center gap-2 px-3 py-4 text-center transition ${
                    selected ? 'border-gold! shadow-[0_0_0_1px_var(--color-gold)]' : ''
                  }`}
                >
                  <GameIcon name={option.id} size={40} />
                  <span className="display text-lg leading-none text-chalk">{option.name}</span>
                  <span className="text-[0.7rem] leading-tight text-dim">{option.tagline}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-6">
            <Step index={2} label="What are you playing for?" />
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
          </div>
        </div>

        <div className="mt-6 flex shrink-0 gap-3 border-t border-edge bg-black/25 px-6 py-5">
          <button type="button" className="btn btn-ghost h-14 flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary h-14 flex-[2]"
            disabled={!game || !item}
            onClick={() => onSend({ gameType: game.id, item: item.id })}
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  )
}
