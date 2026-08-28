import connect4 from './connect4.js'
import beerpong from './beerpong.js'
import flappy from './flappy.js'
import stacker from './stacker.js'

export const GAMES = [connect4, beerpong, flappy, stacker]

const BY_ID = new Map(GAMES.map((game) => [game.id, game]))

export const getGame = (id) => BY_ID.get(id) ?? null
export const DEFAULT_GAME = connect4.id

export const gameMenu = () =>
  GAMES.map(({ id, name, tagline, blurb, mode }) => ({ id, name, tagline, blurb, mode }))
