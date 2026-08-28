import { ItemIcon } from './ItemIcon.jsx'
import { money, pad } from '../lib/format.js'

export function StakeCard({ item, game }) {
  return (
    <div className="panel flex items-center gap-4 px-4 py-3.5">
      <ItemIcon name={item.icon} size={42} />
      <div className="min-w-0 flex-1">
        <div className="overline">{game ? `${game} · playing for` : 'Playing for'}</div>
        <div className="display truncate text-xl text-chalk">{item.name}</div>
      </div>
      <div className="display text-lg text-dim">{money(item.price)}</div>
    </div>
  )
}

export function Seat({ number, label, tone, active, note }) {
  return (
    <div
      className={`panel flex items-center gap-3 px-4 py-3 transition ${
        active ? 'border-gold/70! shadow-[0_0_0_1px_rgba(255,182,39,0.5)]' : 'opacity-60'
      }`}
    >
      <span className={`h-7 w-7 shrink-0 rounded-full ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="overline leading-none">{label}</div>
        <div className="display tnum text-2xl leading-tight text-chalk">Table {pad(number)}</div>
      </div>
      {note && (
        <span className="hidden lg:block">
          <span className="chip chip-wait">{note}</span>
        </span>
      )}
    </div>
  )
}

/** Big readout used by the race games to show a live score. */
export function ScoreTile({ label, value, unit, tone = 'text-chalk', lead }) {
  return (
    <div className={`panel px-4 py-3 ${lead ? 'border-gold/60!' : ''}`}>
      <div className="overline">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`display tnum text-4xl leading-none ${tone}`}>{value}</span>
        <span className="text-xs text-dim">{unit}</span>
      </div>
    </div>
  )
}

/**
 * Shared game shell: stake on the left with whatever the game wants underneath,
 * play surface on the right. Every game screen renders inside this so the chrome
 * stays identical no matter what's being played.
 */
export function GameFrame({ game, aside, children }) {
  return (
    <div className="relative z-10 flex h-full flex-col gap-3 p-3 lg:flex-row lg:gap-4 lg:p-4">
      <aside className="flex shrink-0 flex-col gap-2.5 lg:w-[20rem]">
        <StakeCard item={game.item} game={game.gameName} />
        {aside}
      </aside>
      <main className="board-stage grid min-h-0 flex-1 place-items-center">{children}</main>
    </div>
  )
}
