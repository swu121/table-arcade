import { makeRaceGame } from './race.js'

export const ROWS = 15
export const COLS = 7

export default makeRaceGame({
  id: 'stacker',
  name: 'Stacker',
  tagline: 'Climb the tower, keep your blocks',
  blurb: 'Time the slide, stack to the top. First table up wins.',
  scoreLabel: 'rows',

  buildCourse(rng) {
    const rows = []
    for (let i = 0; i < ROWS; i++) {
      // Speed ramps as the tower climbs; width drops at the two classic tiers.
      // The ramp stays above ~160ms/cell: below that a one-block row is a
      // coin-flip on a tablet rather than a read, and the race stops being fun.
      rows.push({
        speed: 290 - i * 9,
        width: i < 5 ? 3 : i < 10 ? 2 : 1,
        start: rng.int(0, COLS - 1)
      })
    }
    return { rows, cols: COLS, height: ROWS }
  },

  botProfile(rng) {
    return { target: rng.int(4, ROWS), stepMs: rng.int(700, 1200) }
  }
})
