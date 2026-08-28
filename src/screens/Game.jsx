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

export function Game({ game, onAction, onClaimWin }) {
  const Screen = SCREENS[game.type] ?? Connect4

  return (
    <>
      {/* Keyed so a rematch of the same game type remounts: the screens hold a
          whole run in local state and refs, which must not survive into the next
          game. Without this, "Run it back" starts already finished. */}
      <Screen key={game.id} game={game} act={onAction} />
      {game.opponentGone && <ReconnectOverlay game={game} onClaimWin={onClaimWin} />}
    </>
  )
}
