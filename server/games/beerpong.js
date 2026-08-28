import { makeRng, randomSeed } from './rng.js'

// Cups sit in normalised table space: x is lateral (-1 left .. 1 right),
// y is depth (0 far end .. 1 nearest the thrower). The client renders this
// space in perspective, but every hit decision happens on these numbers.
const ROW_SIZES = [4, 3, 2, 1]
const ROW_DEPTH = [0.16, 0.38, 0.6, 0.82]
const CUP_SPACING = 0.17
const HIT_RADIUS = 0.085
const SCATTER = 0.038

const BOT_THROW_DELAY = 1400
const BOT_THROW_SPREAD = 900

// A bot's aim wobble, in meter units, drawn once per game. Because a hit keeps
// the ball, accuracy compounds: below ~0.11 a bot sweeps all ten cups before
// the human throws once. This band lands around a 40-65% hit rate — runs of two
// or three still happen, but the ball comes back.
const BOT_WOBBLE_LO = 0.11
const BOT_WOBBLE_HI = 0.2

function makeRack() {
  const cups = []
  ROW_SIZES.forEach((size, row) => {
    for (let i = 0; i < size; i++) {
      cups.push({
        id: `${row}-${i}`,
        x: (i - (size - 1) / 2) * CUP_SPACING,
        y: ROW_DEPTH[row],
        alive: true
      })
    }
  })
  return cups
}

// Power sets how deep the ball lands, angle sets how far across. Both arrive
// as 0..1 from the client's meters; everything past this point is server truth.
function landingPoint(power, angle, rng) {
  return {
    x: (angle - 0.5) * 1.7 + rng.float(-SCATTER, SCATTER),
    y: 1.12 - power * 1.22 + rng.float(-SCATTER, SCATTER)
  }
}

function nearestCup(cups, point) {
  let best = null
  let bestDistance = Infinity
  for (const cup of cups) {
    if (!cup.alive) continue
    const distance = Math.hypot(cup.x - point.x, cup.y - point.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = cup
    }
  }
  return bestDistance <= HIT_RADIUS ? best : null
}

export default {
  id: 'beerpong',
  name: 'Beer Pong',
  tagline: 'Ten cups, one table standing',
  blurb: 'Line up the arc and sink it. Hit and you throw again.',
  mode: 'turn',

  create({ players, first }) {
    const seed = randomSeed()
    const rng = makeRng(seed)
    const cups = {}
    for (const number of players) cups[number] = makeRack()
    return { seed, turn: first, throws: 0, cups, lastThrow: null, botWobble: rng.float(BOT_WOBBLE_LO, BOT_WOBBLE_HI) }
  },

  view(game, me) {
    const opponent = game.players.find((p) => p !== me)
    return {
      turn: game.state.turn,
      yourCups: game.state.cups[me],
      theirCups: game.state.cups[opponent],
      lastThrow: game.state.lastThrow
    }
  },

  action(game, me, payload) {
    if (game.state.turn !== me) return null

    const power = Number(payload?.power)
    const angle = Number(payload?.angle)
    if (!Number.isFinite(power) || !Number.isFinite(angle)) return null
    if (power < 0 || power > 1 || angle < 0 || angle > 1) return null

    const opponent = game.players.find((p) => p !== me)
    const target = game.state.cups[opponent]

    const rng = makeRng(game.state.seed + game.state.throws * 7919)
    game.state.throws++

    const point = landingPoint(power, angle, rng)
    const cup = nearestCup(target, point)
    if (cup) cup.alive = false

    game.state.lastThrow = {
      by: me,
      power,
      angle,
      x: point.x,
      y: point.y,
      hitCup: cup?.id ?? null,
      throwId: game.state.throws
    }

    if (cup && target.every((c) => !c.alive)) {
      return { ended: { winner: me, reason: 'sweep' } }
    }

    // Sinking one keeps the ball — the run-of-three is the whole drama of pong.
    if (!cup) game.state.turn = opponent
    return {}
  },

  tick(game, ctx) {
    const me = game.state.turn
    if (!ctx.isBot(me)) return

    ctx.after(BOT_THROW_DELAY + Math.random() * BOT_THROW_SPREAD, () => {
      if (game.state.turn !== me) return

      const opponent = game.players.find((p) => p !== me)
      const alive = game.state.cups[opponent].filter((c) => c.alive)
      if (alive.length === 0) return

      const aim = alive[Math.floor(Math.random() * alive.length)]
      const wobble = game.state.botWobble
      ctx.act(me, {
        angle: aim.x / 1.7 + 0.5 + (Math.random() - 0.5) * wobble,
        power: (1.12 - aim.y) / 1.22 + (Math.random() - 0.5) * wobble
      })
    })
  }
}
