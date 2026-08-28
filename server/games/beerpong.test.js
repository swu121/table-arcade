import test from 'node:test'
import assert from 'node:assert/strict'
import beerpong from './beerpong.js'

const PLAYERS = [1, 2]

function newGame() {
  const game = { id: 'g', type: beerpong.id, players: PLAYERS, status: 'active', state: null }
  game.state = beerpong.create({ players: PLAYERS, first: 2 })
  return game
}

// Aiming dead at a cup: scatter is +-0.038 per axis, so worst-case miss distance
// is 0.054 — comfortably inside the 0.085 hit radius. A perfect aim always sinks.
function perfectThrow(cup) {
  return { angle: cup.x / 1.7 + 0.5, power: (1.12 - cup.y) / 1.22 }
}

test('each table racks ten cups', () => {
  const game = newGame()
  for (const number of PLAYERS) {
    assert.equal(game.state.cups[number].length, 10)
    assert.ok(game.state.cups[number].every((cup) => cup.alive))
  }
})

test('the challenged table throws first', () => {
  assert.equal(newGame().state.turn, 2)
})

test('throwing out of turn is rejected', () => {
  const game = newGame()
  assert.equal(beerpong.action(game, 1, { power: 0.5, angle: 0.5 }), null)
})

test('power and angle outside 0..1 are rejected', () => {
  const game = newGame()
  assert.equal(beerpong.action(game, 2, { power: 1.4, angle: 0.5 }), null)
  assert.equal(beerpong.action(game, 2, { power: 0.5, angle: -0.2 }), null)
  assert.equal(beerpong.action(game, 2, { power: 'x', angle: 0.5 }), null)
})

test('a perfect throw sinks that cup and keeps the turn', () => {
  const game = newGame()
  const cup = game.state.cups[1][4]

  const result = beerpong.action(game, 2, perfectThrow(cup))

  assert.deepEqual(result, {})
  assert.equal(cup.alive, false)
  assert.equal(game.state.lastThrow.hitCup, cup.id)
  assert.equal(game.state.turn, 2)
})

test('a wild throw misses and passes the turn', () => {
  const game = newGame()

  const result = beerpong.action(game, 2, { power: 0.02, angle: 0.98 })

  assert.deepEqual(result, {})
  assert.equal(game.state.lastThrow.hitCup, null)
  assert.equal(game.state.cups[1].filter((c) => c.alive).length, 10)
  assert.equal(game.state.turn, 1)
})

test('clearing the opposing rack wins the game', () => {
  const game = newGame()
  const target = game.state.cups[1]

  let result
  for (const cup of target) {
    result = beerpong.action(game, 2, perfectThrow(cup))
  }

  assert.deepEqual(result, { ended: { winner: 2, reason: 'sweep' } })
})

test('a table only ever shoots at the other rack', () => {
  const game = newGame()
  const view = beerpong.view(game, 2)
  assert.equal(view.theirCups, game.state.cups[1])
  assert.equal(view.yourCups, game.state.cups[2])
})
