import { useEffect, useState } from 'react'
import { ItemIcon } from '../components/ItemIcon.jsx'
import { Wordmark } from '../components/Logo.jsx'
import { money, pad, timeAgo } from '../lib/format.js'

function Stat({ value, label, tone = 'text-chalk' }) {
  return (
    <div className="panel px-5 py-3 text-center">
      <div className={`display tnum text-4xl leading-none ${tone}`}>{value}</div>
      <div className="overline mt-1.5">{label}</div>
    </div>
  )
}

function TicketRow({ ticket, onDeliver, index }) {
  const done = ticket.status === 'delivered'

  return (
    <li
      className={`panel anim-fade-up flex items-center gap-5 px-5 py-4 ${done ? 'opacity-45' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <ItemIcon name={ticket.item.icon} size={48} />

      <div className="min-w-0 flex-1">
        <div className="display truncate text-2xl text-chalk">{ticket.item.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim">
          <span>
            Charge <span className="font-bold text-neon">Table {pad(ticket.owingTable)}</span>
          </span>
          <span className="text-edge">→</span>
          <span>
            Deliver to <span className="font-bold text-mint">Table {pad(ticket.owedToTable)}</span>
          </span>
          <span className="text-edge">·</span>
          <span>{money(ticket.item.price)}</span>
          <span className="text-edge">·</span>
          <span>{ticket.gameName ?? 'Gift'}</span>
        </div>
      </div>

      <div className="shrink-0 text-right text-xs text-dim">{timeAgo(ticket.createdAt)}</div>

      {done ? (
        <span className="chip chip-open shrink-0">Delivered</span>
      ) : (
        <button type="button" className="btn btn-primary h-12 shrink-0 px-5" onClick={() => onDeliver(ticket.id)}>
          Mark delivered
        </button>
      )}
    </li>
  )
}

export function Staff({ tickets, onDeliver, nav }) {
  // Re-render on a slow tick so the "2m ago" stamps stay honest.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const open = tickets.filter((t) => t.status !== 'delivered')
  const delivered = tickets.filter((t) => t.status === 'delivered')
  const owed = open.reduce((sum, t) => sum + t.item.price, 0)

  return (
    <div className="relative z-10 flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="chip chip-busy">
            <span className="dot dot-live" />
            Staff
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Stat value={open.length} label="To run" tone={open.length ? 'text-gold' : 'text-edge'} />
          <Stat value={money(owed)} label="On tabs" tone="text-mint" />
          {nav}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <h2 className="display text-[clamp(2rem,5.5vw,3rem)]">Open tickets</h2>
        <p className="mt-1.5 text-sm text-dim">
          Ring the item to the charged table&apos;s tab, then run it to the table it&apos;s owed to.
        </p>

        {open.length === 0 ? (
          <div className="panel anim-fade-up mt-5 grid place-items-center px-6 py-16 text-center">
            <div className="display text-3xl text-edge">All caught up</div>
            <p className="mt-2 max-w-sm text-sm text-dim">
            Tickets land here the second a game is won or a table sends a gift.
          </p>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-2.5">
            {open.map((ticket, i) => (
              <TicketRow key={ticket.id} ticket={ticket} onDeliver={onDeliver} index={i} />
            ))}
          </ul>
        )}

        {delivered.length > 0 && (
          <>
            <div className="overline mt-9 mb-3">Delivered</div>
            <ul className="flex flex-col gap-2.5">
              {delivered.map((ticket, i) => (
                <TicketRow key={ticket.id} ticket={ticket} onDeliver={onDeliver} index={i} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
