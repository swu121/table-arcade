import { ItemIcon } from './ItemIcon.jsx'
import { ActivityRow } from './TableInsight.jsx'
import { money, pad } from '../lib/format.js'

function Stat({ value, label, tone = 'text-chalk' }) {
  return (
    <div className="panel px-4 py-3">
      <div className={`display tnum text-3xl leading-none ${tone}`}>{value}</div>
      <div className="overline mt-1">{label}</div>
    </div>
  )
}

// Everything the wipe is about to take, shown before it happens: a cleared
// table cannot be undone, and the number alone is far too easy to misread.
export function ClearTableDialog({ number, info, tickets, onCancel, onConfirm }) {
  const mine = tickets
    .filter((t) => t.owingTable === number || t.owedToTable === number)
    .sort((a, b) => b.createdAt - a.createdAt)
  const spend = mine.filter((t) => t.owingTable === number).reduce((sum, sale) => sum + sale.item.price, 0)
  const open = mine.filter((t) => t.status !== 'delivered').length
  const history = info?.history ?? []

  return (
    <div className="anim-fade-in fixed inset-0 z-50 grid place-items-center bg-void/85 p-4 backdrop-blur-md">
      <div className="anim-sheet panel flex max-h-full w-full max-w-3xl flex-col overflow-hidden">
        <div className="shrink-0 px-6 pt-6">
          <div className="overline">Clearing</div>
          <div className="display text-4xl leading-none">
            <span className="text-dim">Table</span> <span className="gold-text">{pad(number)}</span>
          </div>
          <p className="mt-2 text-sm text-dim">
            Wipes everything below — messages, tickets and activity — as if nobody had sat here tonight. It cannot be
            undone. The table stays on the floor plan.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
          <div className="grid grid-cols-3 gap-2.5">
            <Stat value={money(spend)} label="On their tab" tone="text-mint" />
            <Stat value={mine.length} label={mine.length === 1 ? 'Ticket' : 'Tickets'} />
            <Stat value={history.length} label="Activity entries" />
          </div>
          {open > 0 && (
            <div className="mt-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-bold text-gold">
              {open} {open === 1 ? 'ticket has' : 'tickets have'} not been run yet. Clearing drops {open === 1 ? 'it' : 'them'} from the staff queue.
            </div>
          )}

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <div className="panel p-3">
              <div className="overline mb-2">Tickets</div>
              {mine.length === 0 ? (
                <p className="text-xs text-dim">Nothing on this tab.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mine.map((ticket) => (
                    <li key={ticket.id} className="flex items-center gap-2">
                      <ItemIcon name={ticket.item.icon} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-chalk">{ticket.item.name}</span>
                        <span className="block text-[0.65rem] text-dim">
                          {ticket.owingTable === number
                            ? `charged · to Table ${ticket.owedToTable}`
                            : `paid by Table ${ticket.owingTable}`}
                          {ticket.status === 'delivered' ? ' · run' : ' · open'}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-xs text-dim">{money(ticket.item.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel p-3">
              <div className="overline mb-1">Activity</div>
              {history.length === 0 ? (
                <p className="text-xs text-dim">Nothing yet tonight.</p>
              ) : (
                <ul className="divide-y divide-edge/40">
                  {history.map((entry) => (
                    <ActivityRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-3 px-6 py-5">
          <button type="button" className="btn btn-ghost h-14 flex-1 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger h-14 flex-1 text-sm" onClick={onConfirm}>
            Clear Table {pad(number)}
          </button>
        </div>
      </div>
    </div>
  )
}
