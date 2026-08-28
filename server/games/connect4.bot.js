import { cloneBoard, dropDisc, findWin, legalColumns, COLS } from './connect4.rules.js'

function wins(board, col, player) {
  const next = cloneBoard(board)
  const row = dropDisc(next, col, player)
  return row !== null && findWin(next, row, col) !== null
}

// Hands the opponent an immediate win by playing directly beneath them.
function feedsOpponent(board, col, me, them) {
  const next = cloneBoard(board)
  if (dropDisc(next, col, me) === null) return true
  const row = dropDisc(next, col, them)
  return row !== null && findWin(next, row, col) !== null
}

export function chooseColumn(board, me, them) {
  const legal = legalColumns(board)
  if (legal.length === 0) return null

  for (const col of legal) if (wins(board, col, me)) return col
  for (const col of legal) if (wins(board, col, them)) return col

  const safe = legal.filter((col) => !feedsOpponent(board, col, me, them))
  const pool = safe.length > 0 ? safe : legal

  const center = (COLS - 1) / 2
  const weights = pool.map((col) => 1 / (1 + Math.abs(col - center)))
  const total = weights.reduce((sum, w) => sum + w, 0)

  let roll = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}
