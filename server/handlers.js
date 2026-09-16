import {
  CHALLENGE_TTL,
  RECONNECT_GRACE,
  MAX_MESSAGE,
  MAX_THREAD,
  MAX_NOTIFICATIONS,
  MAX_HISTORY,
  createRoom,
  getThread,
  hasThread,
  nextId,
  makeTable
} from './state.js'
import { getGame, gameMenu, DEFAULT_GAME } from './games/index.js'
import { createPlanStore } from './floorplan.js'
import { createVenueRegistry, venueList } from './venues.js'
import { createMemoryRepos } from './db/index.js'

const BOT_ACCEPT_DELAY = 1500

// Every venue gets its own socket.io namespace, /venue/<slug>. A socket joins
// exactly one, and every handler below resolves its room from that namespace,
// so a tablet in one restaurant has no handle on another restaurant at all.
export const NAMESPACE = /^\/venue\/([a-z0-9-]+)$/

// `venues` is the list the caller loaded (see loadVenues in venues.js); `repos`
// is where floor plans and tickets go to survive a restart. Without either,
// this is the single demo venue with nothing kept past the process — which is
// what the tests want.
export function init(io, { repos = createMemoryRepos(), venues: list = null } = {}) {
  const venues = createVenueRegistry(venueList(list))
  const rooms = new Map()

  function roomFor(slug) {
    let room = rooms.get(slug)
    if (room) return room
    const venue = venues.get(slug)
    if (!venue) return null
    room = createRoom({
      venue,
      nsp: io.of(`/venue/${slug}`),
      plans: createPlanStore({ persist: (plan) => repos.floorplans.save(slug, plan) }),
      repos
    })
    room.ready = hydrate(room)
    rooms.set(slug, room)
    return room
  }

  const parent = io.of((name, _auth, next) => {
    const slug = name.match(NAMESPACE)?.[1]
    next(null, Boolean(slug && venues.get(slug)))
  })

  // Nobody's handlers attach until the room has its plan and open tickets
  // back, so the first tablet in after a restart sees the same board as the
  // last one out.
  parent.use((socket, next) => {
    const room = roomFor(socket.nsp.name.match(NAMESPACE)[1])
    if (!room) return next(new Error('Invalid namespace'))
    room.ready.then(() => next())
  })

  parent.on('connection', (socket) => {
    const room = roomFor(socket.nsp.name.match(NAMESPACE)[1])
    if (!room) return socket.disconnect(true)
    onConnection(room, socket)
  })

  const sweeper = setInterval(() => rooms.forEach(sweep), 10_000)
  sweeper.unref()

  return { venues, roomFor, rooms, stop: () => clearInterval(sweeper) }
}

/* --------------------------------------------------------- persistence --- */

// What the repository kept for this venue, back into the room. Either half
// failing leaves the room on its defaults rather than refusing the night.
async function hydrate(room) {
  const { repos, venue } = room
  try {
    const plan = await repos.floorplans.get(venue.slug)
    if (plan) room.plans.load(plan)
  } catch (error) {
    console.warn(`db: could not load the floor plan for ${venue.slug} —`, error.message)
  }
  try {
    for (const ticket of await repos.tickets.openFor(venue.slug)) room.tickets.set(ticket.id, ticket)
  } catch (error) {
    console.warn(`db: could not load open tickets for ${venue.slug} —`, error.message)
  }
}

// Durable writes ride behind the broadcast. The room's Map is what staff see
// tonight; the repository is what they see after a restart. A failed write is
// logged with enough to find it, never thrown into a socket handler.
function keep(room, what, write) {
  Promise.resolve()
    .then(write)
    .catch((error) => console.warn(`db: ${what} failed for ${room.venue.slug} —`, error.message))
}

/* ---------------------------------------------------------------- sync --- */

// Bound: a tablet is holding this number, so nobody else may claim it.
// Online: someone actually sat down and signed in, so the floor can reach them.
function isBound(table) {
  return table.isBot || table.socketId !== null
}

function isOnline(table) {
  return table.isBot || (table.socketId !== null && table.signedIn)
}

function recomputeStatus(room, table) {
  if (table.gameId && room.games.has(table.gameId)) {
    table.status = 'playing'
    return
  }
  if (table.challengeId && room.challenges.has(table.challengeId)) {
    const challenge = room.challenges.get(table.challengeId)
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

function lobbyFor(room, me) {
  return [...room.tables.values()]
    .filter((t) => t.number !== me && t.status !== 'gone')
    .sort((a, b) => a.number - b.number)
    // `known` is whether the two tables share a thread yet. On the floor plan
    // that decides whether a tap opens the conversation or starts a challenge.
    .map((t) => ({ number: t.number, status: t.status, known: me !== null && hasThread(room, me, t.number) }))
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

function takenNumbers(room) {
  return [...room.tables.values()].filter(isBound).map((t) => t.number)
}

const venueInfo = (room) => ({ slug: room.venue.slug, name: room.venue.name })

function buildSync(room, table) {
  const base = {
    venue: venueInfo(room),
    menu: room.venue.menu,
    games: gameMenu(),
    floorplan: room.plans.get(),
    taken: takenNumbers(room)
  }
  if (!table) {
    return {
      ...base,
      self: null,
      lobby: lobbyFor(room, null),
      challenge: null,
      game: null,
      lastResult: null,
      social: { notifications: [], muted: [], blocked: [], unread: {} }
    }
  }

  const challenge = table.challengeId ? room.challenges.get(table.challengeId) : null
  const game = table.gameId ? room.games.get(table.gameId) : null

  return {
    ...base,
    self: { number: table.number, status: table.status, signedIn: table.signedIn },
    lobby: lobbyFor(room, table.number),
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

function syncAll(room) {
  for (const socket of room.nsp.sockets.values()) {
    const number = socket.data.tableNumber
    const table = number ? room.tables.get(number) : null
    socket.emit('state:sync', buildSync(room, table && table.socketId === socket.id ? table : null))
  }
  syncStaff(room)
}

function ticketList(room) {
  return [...room.tickets.values()].sort((a, b) => b.createdAt - a.createdAt)
}

function floorList(room) {
  return [...room.tables.values()]
    .sort((a, b) => a.number - b.number)
    .map((t) => ({
      number: t.number,
      status: t.status,
      isBot: t.isBot,
      seatedAt: t.seatedAt,
      history: t.history
    }))
}

const staffPayload = (room) => ({
  venue: venueInfo(room),
  tickets: ticketList(room),
  floorplan: room.plans.get(),
  floor: floorList(room)
})

function syncStaff(room) {
  room.nsp.to('staff').emit('staff:sync', staffPayload(room))
}

// Chat never lands here — staff get the table's actions, not its conversations.
function log(table, entry) {
  if (!table) return
  table.history.unshift({ id: nextId('h'), at: Date.now(), ...entry })
  if (table.history.length > MAX_HISTORY) table.history.length = MAX_HISTORY
}

function socketFor(room, table) {
  if (!table?.socketId) return null
  return room.nsp.sockets.get(table.socketId) ?? null
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

function detachChallenge(room, challenge) {
  clearChallengeTimer(challenge)
  room.challenges.delete(challenge.id)
  for (const number of [challenge.from, challenge.to]) {
    const table = room.tables.get(number)
    if (table?.challengeId === challenge.id) {
      table.challengeId = null
      recomputeStatus(room, table)
    }
  }
}

function cancelChallenge(room, challenge, reason) {
  if (!challenge || challenge.status !== 'pending') return
  challenge.status = reason
  detachChallenge(room, challenge)

  // Who the ending is attributed to: the challenged table for a decline or a
  // timeout, the challenger for a cancel. A drop names whoever went.
  const line = ENDED_NOTE[reason]
  if (line) {
    const by = reason === 'cancelled' ? challenge.from : reason === 'disconnected' ? challenge.goneTable ?? challenge.to : challenge.to
    note(room, challenge.from, challenge.to, 'challengeEnded', line(by, challenge.item.name))
  }

  for (const number of [challenge.from, challenge.to]) {
    const other = number === challenge.from ? challenge.to : challenge.from
    log(room.tables.get(number), { kind: 'challengeEnded', otherTable: other, reason })
    const socket = socketFor(room, room.tables.get(number))
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

function pushThread(room, table, otherNumber) {
  const thread = getThread(room, table.number, otherNumber)
  socketFor(room, table)?.emit('chat:thread', {
    withTable: otherNumber,
    messages: thread.messages,
    readAt: thread.readAt[otherNumber] ?? 0
  })
}

function appendMessage(room, from, to, text, delivered) {
  const thread = getThread(room, from, to)
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

// A line in the thread that neither table wrote: the room noting what happened
// between them. It has no recipient, so it never counts as unread or undelivered,
// and both ends get the thread again so an open chat shows it land.
function note(room, a, b, kind, text, extra = {}) {
  const thread = getThread(room, a, b)
  thread.messages.push({ id: nextId('m'), from: null, to: null, system: true, kind, text, at: Date.now(), ...extra })
  if (thread.messages.length > MAX_THREAD) {
    thread.messages.splice(0, thread.messages.length - MAX_THREAD)
  }
  const ta = room.tables.get(a)
  const tb = room.tables.get(b)
  if (ta) pushThread(room, ta, b)
  if (tb) pushThread(room, tb, a)
}

const ENDED_NOTE = {
  declined: (by, item) => `Table ${by} passed on playing for ${item}.`,
  expired: (by) => `Table ${by} didn't answer in time.`,
  cancelled: (by) => `Table ${by} called the challenge off.`,
  disconnected: (by) => `Table ${by} dropped off before answering.`
}

// A table that reconnects after a drop has to collect everything that piled up
// while its socket was gone, otherwise those messages read "Sent" forever.
function flushDeliveries(room, table) {
  const now = Date.now()
  const partners = new Set()

  for (const thread of room.conversations.values()) {
    for (const message of thread.messages) {
      if (message.to === table.number && !message.deliveredAt) {
        message.deliveredAt = now
        partners.add(message.from)
      }
    }
  }

  for (const other of partners) {
    const sender = room.tables.get(other)
    if (sender) pushThread(room, sender, table.number)
  }
}

function markRead(room, table, otherNumber) {
  getThread(room, table.number, otherNumber).readAt[table.number] = Date.now()

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

function deliverMessage(room, from, target, body) {
  appendMessage(room, from.number, target.number, body, Boolean(socketFor(room, target)) || target.isBot)

  if (target.viewing === from.number) {
    markRead(room, target, from.number)
  } else if (!target.muted.includes(from.number)) {
    // Muting silences the alert but not the conversation: the message still lands
    // in the thread, it just never badges the inbox or raises a toast.
    target.unread[from.number] = (target.unread[from.number] ?? 0) + 1
    notify(target, { kind: 'message', fromTable: from.number, preview: body })
    socketFor(room, target)?.emit('chat:ping', { fromTable: from.number, preview: body })
  }

  pushThread(room, from, target.number)
  pushThread(room, target, from.number)
}

// A table turning over. Nothing the last party said, ordered or played should
// follow them out the door and greet whoever sits down next.
function wipeTable(room, table) {
  if (table.challengeId) cancelChallenge(room, room.challenges.get(table.challengeId), 'cancelled')
  if (table.gameId) {
    const game = room.games.get(table.gameId)
    if (game) voidGame(room, game)
  }

  const partners = new Set()
  for (const [key, thread] of room.conversations) {
    const pair = key.split('-').map(Number)
    if (!pair.includes(table.number)) continue
    room.conversations.delete(key)
    if (thread.messages.length) partners.add(pair.find((n) => n !== table.number))
  }

  for (const [id, ticket] of room.tickets) {
    if (ticket.owingTable === table.number || ticket.owedToTable === table.number) room.tickets.delete(id)
  }
  keep(room, `clearing tickets for table ${table.number}`, () => room.repos.tickets.clearFor(room.venue.slug, table.number))

  table.history = []
  table.notifications = []
  table.muted = []
  table.blocked = []
  table.unread = {}
  table.lastResult = null
  table.viewing = null
  // Clearing a table is the party leaving, so the tablet drops back to its sign-in
  // screen and the table goes dark until the next one sits down.
  table.signedIn = false
  table.seatedAt = null
  recomputeStatus(room, table)

  // The other end of every wiped thread is still holding its own copy, and its
  // inbox still quotes messages that no longer exist anywhere.
  for (const other of partners) {
    pushThread(room, table, other)
    const partner = room.tables.get(other)
    if (!partner) continue
    delete partner.unread[table.number]
    partner.notifications = partner.notifications.filter(
      (entry) => !(entry.kind === 'message' && entry.fromTable === table.number)
    )
    pushThread(room, partner, table.number)
  }
}

/* ----------------------------------------------------------------- game --- */

// Everything a game module is allowed to reach for: who's a bot, a timer that
// dies with the game, a way to submit an action, and a way to call it.
function contextFor(room, game) {
  return {
    isBot: (number) => room.tables.get(number)?.isBot === true,

    after(ms, fn) {
      const handle = setTimeout(() => {
        if (room.games.get(game.id) !== game || game.status !== 'active') return
        fn()
      }, ms)
      handle.unref?.()
    },

    act(number, payload) {
      if (applyAction(room, number, game.id, payload)) syncAll(room)
    },

    finish(ended) {
      if (room.games.get(game.id) !== game || game.status !== 'active') return
      endGame(room, game, ended.winner, ended.reason)
      syncAll(room)
    }
  }
}

function startGame(room, challenge) {
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
  game.ctx = contextFor(room, game)
  room.games.set(game.id, game)

  for (const number of players) {
    const table = room.tables.get(number)
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

  note(room, players[0], players[1], 'gameStart', `Game on — ${mod.name} for ${game.item.name}.`)

  mod.tick?.(game, game.ctx)
  return game
}

function endGame(room, game, winner, reason) {
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
    room.tickets.set(ticket.id, ticket)
    keep(room, `saving ticket ${ticket.id}`, () => room.repos.tickets.create(room.venue.slug, ticket))
  }

  for (const number of game.players) {
    const table = room.tables.get(number)
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
    recomputeStatus(room, table)
    log(table, { kind: 'result', ...table.lastResult })
    socketFor(room, table)?.emit('game:over', table.lastResult)
  }

  const [a, b] = game.players
  if (winner === null) {
    note(room, a, b, 'result', `${mod.name} ended in a draw. Nobody pays for the ${game.item.name}.`, { winner: null })
  } else {
    const loser = game.players.find((p) => p !== winner)
    const how =
      reason === 'quit'
        ? `Table ${loser} walked away from ${mod.name}.`
        : reason === 'forfeit'
          ? `Table ${loser} never came back to ${mod.name}.`
          : `Table ${winner} beat Table ${loser} at ${mod.name}.`
    note(room, a, b, 'result', `${how} ${game.item.name} is on Table ${loser}.`, { winner })
  }

  room.games.delete(game.id)
  syncStaff(room)
}

function voidGame(room, game) {
  game.status = 'void'
  note(room, game.players[0], game.players[1], 'challengeEnded', `The ${getGame(game.type).name} game was called off.`)
  for (const number of game.players) {
    const table = room.tables.get(number)
    if (!table) continue
    table.gameId = null
    recomputeStatus(room, table)
  }
  room.games.delete(game.id)
}

function applyAction(room, tableNumber, gameId, payload) {
  const game = room.games.get(gameId)
  if (!game || game.status !== 'active') return false
  if (!game.players.includes(tableNumber)) return false
  if (game.goneTable !== null) return false

  const mod = getGame(game.type)
  const result = mod.action(game, tableNumber, payload)
  if (!result) return false

  if (result.ended) {
    endGame(room, game, result.ended.winner, result.ended.reason)
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

function scheduleBotReply(room, botNumber, toNumber) {
  setTimeout(() => {
    const bot = room.tables.get(botNumber)
    const target = room.tables.get(toNumber)
    if (!bot?.isBot || !target || isBlocked(target, botNumber)) return
    markRead(room, bot, toNumber)
    deliverMessage(room, bot, target, BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)])
    syncAll(room)
  }, BOT_REPLY_MIN + Math.random() * BOT_REPLY_SPREAD).unref()
}

function scheduleBotThanks(room, botNumber, toNumber, item) {
  setTimeout(() => {
    const bot = room.tables.get(botNumber)
    const target = room.tables.get(toNumber)
    if (!bot?.isBot || !target || isBlocked(target, botNumber)) return
    markRead(room, bot, toNumber)
    deliverMessage(room, bot, target, `${item.name}?! You're a legend 🙏🍻`)
    syncAll(room)
  }, BOT_REPLY_MIN + Math.random() * BOT_REPLY_SPREAD).unref()
}

function scheduleBotAccept(room, challengeId) {
  setTimeout(() => {
    const challenge = room.challenges.get(challengeId)
    if (!challenge || challenge.status !== 'pending') return
    clearChallengeTimer(challenge)
    challenge.status = 'accepted'
    room.challenges.delete(challenge.id)
    startGame(room, challenge)
    syncAll(room)
  }, BOT_ACCEPT_DELAY).unref()
}

// A human who walks away mid-game against a bot would otherwise pin that bot as
// "playing" for the rest of the night. Void it rather than bill an absent table.
function sweep(room) {
  let dirty = false
  for (const game of [...room.games.values()]) {
    if (game.goneTable === null || game.status !== 'active') continue
    const remaining = game.players.find((p) => p !== game.goneTable)
    if (!room.tables.get(remaining)?.isBot) continue
    if (Date.now() < game.disconnectDeadline + 30_000) continue
    voidGame(room, game)
    dirty = true
  }
  if (dirty) syncAll(room)
}

/* ----------------------------------------------------------- connection --- */

function onConnection(room, socket) {
  socket.emit('state:sync', buildSync(room, null))

  // The sync sent on connection can land before the client has its listener
  // attached, and an unassigned tablet has nothing else to say — without this it
  // would sit on the connecting screen forever.
  socket.on('state:hello', () => {
    socket.emit('state:sync', buildSync(room, currentTable(room, socket)))
  })

  socket.on('table:claim', ({ tableNumber } = {}) => {
    const number = Number(tableNumber)
    if (!Number.isInteger(number) || number < 1 || number > 99) {
      return fail(socket, 'BAD_TABLE', 'Pick a table number between 1 and 99.')
    }

    const existing = room.tables.get(number)
    if (existing?.isBot) {
      return fail(socket, 'TABLE_TAKEN', `Table ${number} is already in play.`)
    }

    // This socket was previously bound to a different table.
    const previous = socket.data.tableNumber ? room.tables.get(socket.data.tableNumber) : null
    if (previous && previous.number !== number && previous.socketId === socket.id) {
      previous.socketId = null
      recomputeStatus(room, previous)
    }

    // Last claim wins — boot the stale device so the lobby has no ghosts.
    if (existing?.socketId && existing.socketId !== socket.id) {
      const stale = room.nsp.sockets.get(existing.socketId)
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
    room.tables.set(number, table)
    const returning = table.socketId === socket.id
    table.socketId = socket.id
    socket.data.tableNumber = number
    // A party that was already signed in when the tablet dropped is coming back,
    // not arriving. An empty tablet booting up is neither.
    if (!returning && table.signedIn) log(table, { kind: 'returned' })

    // Reconnecting into a frozen game unfreezes it.
    const game = table.gameId ? room.games.get(table.gameId) : null
    if (game && game.goneTable === number) {
      game.goneTable = null
      game.disconnectDeadline = null
    }

    recomputeStatus(room, table)
    flushDeliveries(room, table)
    syncAll(room)
  })

  socket.on('table:signIn', () => {
    const number = socket.data.tableNumber
    const table = number ? room.tables.get(number) : null
    if (!table || table.socketId !== socket.id) return fail(socket, 'NO_TABLE', 'Claim a table first.')
    if (table.signedIn) return

    table.signedIn = true
    table.seatedAt = Date.now()
    log(table, { kind: 'seated' })
    recomputeStatus(room, table)
    syncAll(room)
  })

  socket.on('challenge:send', ({ toTable, item, gameType } = {}) => {
    const from = currentTable(room, socket)
    if (!from) return fail(socket, 'NO_TABLE', 'Claim a table first.')

    const target = room.tables.get(Number(toTable))
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

    const menuItem = room.venue.menu.find((m) => m.id === item)
    if (!menuItem) return fail(socket, 'BAD_ITEM', 'Pick something off the menu.')

    const mod = getGame(gameType)
    if (!mod) return fail(socket, 'BAD_GAME', 'Pick a game to play.')

    if (from.gameId) return fail(socket, 'BUSY', "You're already in a game.")

    const mine = from.challengeId ? room.challenges.get(from.challengeId) : null
    if (mine?.status === 'pending') {
      const mutual = mine.from === target.number && mine.to === from.number
      if (mutual && from.number < target.number) {
        cancelChallenge(room, mine, 'superseded')
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
    room.challenges.set(challenge.id, challenge)

    from.challengeId = challenge.id
    target.challengeId = challenge.id
    recomputeStatus(room, from)
    recomputeStatus(room, target)

    challenge.timeoutHandle = setTimeout(() => {
      const current = room.challenges.get(challenge.id)
      if (!current || current.status !== 'pending') return
      cancelChallenge(room, current, 'expired')
      syncAll(room)
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

    // A challenge is how two tables meet. From here on they share a thread, and
    // tapping either one on the floor opens it instead of another challenge sheet.
    note(room, from.number, target.number, 'challenge', `Table ${from.number} challenged Table ${target.number} to ${mod.name} for ${menuItem.name}.`)

    socketFor(room, target)?.emit('challenge:incoming', {
      id: challenge.id,
      fromTable: challenge.from,
      item: challenge.item,
      gameType: challenge.gameType,
      gameName: mod.name,
      expiresAt: challenge.expiresAt
    })

    if (target.isBot) scheduleBotAccept(room, challenge.id)
    syncAll(room)
  })

  socket.on('challenge:respond', ({ challengeId, accept } = {}) => {
    const table = currentTable(room, socket)
    if (!table) return

    const challenge = room.challenges.get(challengeId)
    if (!challenge || challenge.status !== 'pending' || challenge.to !== table.number) {
      return fail(socket, 'GONE', 'That challenge is no longer available.')
    }

    if (!accept) {
      cancelChallenge(room, challenge, 'declined')
      syncAll(room)
      return
    }

    clearChallengeTimer(challenge)
    challenge.status = 'accepted'
    room.challenges.delete(challenge.id)
    startGame(room, challenge)
    syncAll(room)
  })

  socket.on('challenge:cancel', () => {
    const table = currentTable(room, socket)
    const challenge = table?.challengeId ? room.challenges.get(table.challengeId) : null
    if (!challenge || challenge.from !== table.number) return
    cancelChallenge(room, challenge, 'cancelled')
    syncAll(room)
  })

  socket.on('gift:send', ({ toTable, item } = {}) => {
    const from = currentTable(room, socket)
    if (!from) return fail(socket, 'NO_TABLE', 'Claim a table first.')

    const target = room.tables.get(Number(toTable))
    if (!target || target.status === 'gone') {
      return fail(socket, 'NO_TABLE', 'That table is not around right now.')
    }
    if (target.number === from.number) {
      return fail(socket, 'SELF', "You can't send your own table a round.")
    }
    if (isBlocked(target, from.number)) {
      return fail(socket, 'BLOCKED', `Table ${target.number} isn't taking anything right now.`)
    }

    const menuItem = room.venue.menu.find((m) => m.id === item)
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
    room.tickets.set(ticket.id, ticket)
    keep(room, `saving ticket ${ticket.id}`, () => room.repos.tickets.create(room.venue.slug, ticket))

    log(from, { kind: 'gift', direction: 'out', otherTable: target.number, item: menuItem })
    log(target, { kind: 'gift', direction: 'in', otherTable: from.number, item: menuItem })

    notify(target, { kind: 'gift', fromTable: from.number, item: menuItem })
    socketFor(room, target)?.emit('gift:incoming', { fromTable: from.number, item: menuItem })
    socket.emit('gift:sent', { toTable: target.number, item: menuItem })

    if (target.isBot) scheduleBotThanks(room, target.number, from.number, menuItem)

    syncStaff(room)
    syncAll(room)
  })

  socket.on('chat:send', ({ toTable, text } = {}) => {
    const from = currentTable(room, socket)
    if (!from) return fail(socket, 'NO_TABLE', 'Claim a table first.')

    const target = room.tables.get(Number(toTable))
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

    deliverMessage(room, from, target, body)
    if (target.isBot) scheduleBotReply(room, target.number, from.number)
    syncAll(room)
  })

  socket.on('chat:open', ({ withTable } = {}) => {
    const table = currentTable(room, socket)
    if (!table) return
    const other = Number(withTable)
    if (!Number.isInteger(other)) return

    table.viewing = other
    // Opening a thread that didn't exist creates it, and the floor plan on both
    // ends needs to know the pair is now acquainted.
    const created = !hasThread(room, table.number, other)
    const changed = markRead(room, table, other) || created
    pushThread(room, table, other)

    // The other end is watching for its read receipts to flip, so it needs the
    // thread again even though none of its own state moved.
    const partner = room.tables.get(other)
    if (partner) pushThread(room, partner, table.number)

    if (changed) syncAll(room)
  })

  socket.on('chat:close', () => {
    const table = currentTable(room, socket)
    if (table) table.viewing = null
  })

  socket.on('chat:mute', ({ table: otherTable, muted } = {}) => {
    const table = currentTable(room, socket)
    if (!table) return
    const other = Number(otherTable)
    if (!Number.isInteger(other) || other === table.number) return

    table.muted = table.muted.filter((n) => n !== other)
    if (muted) table.muted.push(other)
    syncAll(room)
  })

  socket.on('chat:block', ({ table: otherTable, blocked } = {}) => {
    const table = currentTable(room, socket)
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
      const challenge = table.challengeId ? room.challenges.get(table.challengeId) : null
      if (challenge && (challenge.from === other || challenge.to === other)) {
        cancelChallenge(room, challenge, 'declined')
      }
    }
    syncAll(room)
  })

  socket.on('notif:read', () => {
    const table = currentTable(room, socket)
    if (!table) return
    for (const entry of table.notifications) entry.read = true
    syncAll(room)
  })

  socket.on('notif:clear', () => {
    const table = currentTable(room, socket)
    if (!table) return
    table.notifications = []
    syncAll(room)
  })

  socket.on('game:action', ({ gameId, ...payload } = {}) => {
    const table = currentTable(room, socket)
    if (!table) return
    if (applyAction(room, table.number, gameId, payload)) syncAll(room)
  })

  socket.on('game:claimWin', ({ gameId } = {}) => {
    const table = currentTable(room, socket)
    if (!table) return

    const game = room.games.get(gameId)
    if (!game || game.status !== 'active' || !game.players.includes(table.number)) return
    if (game.goneTable === null || game.goneTable === table.number) {
      return fail(socket, 'STILL_HERE', 'Your opponent is still connected.')
    }
    if (Date.now() < game.disconnectDeadline) {
      return fail(socket, 'TOO_SOON', 'Give them a few more seconds.')
    }

    endGame(room, game, table.number, 'forfeit')
    syncAll(room)
  })

  socket.on('game:forfeit', ({ gameId } = {}) => {
    const table = currentTable(room, socket)
    if (!table) return

    const game = room.games.get(gameId)
    if (!game || game.status !== 'active' || !game.players.includes(table.number)) return

    // Distinct from 'forfeit', which is a claim on someone who never came back.
    endGame(room, game, game.players.find((p) => p !== table.number), 'quit')
    syncAll(room)
  })

  socket.on('result:dismiss', () => {
    const table = currentTable(room, socket)
    if (!table) return
    table.lastResult = null
    recomputeStatus(room, table)
    syncAll(room)
  })

  socket.on('staff:join', () => {
    socket.join('staff')
    socket.emit('staff:sync', staffPayload(room))
  })

  socket.on('staff:deliver', ({ ticketId } = {}) => {
    const ticket = room.tickets.get(ticketId)
    if (!ticket || ticket.status === 'delivered') return
    ticket.status = 'delivered'
    ticket.deliveredAt = Date.now()
    keep(room, `delivering ticket ${ticket.id}`, () => room.repos.tickets.deliver(room.venue.slug, ticket.id, ticket.deliveredAt))
    syncStaff(room)
  })

  socket.on('staff:clearTable', ({ number } = {}) => {
    const table = room.tables.get(Number(number))
    if (!table) return
    wipeTable(room, table)
    syncAll(room)
  })

  socket.on('staff:savePlan', ({ plan } = {}) => {
    if (!room.plans.save(plan)) return fail(socket, 'BAD_PLAN', 'That layout could not be saved.')
    syncStaff(room)
    syncAll(room)
  })

  socket.on('staff:resetPlan', () => {
    room.plans.reset()
    syncStaff(room)
    syncAll(room)
  })

  socket.on('disconnect', () => {
    const number = socket.data.tableNumber
    if (!number) return

    const table = room.tables.get(number)
    // A newer device already took this table over; nothing to tear down.
    if (!table || table.socketId !== socket.id) return

    table.socketId = null
    table.viewing = null
    if (table.signedIn) log(table, { kind: 'left' })

    if (table.challengeId) {
      const challenge = room.challenges.get(table.challengeId)
      if (challenge) challenge.goneTable = table.number
      cancelChallenge(room, challenge, 'disconnected')
    }

    const game = table.gameId ? room.games.get(table.gameId) : null
    if (game && game.status === 'active') {
      game.goneTable = number
      game.disconnectDeadline = Date.now() + RECONNECT_GRACE
      table.status = 'playing'
    } else {
      recomputeStatus(room, table)
    }

    syncAll(room)
  })
}

function currentTable(room, socket) {
  const number = socket.data.tableNumber
  if (!number) return null
  const table = room.tables.get(number)
  return table && table.socketId === socket.id ? table : null
}
