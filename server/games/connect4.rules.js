export const ROWS = 6
export const COLS = 7

export function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null))
}

export function cloneBoard(board) {
  return board.map((row) => row.slice())
}

export function dropDisc(board, col, player) {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return null
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) {
      board[row][col] = player
      return row
    }
  }
  return null
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
]

export function findWin(board, row, col) {
  const player = board[row][col]
  if (player === null) return null

  for (const [dr, dc] of DIRECTIONS) {
    const cells = [[row, col]]
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        cells.push([r, c])
        r += dr * sign
        c += dc * sign
      }
    }
    if (cells.length >= 4) return cells
  }
  return null
}

export function isDraw(board) {
  return board[0].every((cell) => cell !== null)
}

export function legalColumns(board) {
  const cols = []
  for (let c = 0; c < COLS; c++) if (board[0][c] === null) cols.push(c)
  return cols
}
