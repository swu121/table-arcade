import { randomBytes } from 'node:crypto'
import { hashToken } from './db/devices.js'
import { createRateLimiter } from './ratelimit.js'

// Staff login. The staff screen is admitted to a venue's namespace only with
// a session token that venue's login route issued, and every staff:* event
// checks that the socket came in that way. Users live in the staff repo,
// passwords hashed; sessions live in memory, per room, hashed — a restart
// logs everyone out, which is fine for now (they are a snapshot candidate
// once the room's live state is snapshotted too).

export const SESSION_TTL = 14 * 24 * 60 * 60_000
// Login attempts allowed per minute, per IP and per venue.
export const LOGIN_LIMIT = 10
export const LOGIN_WINDOW = 60_000

export const newSessionToken = () => randomBytes(32).toString('base64url')

// The dev door: with no database of staff yet, the dev server and the tests
// still need a staff screen. Outside production, a venue with no active
// staff users admits `auth.staff === 'dev'`. The moment a user exists the
// door is shut, and it never opens in production.
export const DEV_TOKEN = 'dev'
export const devDoorAllowed = () => process.env.NODE_ENV !== 'production'

export async function devDoorOpen(room) {
  if (!devDoorAllowed()) return false
  try {
    return (await room.repos.staff.list(room.venue.slug)).length === 0
  } catch (error) {
    console.warn(`staff: could not list users for ${room.venue.slug} —`, error.message)
    return false
  }
}

/* ----------------------------------------------------------- sessions --- */

// One store per room. Tokens are looked up by hash; each use pushes the
// expiry out another TTL.
export function createStaffSessions({ ttl = SESSION_TTL } = {}) {
  const sessions = new Map() // tokenHash -> { userId, name, email, expiresAt }
  const attempts = createRateLimiter({ limit: LOGIN_LIMIT, window: LOGIN_WINDOW })

  const sweep = (now = Date.now()) => {
    for (const [hash, session] of sessions) if (session.expiresAt <= now) sessions.delete(hash)
    attempts.sweep(now)
  }

  return {
    create(user, now = Date.now()) {
      sweep(now)
      const token = newSessionToken()
      const expiresAt = now + ttl
      sessions.set(hashToken(token), { userId: user.id, name: user.name, email: user.email, expiresAt })
      return { token, expiresAt }
    },

    // The session for a token, or null; a hit slides the expiry.
    resolve(token, now = Date.now()) {
      sweep(now)
      if (typeof token !== 'string' || !token) return null
      const hash = hashToken(token)
      const session = sessions.get(hash)
      if (!session) return null
      session.expiresAt = now + ttl
      return { ...session, hash }
    },

    revoke(token) {
      return sessions.delete(hashToken(String(token ?? '')))
    },

    revokeUser(userId) {
      let count = 0
      for (const [hash, session] of sessions) {
        if (session.userId !== userId) continue
        sessions.delete(hash)
        count += 1
      }
      return count
    },

    overLoginLimit: (now) => attempts.hit('venue', now),

    live: () => {
      sweep()
      return sessions.size
    }
  }
}

/* ---------------------------------------------------------- handshake --- */

// The namespace middleware's half for staff. A handshake carrying `auth.staff`
// is a staff screen and nothing else: it is admitted with `socket.data.staff`
// set on a live session (or through the dev door), and refused otherwise. It
// never falls back to the tablet path, so a tablet cannot become staff and a
// staff screen never holds a device.
export async function authenticateStaff(room, socket) {
  const auth = socket.handshake?.auth ?? {}
  const token = typeof auth.staff === 'string' ? auth.staff : ''

  if (token === DEV_TOKEN) {
    if (!(await devDoorOpen(room))) throw new Error('Unauthorized')
    socket.data.staff = { id: 'dev', name: 'Developer', email: null, dev: true }
    return socket.data.staff
  }

  const session = room.staffSessions.resolve(token)
  if (!session) throw new Error('Unauthorized')
  socket.data.staff = { id: session.userId, name: session.name, email: session.email }
  socket.data.staffSession = session.hash
  return socket.data.staff
}

/* --------------------------------------------------------------- list --- */

// What the staff screen shows under "Staff": every active user for the venue.
export async function staffList(room) {
  return room.repos.staff.list(room.venue.slug)
}

export async function broadcastStaff(room) {
  try {
    room.nsp.to('staff').emit('staff:users', { users: await staffList(room) })
  } catch (error) {
    console.warn(`staff: could not list users for ${room.venue.slug} —`, error.message)
  }
}

// Every socket signed in as this user is told why, then dropped.
export function kickStaffUser(room, userId, reason = 'revoked') {
  let kicked = 0
  for (const socket of room.nsp.sockets.values()) {
    if (socket.data.staff?.id !== userId) continue
    socket.emit('staff:signedOut', { reason })
    socket.disconnect(true)
    kicked += 1
  }
  return kicked
}

// Every socket holding this exact session (a logout from one browser).
export function kickStaffSession(room, hash, reason = 'logout') {
  let kicked = 0
  for (const socket of room.nsp.sockets.values()) {
    if (socket.data.staffSession !== hash) continue
    socket.emit('staff:signedOut', { reason })
    socket.disconnect(true)
    kicked += 1
  }
  return kicked
}

/* --------------------------------------------------------------- HTTP --- */

const bearer = (req) => {
  const header = String(req.get?.('authorization') ?? '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

// POST /api/venue/:slug/staff/login  { email, password }  ->  { token, name, expiresAt }
//
// One answer for a wrong password, an unknown email and a revoked user, so
// the form cannot be used to find out which. Rate-limited per IP across every
// venue and per venue.
export function loginHandler({ roomFor }) {
  const perIp = createRateLimiter({ limit: LOGIN_LIMIT, window: LOGIN_WINDOW })
  return async (req, res) => {
    const room = roomFor(String(req.params.slug ?? ''))
    if (!room) return res.status(404).json({ error: 'NO_VENUE' })

    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown'
    if (perIp.hit(ip) || room.staffSessions.overLoginLimit()) {
      return res.status(429).json({ error: 'TOO_MANY', message: 'Too many tries. Wait a minute and try again.' })
    }

    await room.ready
    const email = String(req.body?.email ?? '')
    const password = String(req.body?.password ?? '')
    let user
    try {
      user = await room.repos.staff.verify(room.venue.slug, email, password)
    } catch (error) {
      console.warn(`staff: login lookup failed for ${room.venue.slug} —`, error.message)
      return res.status(500).json({ error: 'LOGIN_FAILED', message: 'The server could not check that. Try again.' })
    }
    if (!user) return res.status(401).json({ error: 'BAD_LOGIN', message: 'That email and password do not match.' })

    const { token, expiresAt } = room.staffSessions.create(user)
    res.json({ token, name: user.name, expiresAt })
  }
}

// POST /api/venue/:slug/staff/logout  (Authorization: Bearer <token>, or { token })
export function logoutHandler({ roomFor }) {
  return async (req, res) => {
    const room = roomFor(String(req.params.slug ?? ''))
    if (!room) return res.status(404).json({ error: 'NO_VENUE' })
    const token = bearer(req) || String(req.body?.token ?? '')
    if (token && token !== DEV_TOKEN) {
      const hash = hashToken(token)
      room.staffSessions.revoke(token)
      kickStaffSession(room, hash)
    }
    res.status(204).end()
  }
}

// GET /api/venue/:slug/staff/status  ->  { dev: true } while the dev door is open
//
// The login screen asks this to decide whether to offer "Continue (dev)".
// It says nothing else about the venue's staff.
export function statusHandler({ roomFor }) {
  return async (req, res) => {
    const room = roomFor(String(req.params.slug ?? ''))
    if (!room) return res.status(404).json({ error: 'NO_VENUE' })
    await room.ready
    res.json({ dev: await devDoorOpen(room) })
  }
}
