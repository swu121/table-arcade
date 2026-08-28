import * as C4 from './connect4.rules.js'
import { chooseColumn } from './connect4.bot.js'

const BOT_MOVE_MIN = 900
const BOT_MOVE_SPREAD = 800

export default {
  id: 'connect4',
  name: 'Connect 4',
  tagline: 'Four in a row, straight up',
  mode: 'turn',
  blurb: 'Drop discs, connect four, take the tab.',

  create({ first }) {
    return {
      board: C4.createBoard(),
      turn: first,
      winningCells: null,
      lastMove: null
    }
  },

  view(game) {
    return {
      board: game.state.board,
      turn: game.state.turn,
      winningCells: game.state.winningCells,
      lastMove: game.state.lastMove
    }
  },

  action(game, me, payload) {
    const { board } = game.state
    if (game.state.turn !== me) return null

    const column = Number(payload?.column)
    const row = C4.dropDisc(board, column, me)
    if (row === null) return null

    game.state.lastMove = { row, col: column, player: me }

    const win = C4.findWin(board, row, column)
    if (win) {
      game.state.winningCells = win
      return { ended: { winner: me, reason: 'win' } }
    }
    if (C4.isDraw(board)) return { ended: { winner: null, reason: 'draw' } }

    game.state.turn = game.players.find((p) => p !== me)
    return {}
  },

  tick(game, ctx) {
    const me = game.state.turn
    if (!ctx.isBot(me)) return

    ctx.after(BOT_MOVE_MIN + Math.random() * BOT_MOVE_SPREAD, () => {
      if (game.state.turn !== me) return
      const opponent = game.players.find((p) => p !== me)
      const column = chooseColumn(game.state.board, me, opponent)
      if (column !== null) ctx.act(me, { column })
    })
  }
}
