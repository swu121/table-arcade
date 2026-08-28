import { useMemo } from 'react'
import { Wordmark } from '../components/Logo.jsx'
import { TableCard } from '../components/Bits.jsx'
import { FloorPlan } from '../components/FloorPlan.jsx'
import { pad } from '../lib/format.js'

function Header({ self, onReset }) {
  return (
    <header className="flex shrink-0 items-center justify-between px-5 py-3">
      <Wordmark />
      <button
        type="button"
        onClick={onReset}
        className="panel flex items-center gap-3 px-4 py-2 text-left"
        title="Change table number"
      >
        <span className="overline leading-none">You are</span>
        <span className="display tnum text-2xl leading-none gold-text">{pad(self.number)}</span>
      </button>
    </header>
  )
}

const LEGEND = [
  { label: 'Open', className: 'chip-open' },
  { label: 'In a game', className: 'chip-busy' },
  { label: 'Deciding', className: 'chip-wait' }
]

export function Lobby({ sync, onPick, onReset }) {
  const self = sync.self
  const plan = sync.floorplan
  const lobby = sync.lobby ?? []

  const { statuses, selectable, offPlan } = useMemo(() => {
    const statuses = new Map()
    for (const table of lobby) statuses.set(table.number, table.status)
    if (self) statuses.set(self.number, self.status)

    const placed = new Set((plan?.tables ?? []).map((t) => t.number))
    const selectable = new Set(lobby.filter((t) => t.status === 'idle' && placed.has(t.number)).map((t) => t.number))
    const offPlan = lobby.filter((t) => !placed.has(t.number))

    return { statuses, selectable, offPlan }
  }, [lobby, self, plan])

  const openCount = lobby.filter((t) => t.status === 'idle').length
  const hasPlan = (plan?.tables?.length ?? 0) > 0

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <Header self={self} onReset={onReset} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2 className="display text-[clamp(1.6rem,4vw,2.6rem)] leading-none">Challenge a table</h2>
            <p className="mt-1 text-[0.8rem] text-dim">
              Tap an open table, pick what you&apos;re playing for. Loser&apos;s tab covers it.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 sm:flex">
              {LEGEND.map((item) => (
                <span key={item.label} className={`chip ${item.className}`}>
                  <span className="dot" />
                  {item.label}
                </span>
              ))}
            </div>
            <div className="text-right">
              <div className="display tnum text-3xl leading-none text-mint">{openCount}</div>
              <div className="overline mt-1">Open now</div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="panel relative min-h-0 min-w-0 flex-1 p-3">
            {hasPlan ? (
              <FloorPlan
                plan={plan}
                statuses={statuses}
                selfNumber={self?.number ?? null}
                selectable={selectable}
                onTableTap={onPick}
              />
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <div className="display text-3xl text-edge">No floor plan yet</div>
                  <p className="mt-2 max-w-sm text-sm text-dim">Ask staff to lay out the room on the staff tablet.</p>
                </div>
              </div>
            )}
          </div>

          {offPlan.length > 0 && (
            <aside className="flex w-40 shrink-0 flex-col gap-2">
              <div className="overline shrink-0 leading-tight">Not on the plan yet</div>
              <div className="stagger flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {offPlan.map((table, i) => (
                  <TableCard
                    key={table.number}
                    table={table}
                    index={i}
                    onChallenge={() => onPick(table)}
                  />
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
