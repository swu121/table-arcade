import test from 'node:test'
import assert from 'node:assert/strict'
import { createBoard, dropDisc, findWin, isDraw, legalColumns, ROWS, COLS } from './connect4.rules.js'

const A = 4
const B = 7

function play(moves) {
  const board = createBoard()
  let last = null
  for (const [col, player] of moves) {
    const row = dropDisc(board, col, player)
    last = { row, col }
  }
  return { board, last }
}

test('discs stack from the bottom', () => {
  const board = createBoard()
  assert.equal(dropDisc(board, 3, A), ROWS - 1)
  assert.equal(dropDisc(board, 3, B), ROWS - 2)
  assert.equal(board[ROWS - 1][3], A)
  assert.equal(board[ROWS - 2][3], B)
})

test('a full column rejects further discs', () => {
  const board = createBoard()
  for (let i = 0; i < ROWS; i++) assert.notEqual(dropDisc(board, 0, A), null)
  assert.equal(dropDisc(board, 0, A), null)
  assert.deepEqual(legalColumns(board), [1, 2, 3, 4, 5, 6])
})

test('out of range columns are rejected', () => {
  const board = createBoard()
  assert.equal(dropDisc(board, -1, A), null)
  assert.equal(dropDisc(board, COLS, A), null)
  assert.equal(dropDisc(board, 1.5, A), null)
})

test('detects a horizontal win', () => {
  const { board, last } = play([
    [0, A], [0, B],
    [1, A], [1, B],
    [2, A], [2, B],
    [3, A]
  ])
  const win = findWin(board, last.row, last.col)
  assert.equal(win?.length, 4)
})

test('detects a vertical win', () => {
  const { board, last } = play([
    [2, A], [3, B],
    [2, A], [3, B],
    [2, A], [3, B],
    [2, A]
  ])
  const win = findWin(board, last.row, last.col)
  assert.equal(win?.length, 4)
})

test('detects an ascending diagonal win', () => {
  const { board, last } = play([
    [0, A],
    [1, B], [1, A],
    [2, B], [2, B], [2, A],
    [3, B], [3, B], [3, B], [3, A]
  ])
  const win = findWin(board, last.row, last.col)
  assert.equal(win?.length, 4)
})

test('detects a descending diagonal win', () => {
  const { board, last } = play([
    [3, A],
    [2, B], [2, A],
    [1, B], [1, B], [1, A],
    [0, B], [0, B], [0, B], [0, A]
  ])
  const win = findWin(board, last.row, last.col)
  assert.equal(win?.length, 4)
})

test('three in a row is not a win', () => {
  const { board, last } = play([
    [0, A], [0, B],
    [1, A], [1, B],
    [2, A]
  ])
  assert.equal(findWin(board, last.row, last.col), null)
})

test('a full board with no line is a draw', () => {
  const board = createBoard()
  // Column-wise pattern that fills the grid without producing four in a row.
  const pattern = [A, A, B, B, A, A, B, B]
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const shift = col % 2 === 0 ? 0 : 2
      dropDisc(board, col, pattern[(row + shift) % 4])
    }
  }
  assert.equal(isDraw(board), true)
  assert.deepEqual(legalColumns(board), [])
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      assert.equal(findWin(board, row, col), null, `unexpected win at ${row},${col}`)
    }
  }
})
