import { makeRng, randomSeed } from './rng.js'

const COUNTDOWN_MS = 3200
// Nobody plays a bar mini-game for two minutes. If a run never reports in by
// then the tablet is asleep or wedged, so settle with whatever score we have.
const MAX_RUN_MS = 120_000

/**
 * Both tables run the identical seeded course at the same time and the higher
 * score takes the tab. Shared by every 'race' mode game — a module only has to
 * describe its course and how a bot table paces itself.
 *
 * config: { id, name, tagline, blurb, scoreLabel, buildCourse(rng), botProfile(rng) }
 */
export function makeRaceGame(config) {
  return {
    id: config.id,
    name: config.name,
    tagline: config.tagline,
    blurb: config.blurb,
    mode: 'race',

    create({ players }) {
      const seed = randomSeed()
      const rng = makeRng(seed)
      const runs = {}
      for (const number of players) runs[number] = { score: 0, done: false }

      return {
        seed,
        course: config.buildCourse(rng),
        startsAt: Date.now() + COUNTDOWN_MS,
        runs
      }
    },

    view(game, me) {
      const opponent = game.players.find((p) => p !== me)
      return {
        seed: game.state.seed,
        course: game.state.course,
        startsAt: game.state.startsAt,
        scoreLabel: config.scoreLabel,
        you: game.state.runs[me],
        opponent: game.state.runs[opponent]
      }
    },

    action(game, me, payload) {
      const run = game.state.runs[me]
      if (!run || run.done) return null
      if (Date.now() < game.state.startsAt) return null

      const score = Math.max(0, Math.floor(Number(payload?.score) || 0))
      // Scores only ever climb — a lower report is a stale packet, not a rewind.
      run.score = Math.max(run.score, score)

      if (payload?.type !== 'done') return {}

      run.done = true
      return this.resolve(game)
    },

    resolve(game) {
      const runs = game.state.runs
      if (!game.players.every((p) => runs[p].done)) return {}

      const [a, b] = game.players
      if (runs[a].score === runs[b].score) return { ended: { winner: null, reason: 'draw' } }
      const winner = runs[a].score > runs[b].score ? a : b
      return { ended: { winner, reason: 'score' } }
    },

    tick(game, ctx) {
      if (game.state.botsRunning) return
      game.state.botsRunning = true

      for (const number of game.players) {
        if (!ctx.isBot(number)) continue
        const { target, stepMs } = config.botProfile(makeRng(game.state.seed ^ number))
        this.runBot(game, ctx, number, target, stepMs)
      }

      ctx.after(COUNTDOWN_MS + MAX_RUN_MS, () => {
        for (const run of Object.values(game.state.runs)) run.done = true
        const result = this.resolve(game)
        if (result.ended) ctx.finish(result.ended)
      })
    },

    runBot(game, ctx, number, target, stepMs) {
      const step = (score) => {
        ctx.after(score === 0 ? COUNTDOWN_MS : stepMs, () => {
          if (game.state.runs[number].done) return
          if (score >= target) return ctx.act(number, { type: 'done', score: target })
          ctx.act(number, { type: 'progress', score })
          step(score + 1)
        })
      }
      step(0)
    }
  }
}
