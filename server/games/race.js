import { makeRng, randomSeed } from './rng.js'

// Three beats of one length. Every number holds for exactly one, and the beat
// goes out with the game so the clients count and animate against a duration
// the server actually named — rather than each guessing 1000ms and drifting.
const BEAT_MS = 800
const COUNTDOWN_MS = BEAT_MS * 3
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
        beatMs: BEAT_MS,
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

      ctx.after(Math.max(0, game.state.startsAt + MAX_RUN_MS - Date.now()), () => {
        for (const run of Object.values(game.state.runs)) run.done = true
        const result = this.resolve(game)
        if (result.ended) ctx.finish(result.ended)
      })
    },

    // The timing in a race is the count-in and the ceiling, both hung off
    // `startsAt`. Across a restart a countdown still running is re-anchored to
    // the new clock; a run already underway keeps its original mark, because
    // the tablets' local runs are anchored to it and never saw the server go.
    snapshot(state, now) {
      const { botsRunning, ...rest } = state
      return { ...structuredClone(rest), startsIn: state.startsAt - now }
    },

    restore(saved, now) {
      const { startsIn, ...rest } = saved
      const state = structuredClone(rest)
      if (Number(startsIn) > 0) state.startsAt = now + Number(startsIn)
      return state
    },

    // After a restart the bots pick up from the score they had reported, and
    // the ceiling is re-armed from wherever `startsAt` now points.
    resume(game, ctx) {
      game.state.botsRunning = false
      this.tick(game, ctx)
    },

    runBot(game, ctx, number, target, stepMs) {
      const run = game.state.runs[number]
      if (!run || run.done) return
      // The first step waits out the count-in on a fresh run, and one ordinary
      // beat on a run being picked up part-way.
      const lead = run.score > 0 ? stepMs : Math.max(0, game.state.startsAt - Date.now())
      const step = (score, delay) => {
        ctx.after(delay, () => {
          if (game.state.runs[number].done) return
          if (score >= target) return ctx.act(number, { type: 'done', score: target })
          ctx.act(number, { type: 'progress', score })
          step(score + 1, stepMs)
        })
      }
      step(run.score > 0 ? run.score + 1 : 0, lead)
    }
  }
}
