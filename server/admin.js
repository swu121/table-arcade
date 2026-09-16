import { randomBytes } from 'node:crypto'
import express from 'express'
import { hashToken } from './db/devices.js'
import { verifyPassword } from './db/staff.js'
import { createRateLimiter } from './ratelimit.js'
import { SLUG_PATTERN, cleanBotTables, cleanMenu } from './venues.js'

// The platform operator's door. Not a venue's staff: one person runs the
// server and onboards restaurants onto it, so there is one identity for the
// whole process, configured with two env vars and no row anywhere.
//
//   ADMIN_EMAIL           who
//   ADMIN_PASSWORD_HASH   scrypt:N:r:p:salt:hash — the format server/db/staff.js
//                         writes; `npm run admin:hash` prints one.
//
// Three modes, and the only one that needs saying out loud is the third:
//
//   configured   both set — the login form is the door.
//   dev door     NODE_ENV !== 'production' and neither set — /admin is open,
//                and says so on screen. Mirrors the staff dev door.
//   disabled     production and neither set — /admin and every /api/admin
//                route is 404, and the server says so once at boot.

export const SESSION_TTL = 14 * 24 * 60 * 60_000
// Login attempts allowed per minute, per IP.
export const LOGIN_LIMIT = 10
export const LOGIN_WINDOW = 60_000

export const adminEmail = () => String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
export const adminHash = () => String(process.env.ADMIN_PASSWORD_HASH ?? '')

export const adminConfigured = () => Boolean(adminEmail() && adminHash())
export const adminDevDoor = () => !adminConfigured() && process.env.NODE_ENV !== 'production'
export const adminEnabled = () => adminConfigured() || adminDevDoor()

// One line at boot, so a production server with no operator configured is not
// a mystery when /admin 404s.
export function reportAdminMode(log = console.log) {
  if (adminConfigured()) log(`  admin: /admin is open to ${adminEmail()}`)
  else if (adminDevDoor()) log('  admin: /admin is open to anyone (dev mode — set ADMIN_EMAIL and ADMIN_PASSWORD_HASH)')
  else log('  admin: disabled — set ADMIN_EMAIL and ADMIN_PASSWORD_HASH to turn /admin on')
}

/* ----------------------------------------------------------- sessions --- */

export const newSessionToken = () => randomBytes(32).toString('base64url')

// One store for the whole server — there is one operator. Same shape as the
// staff sessions in staff.js: tokens looked up by hash, every use pushing the
// expiry out another TTL, and a restart signing the operator out.
export function createAdminSessions({ ttl = SESSION_TTL } = {}) {
  const sessions = new Map() // tokenHash -> { email, expiresAt }

  const sweep = (now = Date.now()) => {
    for (const [hash, session] of sessions) if (session.expiresAt <= now) sessions.delete(hash)
  }

  return {
    create(email, now = Date.now()) {
      sweep(now)
      const token = newSessionToken()
      const expiresAt = now + ttl
      sessions.set(hashToken(token), { email, expiresAt })
      return { token, expiresAt }
    },

    resolve(token, now = Date.now()) {
      sweep(now)
      if (typeof token !== 'string' || !token) return null
      const session = sessions.get(hashToken(token))
      if (!session) return null
      session.expiresAt = now + ttl
      return { ...session }
    },

    revoke(token) {
      return sessions.delete(hashToken(String(token ?? '')))
    },

    live: () => {
      sweep()
      return sessions.size
    }
  }
}

/* --------------------------------------------------------------- HTTP --- */

const bearer = (req) => {
  const header = String(req.get?.('authorization') ?? '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

const bad = (res, status, error, message) => res.status(status).json({ error, message })

// Everything the admin page shows about one venue: what it is, how much of it
// exists, and whether anyone is connected right now.
async function venueRow(arcade, repos, venue) {
  const room = arcade.rooms.get(venue.slug) ?? null
  const count = async (list) => {
    try {
      return (await list).length
    } catch {
      return null
    }
  }
  return {
    slug: venue.slug,
    name: venue.name,
    requirePairing: venue.requirePairing,
    archived: venue.archived,
    botTables: venue.botTables,
    menu: venue.menu,
    devices: await count(repos.devices.list(venue.slug)),
    staff: await count(repos.staff.list(venue.slug)),
    live: Boolean(room),
    sockets: room ? room.nsp.sockets.size : 0
  }
}

// The admin API, as a router the caller mounts at /api/admin. All of it is
// plain HTTP JSON: the admin page never opens a socket, because it is not on
// any one venue's floor.
export function adminRouter({ arcade, repos, sessions = createAdminSessions() }) {
  const router = express.Router()
  const attempts = createRateLimiter({ limit: LOGIN_LIMIT, window: LOGIN_WINDOW })
  const json = express.json({ limit: '64kb' })

  // Disabled means gone, not forbidden: there is nothing here to find.
  router.use((req, res, next) => (adminEnabled() ? next() : res.status(404).json({ error: 'NO_ADMIN' })))

  router.get('/status', (_req, res) => {
    res.json({ enabled: true, dev: adminDevDoor(), email: adminConfigured() ? adminEmail() : null })
  })

  // One answer for a wrong email and a wrong password, and the scrypt is run
  // either way so the timing does not say which. Limited per IP.
  router.post('/login', json, async (req, res) => {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown'
    if (attempts.hit(ip)) {
      return bad(res, 429, 'TOO_MANY', 'Too many tries. Wait a minute and try again.')
    }
    if (adminDevDoor()) {
      const { token, expiresAt } = sessions.create('dev')
      return res.json({ token, expiresAt, email: 'dev', dev: true })
    }
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const good = await verifyPassword(password, adminHash())
    if (!good || email !== adminEmail()) {
      return bad(res, 401, 'BAD_LOGIN', 'That email and password do not match.')
    }
    const { token, expiresAt } = sessions.create(email)
    res.json({ token, expiresAt, email })
  })

  router.post('/logout', json, (req, res) => {
    sessions.revoke(bearer(req) || String(req.body?.token ?? ''))
    res.status(204).end()
  })

  // The dev door is open to anyone who can reach the port, which outside
  // production is the point. With an operator configured, everything below
  // needs their session.
  router.use((req, res, next) => {
    if (adminDevDoor()) {
      req.admin = { email: 'dev', dev: true }
      return next()
    }
    const session = sessions.resolve(bearer(req))
    if (!session) return bad(res, 401, 'NO_SESSION', 'Sign in again.')
    req.admin = session
    next()
  })

  router.get('/venues', async (_req, res) => {
    const venues = await Promise.all(arcade.venues.every().map((v) => venueRow(arcade, repos, v)))
    res.json({ venues })
  })

  // A new restaurant, live on this server the moment it answers: the registry
  // holds it, the store has it for the next restart, and the first tablet to
  // ask for /v/<slug> mints the namespace.
  router.post('/venues', json, async (req, res) => {
    const slug = String(req.body?.slug ?? '').trim().toLowerCase()
    if (!SLUG_PATTERN.test(slug)) {
      return bad(res, 400, 'BAD_SLUG', 'A slug is lowercase letters, numbers and dashes — like "the-anchor".')
    }
    if (arcade.venues.find(slug)) return bad(res, 409, 'SLUG_TAKEN', 'A venue already has that address.')
    const name = String(req.body?.name ?? '').trim()
    if (!name) return bad(res, 400, 'BAD_NAME', 'Give the venue a name.')

    // No menu here on purpose: a new venue starts on the demo menu and the
    // operator edits it in place, rather than facing an empty table first.
    const entry = { slug, name }
    if (typeof req.body?.requirePairing === 'boolean') entry.requirePairing = req.body.requirePairing
    if (Array.isArray(req.body?.botTables)) entry.botTables = cleanBotTables(req.body.botTables)

    let venue
    try {
      venue = await arcade.addVenue(entry)
    } catch (error) {
      console.warn(`admin: could not save venue ${slug} —`, error.message)
      return bad(res, 500, 'SAVE_FAILED', 'The server could not save that venue. Try again.')
    }
    if (!venue) return bad(res, 409, 'SLUG_TAKEN', 'A venue already has that address.')
    res.status(201).json({ venue: await venueRow(arcade, repos, venue) })
  })

  // Name, pairing, bots, menu, archived. Anything left out is left alone; a
  // menu change reaches a live room's next sync, and a game that is already
  // running keeps the item it was played for.
  router.patch('/venues/:slug', json, async (req, res) => {
    const slug = String(req.params.slug ?? '').toLowerCase()
    if (!arcade.venues.find(slug)) return bad(res, 404, 'NO_VENUE', 'No venue at that address.')

    const patch = {}
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim()
      if (!name) return bad(res, 400, 'BAD_NAME', 'Give the venue a name.')
      patch.name = name
    }
    if (req.body?.requirePairing !== undefined) patch.requirePairing = Boolean(req.body.requirePairing)
    if (req.body?.archived !== undefined) patch.archived = Boolean(req.body.archived)
    if (req.body?.botTables !== undefined) {
      if (!Array.isArray(req.body.botTables)) return bad(res, 400, 'BAD_BOTS', 'Bot tables are a list of numbers.')
      patch.botTables = cleanBotTables(req.body.botTables)
    }
    if (req.body?.menu !== undefined) {
      const menu = cleanMenu(req.body.menu)
      if (!menu) return bad(res, 400, 'BAD_MENU', 'A menu needs at least one item with an id and a price.')
      patch.menu = menu
    }

    let venue
    try {
      venue = await arcade.updateVenue(slug, patch)
    } catch (error) {
      console.warn(`admin: could not save venue ${slug} —`, error.message)
      return bad(res, 500, 'SAVE_FAILED', 'The server could not save that change. Try again.')
    }
    if (!venue) return bad(res, 404, 'NO_VENUE', 'No venue at that address.')
    res.json({ venue: await venueRow(arcade, repos, venue) })
  })

  // The venue's first staff account, so onboarding ends with someone who can
  // sign in — the same repo call the staff screen's Add staff makes.
  router.post('/venues/:slug/staff', json, async (req, res) => {
    const slug = String(req.params.slug ?? '').toLowerCase()
    if (!arcade.venues.find(slug)) return bad(res, 404, 'NO_VENUE', 'No venue at that address.')
    try {
      const user = await repos.staff.create({
        venue: slug,
        email: req.body?.email,
        password: req.body?.password,
        name: req.body?.name
      })
      res.status(201).json({ user })
    } catch (error) {
      if (error.code) return bad(res, 400, error.code, error.message)
      console.warn(`admin: could not add staff for ${slug} —`, error.message)
      bad(res, 500, 'ADD_FAILED', 'That account could not be saved. Try again.')
    }
  })

  // A pairing code out of the venue's own room — the same five-minute,
  // single-use store the staff screen's "Pair a tablet" uses — so the first
  // tablet can be paired before anyone is on site with a staff screen.
  router.post('/venues/:slug/pair-code', json, async (req, res) => {
    const room = arcade.roomFor(String(req.params.slug ?? '').toLowerCase())
    if (!room) return bad(res, 404, 'NO_VENUE', 'No venue at that address.')
    await room.ready
    res.json(room.pairing.create())
  })

  return router
}

// GET /admin: the page itself. In production with no operator configured
// there is no admin page, so this 404s before the SPA fallback sees it.
export function adminPage() {
  return (req, res, next) => (adminEnabled() ? next() : res.status(404).type('text').send('Not found'))
}
