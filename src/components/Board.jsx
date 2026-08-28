import { useState } from 'react'

const ROWS = 6
const COLS = 7

export function Board({ board, you, turn, winningCells, lastMove, onDrop, locked }) {
  const [hover, setHover] = useState(null)
  const armed = !locked && turn === you
  const winSet = new Set((winningCells ?? []).map(([r, c]) => `${r}:${c}`))

  const landingRow = (col) => {
    for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === null) return r
    return -1
  }

  const cells = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const value = board[r][c]
      const landing = landingRow(c)
      const playable = armed && landing !== -1
      const isLast = lastMove?.row === r && lastMove?.col === c
      const isWin = winSet.has(`${r}:${c}`)
      const isGhost = playable && hover === c && landing === r

      cells.push(
        <div
          key={`${r}-${c}`}
          onMouseEnter={() => setHover(c)}
          onMouseLeave={() => setHover((h) => (h === c ? null : h))}
          onClick={() => playable && onDrop(c)}
          className={[
            'hole relative aspect-square transition-shadow',
            playable ? 'cursor-pointer' : '',
            hover === c && playable ? 'ring-1 ring-white/15' : ''
          ].join(' ')}
        >
          {value !== null && (
            <div
              className={[
                'disc',
                value === you ? 'disc-a' : 'disc-b',
                isLast ? 'disc-anim' : '',
                isWin ? 'disc-win' : ''
              ].join(' ')}
              style={isLast ? { '--drop': `${-(r + 1) * 118}%` } : undefined}
            />
          )}
          {isGhost && <div className="ghost-disc disc-a" />}
        </div>
      )
    }
  }

  return (
    <div className="board-slab">
      <div className="board-grid">{cells}</div>
    </div>
  )
}
