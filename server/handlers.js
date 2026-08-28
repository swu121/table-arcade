import {
  MENU,
  CHALLENGE_TTL,
  RECONNECT_GRACE,
  MAX_MESSAGE,
  MAX_THREAD,
  MAX_NOTIFICATIONS,
  MAX_HISTORY,
  tables,
  challenges,
  games,
  tickets,
  conversations,
  getThread,
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

// Only the counts and flags ride along on every sync. Message bodies travel
// separately on chat:thread, so a busy room doesn't reship every conversation
// to every tablet on each state change.
function socialFor(table) {
  return {
    notifications: table.notifications,
    muted: table.muted,
    blocked: table.blocked,
    unread: table.unread
  }
}

function takenNumbers() {
  return [...tables.values()].filter(isOnline).map((t) => t.number)
}

function buildSync(table) {
  const base = { menu: MENU, games: gameMenu(), floorplan: getPlan(), taken: takenNumbers() }
  if (!table) {
    return {
      ...base,
      self: null,
      lobby: lobbyFor(null),
      challenge: null,
      game: null,
      lastResult: null,
      social: { notifications: [], muted: [], blocked: [], unread: {} }
    }
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
    lastResult: table.lastResult,
    social: socialFor(table)
  }
}

function syncAll() {
  for (const socket of io.sockets.sockets.values()) {
    const number = socket.data.tableNumber
    const table = number ? tables.get(number) : null
    socket.emit('state:sync', buildSync(table && table.socketId === socket.id ? table : null))
  }
  syncStaff()
}

function ticketList() {
  return [...tickets.values()].sort((a, b) => b.createdAt - a.createdAt)
}

function floorList() {
  return [...tables.values()]
    .sort((a, b) => a.number - b.number)
    .map((t) => ({
      number: t.number,
      status: t.status,
      isBot: t.isBot,
      seatedAt: t.seatedAt,
      history: t.history
    }))
}

const staffPayload = () => ({ tickets: ticketList(), floorplan: getPlan(), floor: floorList() })

function syncStaff() {
  io.to('staff').emit('staff:sync', staffPayload())
}

// Chat never lands here — staff get the table's actions, not its conversations.
function log(table, entry) {
  if (!table) return
  table.history.unshift({ id: nextId('h'), at: Date.now(), ...entry })
  if (table.history.length > MAX_HISTORY) table.history.length = MAX_HISTORY
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
    const other = number === challenge.from ? challenge.to : challenge.from
    log(tables.get(number), { kind: 'challengeEnded', otherTable: other, reason })
    const socket = socketFor(tables.get(number))
    if (socket) {
      socket.emit('challenge:ended', {
        reason,
        otherTable: number === challenge.from ? challenge.to : challenge.from
      })
    }
  }
}

/* --------------------------------------------------------------- social --- */

function isBlocked(target, sender) {
  return target.blocked.includes(sender)
}

function notify(table, entry) {
  if (!table) return
  table.notifications.unshift({ id: nextId('n'), at: Date.now(), read: false, ...entry })
  if (table.notifications.length > MAX_NOTIFICATIONS) {
    table.notifications.length = MAX_NOTIFICATIONS
  }
}

// Emoji are several code units each, so measure and slice by code point —
// a naive length cap would cut one in half and leave a replacement glyph.
function cleanMessage(raw) {
  if (typeof raw !== 'string') return null
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  const points = [...collapsed]
  return points.length > MAX_MESSAGE ? points.slice(0, MAX_MESSAGE).join('') : collapsed
}

function pushThread(table, otherNumber) {
  const thread = getThread(table.number, otherNumber)
  socketFor(table)?.emit('chat:thread', {
    withTable: otherNumber,
    messages: thread.messages,
    readAt: thread.readAt[otherNumber] ?? 0
  })
}

function appendMessage(from, to, text, delivered) {
  const thread = getThread(from, to)
  thread.messages.push({
    id: nextId('m'),
    from,
    to,
    text,
    at: Date.now(),
    deliveredAt: delivered ? Date.now() : null
  })
  if (thread.messages.length > MAX_THREAD) {
    thread.messages.splice(0, thread.messages.length - MAX_THREAD)
  }
}

// A table that reconnects after a drop has to collect everything that piled up
// while its socket was gone, otherwise those messages read "Sent" forever.
function flushDeliveries(table) {
  const now = Date.now()
  const partners = new Set()

  for (const thread of conversations.values()) {
    for (const message of thread.messages) {
      if (message.to === table.number && !message.deliveredAt) {
        message.deliveredAt = now
        partners.add(message.from)
      }
    }
  }

  for (const other of partners) {
    const sender = tables.get(other)
    if (sender) pushThread(sender, table.number)
  }
}

function markRead(table, otherNumber) {
  getThread(table.number, otherNumber).readAt[table.number] = Date.now()

  let changed = Boolean(table.unread[otherNumber])
  delete table.unread[otherNumber]
  for (const entry of table.notifications) {
    if (entry.kind === 'message' && entry.fromTable === otherNumber && !entry.read) {
      entry.read = true
      changed = true
    }
  }
  return changed
}

function deliverMessage(from, target, body) {
  appendMessage(from.number, target.number, body, Boolean(socketFor(target)) || target.isBot)

  if (target.viewing === from.number) {
    markRead(target, from.number)
  } else if (!target.muted.includes(from.number)) {
    // Muting silences the alert but not the conversation: the message still lands
    // in the thread, it just never badges the inbox or raises a toast.
    target.unread[from.number] = (target.unread[from.number] ?? 0) + 1
    notify(target, { kind: 'message', fromTable: from.number, preview: body })
    socketFor(target)?.emit('chat:ping', { fromTable: from.number, preview: body })
  }

  pushThread(from, target.number)
  pushThread(target, from.number)
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
    log(table, {
      kind: 'gameStart',
      otherTable: players.find((p) => p !== number),
      gameName: mod.name,
      item: game.item
    })
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
    log(table, { kind: 'result', ...table.lastResult })
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

const BOT_REPLIES = [
  'Ha, you wish 😏',
  'Say less — rack em up 🎯',
  "We're two pitchers deep, be gentle 🍺",
  'Bet 🔥',
  'Winner buys the next round 🍻',
  'Give us a sec, wings just landed 🍗',
  '👀',
  'Table champs over here 🏆'
]

const BOT_REPLY_MIN = 1200
const BOT_REPLY_SPREAD = 1600

function scheduleBotReply(botNumber, toNumber) {
  setTimeout(() => {
    const bot = tables.get(botNumber)
    const target = tables.get(toNumber)
    if (!bot?.isBot || !target || isBlocked(target, botNumber)) return
    markRead(bot, toNumber)
    deliverMessage(bot, target, BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)])
    syncAll()
  }, BOT_REPLY_MIN + Math.random() * BOT_REPLY_SPREAD).unref()
}

function scheduleBotThanks(botNumber, toNumber, item) {
  setTimeout(() => {
    const bot = tables.get(botNumber)
    const target = tables.get(toNumber)
    if (!bot?.isBot || !target || isBlocked(target, botNumber)) return
    markRead(bot, toNumber)
    deliverMessage(bot, target, `${item.name}?! You're a legend 🙏🍻`)
    syncAll()
  }, BOT_REPLY_MIN + Math.random() * BOT_REPLY_SPREAD).unref()
}

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
    const returning = table.socketId === socket.id
    table.socketId = socket.id
    socket.data.tableNumber = number
    if (!returning) {
      const first = table.seatedAt === null
      if (first) table.seatedAt = Date.now()
      log(table, { kind: first ? 'seated' : 'returned' })
    }

    // Reconnecting into a frozen game unfreezes it.
    const game = table.gameId ? games.get(table.gameId) : null
    if (game && game.goneTable === number) {
      game.goneTable = null
      game.disconnectDeadline = null
    }

    recomputeStatus(table)
    flushDeliveries(table)
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
    if (isBlocked(target, from.number)) {
      return fail(socket, 'BLOCKED', `Table ${target.number} isn't taking challenges right now.`)
    }
    if (isBlocked(from, target.number)) {
      return fail(socket, 'BLOCKED', `Unblock Table ${target.number} to challenge them.`)
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

    notify(target, {
      kind: 'challenge',
      fromTable: challenge.from,
      item: challenge.item,
      gameName: mod.name
    })

    log(from, { kind: 'challenge', direction: 'out', otherTable: target.number, item: menuItem, gameName: mod.name })
    log(target, { kind: 'challenge', direction: 'in', otherTable: from.number, item: menuItem, gameName: mod.name })

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

  socket.on('gift:send', ({ toTable, item } = {}) => {
    const from = currentTable(socket)
    if (!from) return fail(socket, 'NO_TABLE', 'Claim a table first.')

    const target = tables.get(Number(toTable))
    if (!target || target.status === 'gone') {
      return fail(socket, 'NO_TABLE', 'That table is not around right now.')
    }
    if (target.number === from.number) {
      return fail(socket, 'SELF', "You can't send your own table a round.")
    }
    if (isBlocked(target, from.number)) {
      return fail(socket, 'BLOCKED', `Table ${target.number} isn't taking anything right now.`)
    }

    const menuItem = MENU.find((m) => m.id === item)
    if (!menuItem) return fail(socket, 'BAD_ITEM', 'Pick something off the menu.')

    const ticket = {
      id: nextId('tk'),
      item: menuItem,
      owingTable: from.number,
      owedToTable: target.number,
      status: 'pending',
      createdAt: Date.now(),
      gameId: null,
      gameName: null,
      reason: 'gift'
    }
    tickets.set(ticket.id, ticket)

    log(from, { kind: 'gift', direction: 'out', otherTable: target.number, item: menuItem })
    log(target, { kind: 'gift', direction: 'in', otherTable: from.number, item: menuItem })

    notify(target, { kind: 'gift', fromTable: from.number, item: menuItem })
    socketFor(target)?.emit('gift:incoming', { fromTable: from.number, item: menuItem })
    socket.emit('gift:sent', { toTable: target.number, item: menuItem })

    if (target.isBot) scheduleBotThanks(target.number, from.number, menuItem)

    syncStaff()
    syncAll()
  })

  socket.on('chat:send', ({ toTable, text } = {}) => {
    const from = currentTable(socket)
    if (!from) return fail(socket, 'NO_TABLE', 'Claim a table first.')

    const target = tables.get(Number(toTable))
    if (!target || target.status === 'gone') {
      return fail(socket, 'NO_TABLE', 'That table is not around right now.')
    }
    if (target.number === from.number) {
      return fail(socket, 'SELF', "You can't message your own table.")
    }
    if (isBlocked(target, from.number)) {
      return fail(socket, 'BLOCKED', `Table ${target.number} isn't taking messages right now.`)
    }
    if (isBlocked(from, target.number)) {
      return fail(socket, 'BLOCKED', `Unblock Table ${target.number} to message them.`)
    }

    const body = cleanMessage(text)
    if (!body) return fail(socket, 'EMPTY', 'Type something first.')

    deliverMessage(from, target, body)
    if (target.isBot) scheduleBotReply(target.number, from.number)
    syncAll()
  })

  socket.on('chat:open', ({ withTable } = {}) => {
    const table = currentTable(socket)
    if (!table) return
    const other = Number(withTable)
    if (!Number.isInteger(other)) return

    table.viewing = other
    const changed = markRead(table, other)
    pushThread(table, other)

    // The other end is watching for its read receipts to flip, so it needs the
    // thread again even though none of its own state moved.
    const partner = tables.get(other)
    if (partner) pushThread(partner, table.number)

    if (changed) syncAll()
  })

  socket.on('chat:close', () => {
    const table = currentTable(socket)
    if (table) table.viewing = null
  })

  socket.on('chat:mute', ({ table: otherTable, muted } = {}) => {
    const table = currentTable(socket)
    if (!table) return
    const other = Number(otherTable)
    if (!Number.isInteger(other) || other === table.number) return

    table.muted = table.muted.filter((n) => n !== other)
    if (muted) table.muted.push(other)
    syncAll()
  })

  socket.on('chat:block', ({ table: otherTable, blocked } = {}) => {
    const table = currentTable(socket)
    if (!table) return
    const other = Number(otherTable)
    if (!Number.isInteger(other) || other === table.number) return

    table.blocked = table.blocked.filter((n) => n !== other)
    if (blocked) {
      table.blocked.push(other)
      // Drop anything they already sent, otherwise blocking leaves their
      // unread badge and notifications sitting there.
      delete table.unread[other]
      table.notifications = table.notifications.filter((n) => n.fromTable !== other)

      // A pending challenge from someone you just blocked has to go too.
      const challenge = table.challengeId ? challenges.get(table.challengeId) : null
      if (challenge && (challenge.from === other || challenge.to === other)) {
        cancelChallenge(challenge, 'declined')
      }
    }
    syncAll()
  })

  socket.on('notif:read', () => {
    const table = currentTable(socket)
    if (!table) return
    for (const entry of table.notifications) entry.read = true
    syncAll()
  })

  socket.on('notif:clear', () => {
    const table = currentTable(socket)
    if (!table) return
    table.notifications = []
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
    socket.emit('staff:sync', staffPayload())
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
    table.viewing = null
    log(table, { kind: 'left' })

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
