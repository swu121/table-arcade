import { Board } from '../../components/Board.jsx'
import { GameFrame, Seat } from '../../components/GameChrome.jsx'
import { pad } from '../../lib/format.js'

export function Connect4({ game, act }) {
  const { board, turn, winningCells, lastMove } = game.state
  const yourTurn = turn === game.you

  const aside = (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
        <Seat number={game.you} label="You" tone="disc-a" active={yourTurn} note={yourTurn ? 'To play' : null} />
        <Seat number={game.opponent} label="Opponent" tone="disc-b" active={!yourTurn} note={yourTurn ? null : 'To play'} />
      </div>

      <div className={`panel grid flex-1 place-items-center px-4 py-6 text-center ${yourTurn ? 'border-gold/50!' : ''}`}>
        <div>
          <div className="display text-[clamp(1.5rem,5vw,2.4rem)] leading-none">
            {yourTurn ? (
              <span className="gold-text">Your turn</span>
            ) : (
              <span className="text-dim">Table {pad(game.opponent)}</span>
            )}
          </div>
          <div className="overline mt-2">{yourTurn ? 'Tap a column to drop' : 'Thinking…'}</div>
        </div>
      </div>
    </>
  )

  return (
    <GameFrame game={game} aside={aside}>
      <Board
        board={board}
        you={game.you}
        turn={turn}
        winningCells={winningCells}
        lastMove={lastMove}
        onDrop={(column) => act({ column })}
        locked={game.opponentGone}
      />
    </GameFrame>
  )
}
