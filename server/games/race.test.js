import test from 'node:test'
import assert from 'node:assert/strict'
import flappy from './flappy.js'
import stacker from './stacker.js'
import { makeRng } from './rng.js'

const PLAYERS = [1, 2]

function newGame(mod, { started = true } = {}) {
  const game = { id: 'g', type: mod.id, players: PLAYERS, status: 'active', state: null }
  game.state = mod.create({ players: PLAYERS, first: 2 })
  if (started) game.state.startsAt = Date.now() - 1
  return game
}

test('both tables start a run at zero', () => {
  const game = newGame(flappy)
  assert.deepEqual(game.state.runs[1], { score: 0, done: false })
  assert.deepEqual(game.state.runs[2], { score: 0, done: false })
})

test('actions before the countdown ends are rejected', () => {
  const game = newGame(flappy, { started: false })
  assert.equal(flappy.action(game, 1, { type: 'progress', score: 3 }), null)
})

test('scores climb but never rewind', () => {
  const game = newGame(flappy)

  flappy.action(game, 1, { type: 'progress', score: 5 })
  assert.equal(game.state.runs[1].score, 5)

  flappy.action(game, 1, { type: 'progress', score: 2 })
  assert.equal(game.state.runs[1].score, 5)
})

test('the game only resolves once both runs are done', () => {
  const game = newGame(flappy)

  const first = flappy.action(game, 1, { type: 'done', score: 9 })
  assert.deepEqual(first, {})

  const second = flappy.action(game, 2, { type: 'done', score: 4 })
  assert.deepEqual(second, { ended: { winner: 1, reason: 'score' } })
})

test('equal scores are a draw', () => {
  const game = newGame(flappy)
  flappy.action(game, 1, { type: 'done', score: 7 })
  const result = flappy.action(game, 2, { type: 'done', score: 7 })
  assert.deepEqual(result, { ended: { winner: null, reason: 'draw' } })
})

test('a finished run cannot report again', () => {
  const game = newGame(flappy)
  flappy.action(game, 1, { type: 'done', score: 3 })
  assert.equal(flappy.action(game, 1, { type: 'progress', score: 40 }), null)
})

test('both tables see the same course from one seed', () => {
  const game = newGame(flappy)
  assert.deepEqual(flappy.view(game, 1).course, flappy.view(game, 2).course)
  assert.equal(flappy.view(game, 1).you, game.state.runs[1])
  assert.equal(flappy.view(game, 1).opponent, game.state.runs[2])
})

test('a seed always rebuilds an identical course', () => {
  const a = flappy.create({ players: PLAYERS })
  const b = { ...a }
  assert.deepEqual(a.course, b.course)

  const rngA = makeRng(1234)
  const rngB = makeRng(1234)
  assert.equal(rngA.next(), rngB.next())
})

test('the stacker tower narrows as it climbs', () => {
  const game = newGame(stacker)
  const { rows } = game.state.course

  assert.equal(rows.length, 15)
  assert.equal(rows[0].width, 3)
  assert.equal(rows[14].width, 1)
  assert.ok(rows[14].speed < rows[0].speed)
  assert.ok(rows.every((row) => row.start >= 0 && row.start < game.state.course.cols))
})
