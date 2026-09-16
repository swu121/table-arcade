import { RECONNECT_GRACE, makeTable } from './state.js'
import { getGame } from './games/index.js'

// A room, suspended. Tonight's state is in memory on purpose, but a planned
// restart should not be the thing that ends the night: on the way out every
// room is written down in this shape, and on the way back in it is read back
// within the same grace a dropped tablet gets. Nothing socket-shaped is kept —
// no socket ids, no timer handles — because none of that survives a process,
// and every deadline is stored relative to the moment the snapshot was taken.
//
// {
//   v, slug, takenAt,
//   tables:     [{ ...table minus socketId/viewing }],
//   challenges: [{ ...challenge, expiresIn }],
//   games:      [{ ...game envelope, disconnectIn, age, state: mod.snapshot(state) }],
//   threads:    [{ key, messages, readAt }],
//   tickets:    [ticket]
// }

export const SNAPSHOT_VERSION = 1

const SOCKET_FIELDS = ['socketId', 'viewing']

export function snapshotRoom(room, now = Date.now()) {
  const tables = []
  for (const table of room.tables.values()) {
    const copy = structuredClone(table)
    for (const field of SOCKET_FIELDS) delete copy[field]
    tables.push(copy)
  }

  const challenges = []
  for (const challenge of room.challenges.values()) {
    if (challenge.status !== 'pending') continue
    const { timeoutHandle, goneTable, expiresAt, ...rest } = challenge
    challenges.push({ ...structuredClone(rest), expiresIn: expiresAt - now })
  }

  const games = []
  for (const game of room.games.values()) {
    if (game.status !== 'active') continue
    const { ctx, state, disconnectDeadline, createdAt, ...rest } = game
    const mod = getGame(game.type)
    games.push({
      ...structuredClone(rest),
      disconnectIn: disconnectDeadline === null ? null : disconnectDeadline - now,
      age: now - createdAt,
      state: mod?.snapshot ? mod.snapshot(state, now) : structuredClone(state)
    })
  }

  const threads = [...room.conversations.values()].map((thread) => structuredClone(thread))
  const tickets = [...room.tickets.values()].map((ticket) => structuredClone(ticket))

  return { v: SNAPSHOT_VERSION, slug: room.venue.slug, takenAt: now, tables, challenges, games, threads, tickets }
}

export const isEmptySnapshot = (snapshot) =>
  !snapshot.tables.some((t) => !t.isBot || t.history.length || t.notifications.length) &&
  !snapshot.challenges.length &&
  !snapshot.games.length &&
  !snapshot.threads.length &&
  !snapshot.tickets.length

// Why a snapshot was not applied, or null if it should be.
export function rejectSnapshot(room, snapshot, now = Date.now(), { grace = RECONNECT_GRACE } = {}) {
  if (!snapshot || typeof snapshot !== 'object') return 'not a snapshot'
  if (snapshot.v !== SNAPSHOT_VERSION) return `version ${snapshot.v} is not ${SNAPSHOT_VERSION}`
  if (snapshot.slug !== room.venue.slug) return `taken for ${snapshot.slug}`
  const age = now - Number(snapshot.takenAt)
  if (!Number.isFinite(age) || age < 0) return 'taken in the future'
  if (age > grace) return `${Math.round(age / 1000)}s old, older than the ${grace / 1000}s grace`
  return null
}

// Puts a snapshot back into a room. Every table comes back unbound: the
// tablets reconnect on their own and claim their numbers, and the usual
// reconnect path picks them up. Timers are not this module's business —
// handlers rebuild them from the deadlines restored here.
export function restoreRoom(room, snapshot, now = Date.now(), { grace = RECONNECT_GRACE, log = console.log } = {}) {
  const why = rejectSnapshot(room, snapshot, now, { grace })
  if (why) {
    log(`snapshot: discarding the one for ${room.venue.slug} — ${why}`)
    return false
  }

  try {
    const bots = new Set(room.venue.botTables)
    for (const saved of snapshot.tables ?? []) {
      const number = Number(saved.number)
      if (!Number.isInteger(number)) continue
      const isBot = bots.has(number)
      const table = { ...makeTable(number, isBot), ...structuredClone(saved), isBot, socketId: null, viewing: null }
      room.tables.set(number, table)
    }
    // A bot the venue gained since the snapshot still has to be on the floor.
    for (const number of bots) if (!room.tables.has(number)) room.tables.set(number, makeTable(number, true))

    for (const saved of snapshot.challenges ?? []) {
      const { expiresIn, ...rest } = saved
      const challenge = { ...structuredClone(rest), status: 'pending', expiresAt: now + Number(expiresIn ?? 0), timeoutHandle: null }
      room.challenges.set(challenge.id, challenge)
    }

    for (const saved of snapshot.games ?? []) {
      const mod = getGame(saved.type)
      if (!mod) continue
      const { disconnectIn, age, state, ...rest } = saved
      const game = {
        ...structuredClone(rest),
        status: 'active',
        disconnectDeadline: disconnectIn === null || disconnectIn === undefined ? null : now + Number(disconnectIn),
        createdAt: now - Number(age ?? 0),
        state: mod.restore ? mod.restore(state, now) : structuredClone(state)
      }
      room.games.set(game.id, game)
    }

    for (const saved of snapshot.threads ?? []) {
      if (typeof saved?.key !== 'string') continue
      room.conversations.set(saved.key, {
        key: saved.key,
        messages: Array.isArray(saved.messages) ? structuredClone(saved.messages) : [],
        readAt: saved.readAt && typeof saved.readAt === 'object' ? { ...saved.readAt } : {}
      })
    }

    for (const ticket of snapshot.tickets ?? []) {
      if (ticket?.id && !room.tickets.has(ticket.id)) room.tickets.set(ticket.id, structuredClone(ticket))
    }

    // Pointers into things that didn't make it (a game that had ended in the
    // same instant, say) must not leave a table wedged.
    for (const table of room.tables.values()) {
      if (table.gameId && !room.games.has(table.gameId)) table.gameId = null
      if (table.challengeId && !room.challenges.has(table.challengeId)) table.challengeId = null
    }
  } catch (error) {
    log(`snapshot: could not restore ${room.venue.slug} — ${error.message}`)
    return false
  }

  const { tables, challenges, games } = snapshot
  log(
    `snapshot: restored ${room.venue.slug} from ${Math.round((now - snapshot.takenAt) / 1000)}s ago — ` +
      `${tables.length} tables, ${challenges.length} challenges, ${games.length} games`
  )
  return true
}
