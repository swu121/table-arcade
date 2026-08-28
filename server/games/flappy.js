import { makeRaceGame } from './race.js'

const GATES = 60

export default makeRaceGame({
  id: 'flappy',
  name: 'Soju Run',
  tagline: 'Fly the bottle, clear the gates',
  blurb: 'Tap to flap a soju bottle through the gaps. Furthest table wins.',
  scoreLabel: 'gates',

  // The gap slowly narrows and drifts more as you get deeper, so a long run is
  // genuinely hard rather than just long.
  buildCourse(rng) {
    const gates = []
    for (let i = 0; i < GATES; i++) {
      const difficulty = Math.min(1, i / 28)
      gates.push({
        gap: 0.34 - 0.13 * difficulty,
        center: rng.float(0.26 + 0.04 * difficulty, 0.74 - 0.04 * difficulty)
      })
    }
    return { gates }
  },

  botProfile(rng) {
    return { target: rng.int(5, 24), stepMs: rng.int(1000, 1500) }
  }
})
