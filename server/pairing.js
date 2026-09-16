import { randomInt, timingSafeEqual } from 'node:crypto'
import { hashToken } from './db/devices.js'
import { createRateLimiter } from './ratelimit.js'

export { createRateLimiter }

// Tablet pairing. A tablet is admitted to a venue's namespace only with a
// device token that venue's staff issued. Staff ask for a six-digit code from
// the staff screen, type it into the tablet, and the tablet trades it over
// HTTP for a token it keeps for good (until staff revoke it).
//
// Codes live in memory, per room: they last five minutes, work once, and are
// gone with the process. Tokens live in the devices repo, hashed.

export const CODE_TTL = 5 * 60_000
export const CODE_LENGTH = 6
// Guesses allowed per minute, per IP and per room (see ratelimit.js). Six
// digits and ten guesses a minute puts a brute force at years, and staff can
// always mint a new code.
export const GUESS_LIMIT = 10
export const GUESS_WINDOW = 60_000
// last_seen_at is written at most this often per device.
export const TOUCH_EVERY = 60_000

/* -------------------------------------------------------------- codes --- */

// One store per room. Codes are compared in constant time, every live code
// against the guess, so the timing of a wrong answer says nothing about which
// digits were right.
export function createPairingStore({ ttl = CODE_TTL } = {}) {
  const codes = new Map() // code -> { expiresAt }
  const guesses = createRateLimiter({ limit: GUESS_LIMIT, window: GUESS_WINDOW })
  // deviceId -> last time we wrote last_seen_at
  const touched = new Map()

  const sweep = (now = Date.now()) => {
    for (const [code, entry] of codes) if (entry.expiresAt <= now) codes.delete(code)
    guesses.sweep(now)
  }

  return {
    create({ ttl: override = ttl, now = Date.now() } = {}) {
      sweep(now)
      let code
      do code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
      while (codes.has(code))
      const expiresAt = now + override
      codes.set(code, { expiresAt })
      return { code, expiresAt }
    },

    // True exactly once per valid code.
    redeem(guess, now = Date.now()) {
      sweep(now)
      const input = Buffer.from(String(guess ?? ''))
      let match = null
      for (const code of codes.keys()) {
        const candidate = Buffer.from(code)
        if (candidate.length === input.length && timingSafeEqual(candidate, input)) match = code
      }
      if (match === null) return false
      codes.delete(match)
      return true
    },

    // Rate limit on guesses for this room, regardless of where they came from.
    overGuessLimit: (now) => guesses.hit('room', now),

    // Whether last_seen_at is due a write for this device.
    shouldTouch(deviceId, now = Date.now()) {
      const last = touched.get(deviceId) ?? 0
      if (now - last < TOUCH_EVERY) return false
      touched.set(deviceId, now)
      return true
    },

    live: () => {
      sweep()
      return codes.size
    }
  }
}

/* ---------------------------------------------------------- handshake --- */

// The namespace middleware's half for tablets. Resolves with the device (or
// null when the socket needs none) and rejects with 'Unauthorized' when the
// venue requires a token and this socket has no good one. Staff sockets never
// come through here: a handshake carrying `auth.staff` goes to staff.js.
export async function authenticate(room, socket) {
  const auth = socket.handshake?.auth ?? {}
  const required = Boolean(room.venue.requirePairing)

  const token = typeof auth.token === 'string' ? auth.token : ''
  let device = null
  if (token) {
    try {
      device = await room.repos.devices.find(hashToken(token))
    } catch (error) {
      console.warn(`pairing: token lookup failed for ${room.venue.slug} —`, error.message)
      device = null
    }
  }
  const good = device && device.revokedAt === null && device.venue === room.venue.slug

  if (good) {
    socket.data.deviceId = device.id
    if (room.pairing.shouldTouch(device.id)) {
      room.repos.devices
        .touch(device.id)
        .catch((error) => console.warn(`pairing: touch failed for ${room.venue.slug} —`, error.message))
    }
    return device
  }
  if (required) throw new Error('Unauthorized')
  return null
}

/* ------------------------------------------------------------- staff --- */

// What the staff Devices & staff tab shows: every unrevoked device for the venue,
// with whether a socket is holding it right now.
export async function deviceList(room) {
  const devices = await room.repos.devices.list(room.venue.slug)
  const online = new Set()
  for (const socket of room.nsp.sockets.values()) if (socket.data.deviceId) online.add(socket.data.deviceId)
  return devices.map((d) => ({ ...d, online: online.has(d.id) }))
}

export async function broadcastDevices(room) {
  try {
    room.nsp.to('staff').emit('staff:devices', { devices: await deviceList(room) })
  } catch (error) {
    console.warn(`pairing: could not list devices for ${room.venue.slug} —`, error.message)
  }
}

// Every socket holding this device is told, then dropped. Returns how many.
export function kickDevice(room, deviceId) {
  let kicked = 0
  for (const socket of room.nsp.sockets.values()) {
    if (socket.data.deviceId !== deviceId) continue
    socket.emit('device:revoked', { deviceId })
    socket.disconnect(true)
    kicked += 1
  }
  return kicked
}

/* --------------------------------------------------------------- HTTP --- */

// POST /api/venue/:slug/pair  { code, label? }  ->  { token, deviceId }
//
// The one route that hands out a token. Rate-limited per IP across every
// venue and per room, and the code is burnt the moment it is accepted.
export function pairHandler({ roomFor }) {
  const perIp = createRateLimiter({ limit: GUESS_LIMIT, window: GUESS_WINDOW })
  return async (req, res) => {
    const room = roomFor(String(req.params.slug ?? ''))
    if (!room) return res.status(404).json({ error: 'NO_VENUE' })

    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown'
    if (perIp.hit(ip) || room.pairing.overGuessLimit()) {
      return res.status(429).json({ error: 'TOO_MANY', message: 'Too many tries. Wait a minute and ask for a new code.' })
    }

    await room.ready
    const code = String(req.body?.code ?? '').replace(/\s+/g, '')
    if (!room.pairing.redeem(code)) {
      return res.status(401).json({ error: 'BAD_CODE', message: 'That code is wrong or has expired.' })
    }

    try {
      const device = await room.repos.devices.issue({ venue: room.venue.slug, label: req.body?.label })
      broadcastDevices(room)
      res.json({ token: device.token, deviceId: device.id })
    } catch (error) {
      console.warn(`pairing: could not issue a device for ${room.venue.slug} —`, error.message)
      res.status(500).json({ error: 'ISSUE_FAILED', message: 'The server could not save this tablet. Try again.' })
    }
  }
}
