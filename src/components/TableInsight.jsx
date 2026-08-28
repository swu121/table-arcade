import { ItemIcon } from './ItemIcon.jsx'
import { money, timeAgo } from '../lib/format.js'

const STATUS = {
  idle: { label: 'On the floor', chip: 'chip-open' },
  playing: { label: 'In a game', chip: 'chip-busy' },
  challenging: { label: 'Challenging', chip: 'chip-wait' },
  challenged: { label: 'Challenged', chip: 'chip-wait' },
  gone: { label: 'Tablet offline', chip: '' }
}

function describe(entry) {
  const other = entry.otherTable ?? entry.opponent
  switch (entry.kind) {
    case 'seated':
      return 'Claimed the tablet'
    case 'returned':
      return 'Came back online'
    case 'left':
      return 'Tablet went offline'
    case 'challenge':
      return entry.direction === 'out'
        ? `Challenged Table ${other} to ${entry.gameName}`
        : `Challenged by Table ${other} at ${entry.gameName}`
    case 'challengeEnded':
      return `Challenge with Table ${other} ${entry.reason}`
    case 'gameStart':
      return `Started ${entry.gameName} against Table ${other}`
    case 'result':
      if (entry.outcome === 'draw') return `Drew ${entry.gameName} with Table ${other}`
      return `${entry.outcome === 'won' ? 'Beat' : 'Lost to'} Table ${other} at ${entry.gameName}`
    case 'gift':
      return entry.direction === 'out' ? `Sent Table ${other} a round` : `Got a round from Table ${other}`
    default:
      return entry.kind
  }
}

const TONE = {
  result: 'text-gold',
  gift: 'text-mint',
  left: 'text-dim'
}

function Row({ entry }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-edge" />
      <span className={`flex-1 text-xs leading-snug ${TONE[entry.kind] ?? 'text-chalk'}`}>
        {describe(entry)}
        {entry.item && <span className="text-dim"> · {entry.item.name}</span>}
      </span>
      <span className="shrink-0 text-[0.65rem] text-dim">{timeAgo(entry.at)}</span>
    </li>
  )
}

export function TableInsight({ number, info, tickets }) {
  const owing = tickets.filter((t) => t.owingTable === number)
  const owed = tickets.filter((t) => t.owedToTable === number)
  const spend = owing.reduce((sum, t) => sum + t.item.price, 0)
  const open = [...owing, ...owed].filter((t) => t.status !== 'delivered').length
  const status = STATUS[info?.status ?? 'gone'] ?? STATUS.gone
  const history = info?.history ?? []

  return (
    <>
      <div className="panel p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={`chip ${status.chip}`}>
            <span className={`dot ${info?.status && info.status !== 'gone' ? 'dot-live' : ''}`} />
            {status.label}
          </span>
          <span className="text-xs text-dim">{info?.seatedAt ? `sat ${timeAgo(info.seatedAt)}` : 'not seated'}</span>
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="display tnum text-3xl leading-none text-mint">{money(spend)}</div>
            <div className="overline mt-1">On their tab</div>
          </div>
          <div className="text-right">
            <div className="display tnum text-3xl leading-none text-chalk">{owed.length}</div>
            <div className="overline mt-1">Owed to them</div>
          </div>
        </div>
        {open > 0 && <div className="mt-2 text-[0.65rem] text-gold">{open} still to run</div>}
      </div>

      <div className="panel p-3">
        <div className="overline mb-2">Tickets</div>
        {owing.length + owed.length === 0 ? (
          <p className="text-xs text-dim">Nothing on this tab yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...owing, ...owed]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((ticket) => (
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
              <Row key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
