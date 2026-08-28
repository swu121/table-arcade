import { useEffect, useState } from 'react'
import { pad } from '../lib/format.js'
import { Connect4 } from './games/Connect4.jsx'
import { BeerPong } from './games/BeerPong.jsx'
import { Flappy } from './games/Flappy.jsx'
import { Stacker } from './games/Stacker.jsx'

const SCREENS = {
  connect4: Connect4,
  beerpong: BeerPong,
  flappy: Flappy,
  stacker: Stacker
}

function ReconnectOverlay({ game, onClaimWin }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const remaining = Math.max(0, (game.reconnectDeadline ?? 0) - now)
  const canClaim = remaining === 0
  const seconds = Math.ceil(remaining / 1000)

  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-void/90 p-6 backdrop-blur-md">
      <div className="w-full max-w-lg text-center">
        <div className="overline">Hold tight</div>
        <div className="display mt-2 text-[clamp(2rem,8vw,3.4rem)] leading-none">
          <span className="text-dim">Table</span> <span className="gold-text">{pad(game.opponent)}</span>{' '}
          <span className="text-dim">dropped out</span>
        </div>
        <p className="mt-3 text-sm text-dim">
          Everything is frozen exactly as it was. If they come back, play just picks up again.
        </p>

        <div className="panel mt-6 px-6 py-6">
          {canClaim ? (
            <button type="button" className="btn btn-primary h-14 w-full" onClick={onClaimWin}>
              Claim the win
            </button>
          ) : (
            <>
              <div className="display tnum text-5xl gold-text">{seconds}</div>
              <div className="overline mt-1">Seconds before you can claim the win</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Walking out mid-game is a real thing to do, but it is not free, and the cost
// is the whole point of the wager — so say it plainly before they commit.
function ExitConfirm({ game, onCancel, onConfirm }) {
  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-void/90 p-6 backdrop-blur-md">
      <div className="panel w-full max-w-lg px-6 py-6 text-center">
        <div className="overline">Leaving early</div>
        <h2 className="display mt-2 text-[clamp(1.8rem,6vw,2.8rem)] leading-none text-chalk">
          Forfeit to Table {pad(game.opponent)}?
        </h2>
        <p className="mt-3 text-sm text-dim">
          Quit now and the match goes to them. The{' '}
          <span className="text-chalk">{game.item.name}</span> you played for lands on your tab.
        </p>

        <div className="mt-6 flex gap-3">
          <button type="button" className="btn btn-ghost h-14 flex-1 text-sm" onClick={onCancel}>
            Keep playing
          </button>
          <button type="button" className="btn btn-danger h-14 flex-1 text-sm" onClick={onConfirm}>
            Exit and forfeit
          </button>
        </div>
      </div>
    </div>
  )
}

export function Game({ game, onAction, onClaimWin, onForfeit }) {
  const Screen = SCREENS[game.type] ?? Connect4
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      {/* Keyed so a rematch of the same game type remounts: the screens hold a
          whole run in local state and refs, which must not survive into the next
          game. Without this, "Run it back" starts already finished. */}
      <Screen key={game.id} game={game} act={onAction} onExit={() => setConfirming(true)} />
      {confirming && (
        <ExitConfirm
          game={game}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            onForfeit()
          }}
        />
      )}
      {game.opponentGone && <ReconnectOverlay game={game} onClaimWin={onClaimWin} />}
    </>
  )
}
