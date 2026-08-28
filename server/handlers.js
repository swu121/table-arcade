import {
  MENU,
  CHALLENGE_TTL,
  RECONNECT_GRACE,
  tables,
  challenges,
  games,
  tickets,
  nextId,
  makeTable,
  seedBots
} from './state.js'
import { getGame, gameMenu, DEFAULT_GAME } from './games/index.js'
import { getPlan, savePlan, resetPlan } from './floorplan.js'

const BOT_ACCEPT_DELAY = 1500

let io = null

export function init(server) {
  io = server
  seedBots()
  io.on('connection', onConnection)
  setInterval(sweep, 10_000).unref()
}

/* ---------------------------------------------------------------- sync --- */

function isOnline(table) {
  return table.isBot || table.socketId !== null
}

function recomputeStatus(table) {
  if (table.gameId && games.has(table.gameId)) {
    table.status = 'playing'
    return
  }
  if (table.challengeId && challenges.has(table.challengeId)) {
    const challenge = challenges.get(table.challengeId)
    table.status = challenge.from === table.number ? 'challenging' : 'challenged'
    return
  }
  table.status = isOnline(table) ? 'idle' : 'gone'
}

function gameView(game, me) {
  const mod = getGame(game.type)
  const opponent = game.players.find((p) => p !== me)
  return {
    id: game.id,
    type: game.type,
    gameName: mod.name,
    mode: mod.mode,
    you: me,
    opponent,
    item: game.item,
    status: game.status,
    winner: game.winner,
    opponentGone: game.goneTable === opponent,
    reconnectDeadline: game.goneTable === opponent ? game.disconnectDeadline : null,
    state: mod.view(game, me)
  }
}

function lobbyFor(me) {
  return [...tables.values()]
    .filter((t) => t.number !== me && t.status !== 'gone')
    .sort((a, b) => a.number - b.number)
    .map((t) => ({ number: t.number, status: t.status }))
}

function takenNumbers() {
  return [...tables.values()].filter(isOnline).map((t) => t.number)
}

function buildSync(table) {
  const base = { menu: MENU, games: gameMenu(), floorplan: getPlan(), taken: takenNumbers() }
  if (!table) {
    return { ...base, self: null, lobby: lobbyFor(null), challenge: null, game: null, lastResult: null }
  }

  const challenge = table.challengeId ? challenges.get(table.challengeId) : null
  const game = table.gameId ? games.get(table.gameId) : null

  return {
    ...base,
    self: { number: table.number, status: table.status },
    lobby: lobbyFor(table.number),
    challenge: challenge
      ? {
          id: challenge.id,
          role: challenge.from === table.number ? 'from' : 'to',
          otherTable: challenge.from === table.number ? challenge.to : challenge.from,
          item: challenge.item,
          gameType: challenge.gameType,
          gameName: getGame(challenge.gameType).name,
          expiresAt: challenge.expiresAt
        }
      : null,
    game: game ? gameView(game, table.number) : null,
    lastResult: table.lastResult
  }
}

function syncAll() {
  for (const socket of io.sockets.sockets.values()) {
    const number = socket.data.tableNumber
    const table = number ? tables.get(number) : null
    socket.emit('state:sync', buildSync(table && table.socketId === socket.id ? table : null))
  }
}

function ticketList() {
  return [...tickets.values()].sort((a, b) => b.createdAt - a.createdAt)
}

function syncStaff() {
  io.to('staff').emit('staff:sync', { tickets: ticketList(), floorplan: getPlan() })
}

function socketFor(table) {
  if (!table?.socketId) return null
  return io.sockets.sockets.get(table.socketId) ?? null
}

function fail(socket, code, message) {
  socket.emit('app:error', { code, message })
}

/* ----------------------------------------------------------- challenges --- */

function clearChallengeTimer(challenge) {
  if (challenge.timeoutHandle) {
    clearTimeout(challenge.timeoutHandle)
    challenge.timeoutHandle = null
  }
}

function detachChallenge(challenge) {
  clearChallengeTimer(challenge)
  challenges.delete(challenge.id)
  for (const number of [challenge.from, challenge.to]) {
    const table = tables.get(number)
    if (table?.challengeId === challenge.id) {
      table.challengeId = null
      recomputeStatus(table)
    }
  }
}

function cancelChallenge(challenge, reason) {
  if (!challenge || challenge.status !== 'pending') return
  challenge.status = reason
  detachChallenge(challenge)

  for (const number of [challenge.from, challenge.to]) {
    const socket = socketFor(tables.get(number))
    if (socket) {
      socket.emit('challenge:ended', {
        reason,
        otherTable: number === challenge.from ? challenge.to : challenge.from
      })
    }
  }
}

/* ----------------------------------------------------------------- game --- */

// Everything a game module is allowed to reach for: who's a bot, a timer that
// dies with the game, a way to submit an action, and a way to call it.
function contextFor(game) {
  return {
    isBot: (number) => tables.get(number)?.isBot === true,

    after(ms, fn) {
      const handle = setTimeout(() => {
        if (games.get(game.id) !== game || game.status !== 'active') return
        fn()
      }, ms)
      handle.unref?.()
    },

    act(number, payload) {
      if (applyAction(number, game.id, payload)) syncAll()
    },

    finish(ended) {
      if (games.get(game.id) !== game || game.status !== 'active') return
      endGame(game, ended.winner, ended.reason)
      syncAll()
    }
  }
}

function startGame(challenge) {
  const mod = getGame(challenge.gameType) ?? getGame(DEFAULT_GAME)
  const players = [challenge.from, challenge.to]

  const game = {
    id: nextId('g'),
    type: mod.id,
    players,
    item: challenge.item,
    status: 'active',
    winner: null,
    goneTable: null,
    disconnectDeadline: null,
    createdAt: Date.now(),
    // The challenged table moves first — small fairness offset for being called out.
    state: mod.create({ players, first: challenge.to })
  }
  game.ctx = contextFor(game)
  games.set(game.id, game)

  for (const number of players) {
    const table = tables.get(number)
    if (!table) continue
    table.challengeId = null
    table.gameId = game.id
    table.lastResult = null
    table.status = 'playing'
  }

  mod.tick?.(game, game.ctx)
  return game
}

function endGame(game, winner, reason) {
  game.status = 'complete'
  game.winner = winner

  const mod = getGame(game.type)

  let ticket = null
  if (winner !== null) {
    const loser = game.players.find((p) => p !== winner)
    ticket = {
      id: nextId('tk'),
      item: game.item,
      owingTable: loser,
      owedToTable: winner,
      status: 'pending',
      createdAt: Date.now(),
      gameId: game.id,
      gameName: mod.name,
      reason
    }
    tickets.set(ticket.id, ticket)
  }

  for (const number of game.players) {
    const table = tables.get(number)
    if (!table) continue
    table.gameId = null
    table.lastResult = {
      outcome: winner === null ? 'draw' : winner === number ? 'won' : 'lost',
      item: game.item,
      opponent: game.players.find((p) => p !== number),
      gameType: game.type,
      gameName: mod.name,
      reason,
      ticketId: ticket?.id ?? null
    }
    recomputeStatus(table)
    socketFor(table)?.emit('game:over', table.lastResult)
  }

  games.delete(game.id)
  syncStaff()
}

function voidGame(game) {
  game.status = 'void'
  for (const number of game.players) {
    const table = tables.get(number)
    if (!table) continue
    table.gameId = null
    recomputeStatus(table)
  }
  games.delete(game.id)
}

function applyAction(tableNumber, gameId, payload) {
  const game = games.get(gameId)
  if (!game || game.status !== 'active') return false
  if (!game.players.includes(tableNumber)) return false
  if (game.goneTable !== null) return false

  const mod = getGame(game.type)
  const result = mod.action(game, tableNumber, payload)
  if (!result) return false

  if (result.ended) {
    endGame(game, result.ended.winner, result.ended.reason)
    return true
  }

  mod.tick?.(game, game.ctx)
  return true
}

/* ------------------------------------------------------------------ bots --- */

function scheduleBotAccept(challengeId) {
  setTimeout(() => {
    const challenge = challenges.get(challengeId)
    if (!challenge || challenge.status !== 'pending') return
    clearChallengeTimer(challenge)
    challenge.status = 'accepted'
    challenges.delete(challenge.id)
    startGame(challenge)
    syncAll()
  }, BOT_ACCEPT_DELAY).unref()
}

// A human who walks away mid-game against a bot would otherwise pin that bot as
// "playing" for the rest of the night. Void it rather than bill an absent table.
function sweep() {
  let dirty = false
  for (const game of [...games.values()]) {
    if (game.goneTable === null || game.status !== 'active') continue
    const remaining = game.players.find((p) => p !== game.goneTable)
    if (!tables.get(remaining)?.isBot) continue
    if (Date.now() < game.disconnectDeadline + 30_000) continue
    voidGame(game)
    dirty = true
  }
  if (dirty) syncAll()
}

/* ----------------------------------------------------------- connection --- */

function onConnection(socket) {
  socket.emit('state:sync', buildSync(null))

  socket.on('table:claim', ({ tableNumber } = {}) => {
    const number = Number(tableNumber)
    if (!Number.isInteger(number) || number < 1 || number > 99) {
      return fail(socket, 'BAD_TABLE', 'Pick a table number between 1 and 99.')
    }

    const existing = tables.get(number)
    if (existing?.isBot) {
      return fail(socket, 'TABLE_TAKEN', `Table ${number} is already in play.`)
    }

    // This socket was previously bound to a different table.
    const previous = socket.data.tableNumber ? tables.get(socket.data.tableNumber) : null
    if (previous && previous.number !== number && previous.socketId === socket.id) {
      previous.socketId = null
      recomputeStatus(previous)
    }

    // Last claim wins — boot the stale device so the lobby has no ghosts.
    if (existing?.socketId && existing.socketId !== socket.id) {
      const stale = io.sockets.sockets.get(existing.socketId)
      if (stale) {
        stale.data.tableNumber = null
        stale.emit('app:error', {
          code: 'TAKEN_OVER',
          message: `Table ${number} was claimed on another device.`
        })
        stale.disconnect(true)
      }
    }

    const table = existing ?? makeTable(number)
    tables.set(number, table)
    table.socketId = socket.id
    socket.data.tableNumber = number

    // Reconnecting into a frozen game unfreezes it.
    const game = table.gameId ? games.get(table.gameId) : null
    if (game && game.goneTable === number) {
      game.goneTable = null
      game.disconnectDeadline = null
    }

    recomputeStatus(table)
    syncAll()
  })

  socket.on('challenge:send', ({ toTable, item, gameType } = {}) => {
    const from = currentTable(socket)
    if (!from) return fail(socket, 'NO_TABLE', 'Claim a table first.')

    const target = tables.get(Number(toTable))
    if (!target || target.status === 'gone') {
      return fail(socket, 'NO_TABLE', 'That table is not available right now.')
    }
    if (target.number === from.number) {
      return fail(socket, 'SELF', "You can't challenge your own table.")
    }

    const menuItem = MENU.find((m) => m.id === item)
    if (!menuItem) return fail(socket, 'BAD_ITEM', 'Pick something off the menu.')

    const mod = getGame(gameType)
    if (!mod) return fail(socket, 'BAD_GAME', 'Pick a game to play.')

    if (from.gameId) return fail(socket, 'BUSY', "You're already in a game.")

    const mine = from.challengeId ? challenges.get(from.challengeId) : null
    if (mine?.status === 'pending') {
      const mutual = mine.from === target.number && mine.to === from.number
      if (mutual && from.number < target.number) {
        cancelChallenge(mine, 'superseded')
      } else if (mutual) {
        return fail(socket, 'ANSWER_FIRST', `Table ${target.number} challenged you first — answer that.`)
      } else {
        return fail(socket, 'BUSY', 'You already have a challenge in play.')
      }
    }

    if (target.gameId) return fail(socket, 'TABLE_BUSY', `Table ${target.number} is already in a game.`)
    if (target.challengeId) return fail(socket, 'TABLE_BUSY', `Table ${target.number} has a challenge pending.`)

    const challenge = {
      id: nextId('ch'),
      from: from.number,
      to: target.number,
      item: menuItem,
      gameType: mod.id,
      status: 'pending',
      expiresAt: Date.now() + CHALLENGE_TTL,
      timeoutHandle: null
    }
    challenges.set(challenge.id, challenge)

    from.challengeId = challenge.id
    target.challengeId = challenge.id
    recomputeStatus(from)
    recomputeStatus(target)

    challenge.timeoutHandle = setTimeout(() => {
      const current = challenges.get(challenge.id)
      if (!current || current.status !== 'pending') return
      cancelChallenge(current, 'expired')
      syncAll()
    }, CHALLENGE_TTL)
    challenge.timeoutHandle.unref?.()

    socketFor(target)?.emit('challenge:incoming', {
      id: challenge.id,
      fromTable: challenge.from,
      item: challenge.item,
      gameType: challenge.gameType,
      gameName: mod.name,
      expiresAt: challenge.expiresAt
    })

    if (target.isBot) scheduleBotAccept(challenge.id)
    syncAll()
  })

  socket.on('challenge:respond', ({ challengeId, accept } = {}) => {
    const table = currentTable(socket)
    if (!table) return

    const challenge = challenges.get(challengeId)
    if (!challenge || challenge.status !== 'pending' || challenge.to !== table.number) {
      return fail(socket, 'GONE', 'That challenge is no longer available.')
    }

    if (!accept) {
      cancelChallenge(challenge, 'declined')
      syncAll()
      return
    }

    clearChallengeTimer(challenge)
    challenge.status = 'accepted'
    challenges.delete(challenge.id)
    startGame(challenge)
    syncAll()
  })

  socket.on('challenge:cancel', () => {
    const table = currentTable(socket)
    const challenge = table?.challengeId ? challenges.get(table.challengeId) : null
    if (!challenge || challenge.from !== table.number) return
    cancelChallenge(challenge, 'cancelled')
    syncAll()
  })

  socket.on('game:action', ({ gameId, ...payload } = {}) => {
    const table = currentTable(socket)
    if (!table) return
    if (applyAction(table.number, gameId, payload)) syncAll()
  })

  socket.on('game:claimWin', ({ gameId } = {}) => {
    const table = currentTable(socket)
    if (!table) return

    const game = games.get(gameId)
    if (!game || game.status !== 'active' || !game.players.includes(table.number)) return
    if (game.goneTable === null || game.goneTable === table.number) {
      return fail(socket, 'STILL_HERE', 'Your opponent is still connected.')
    }
    if (Date.now() < game.disconnectDeadline) {
      return fail(socket, 'TOO_SOON', 'Give them a few more seconds.')
    }

    endGame(game, table.number, 'forfeit')
    syncAll()
  })

  socket.on('result:dismiss', () => {
    const table = currentTable(socket)
    if (!table) return
    table.lastResult = null
    recomputeStatus(table)
    syncAll()
  })

  socket.on('staff:join', () => {
    socket.join('staff')
    socket.emit('staff:sync', { tickets: ticketList(), floorplan: getPlan() })
  })

  socket.on('staff:deliver', ({ ticketId } = {}) => {
    const ticket = tickets.get(ticketId)
    if (!ticket || ticket.status === 'delivered') return
    ticket.status = 'delivered'
    ticket.deliveredAt = Date.now()
    syncStaff()
  })

  socket.on('staff:savePlan', ({ plan } = {}) => {
    if (!savePlan(plan)) return fail(socket, 'BAD_PLAN', 'That layout could not be saved.')
    syncStaff()
    syncAll()
  })

  socket.on('staff:resetPlan', () => {
    resetPlan()
    syncStaff()
    syncAll()
  })

  socket.on('disconnect', () => {
    const number = socket.data.tableNumber
    if (!number) return

    const table = tables.get(number)
    // A newer device already took this table over; nothing to tear down.
    if (!table || table.socketId !== socket.id) return

    table.socketId = null

    if (table.challengeId) cancelChallenge(challenges.get(table.challengeId), 'disconnected')

    const game = table.gameId ? games.get(table.gameId) : null
    if (game && game.status === 'active') {
      game.goneTable = number
      game.disconnectDeadline = Date.now() + RECONNECT_GRACE
      table.status = 'playing'
    } else {
      recomputeStatus(table)
    }

    syncAll()
  })
}

function currentTable(socket) {
  const number = socket.data.tableNumber
  if (!number) return null
  const table = tables.get(number)
  return table && table.socketId === socket.id ? table : null
}
