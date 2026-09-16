import express from 'express'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { adminEnabled, adminPage, adminRouter, reportAdminMode } from './admin.js'
import { createRepos } from './db/index.js'
import { init, reportClientError } from './handlers.js'
import { pairHandler } from './pairing.js'
import { gracefulShutdown } from './shutdown.js'
import { loginHandler, logoutHandler, statusHandler } from './staff.js'
import { loadVenues } from './venues.js'
import { loadVersion } from './version.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, '..', 'dist')
const dataDir = process.env.DATA_DIR || path.join(here, '..', 'data')

// DATABASE_URL set: venues, floor plans and tickets live in Postgres and
// survive a deploy. Unset: venues and plans are JSON under data/, and tickets
// last as long as the process.
const repos = await createRepos({ dataDir, log: console.log })
if (repos.backend === 'file') migrateLegacyPlan()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

const version = loadVersion(dist)
const listed = await loadVenues(repos)
if (repos.backend === 'postgres' && !(await repos.venues.list()).length) {
  console.warn('  no venues in the database yet — serving the demo venue. Run `npm run seed` to add yours.')
}
const arcade = init(io, { repos, venues: listed, version })
const { venues, roomFor } = arcade

// A deploy is a SIGTERM and a wait (kill_timeout in fly.toml, 10s). Inside
// that: every room is written down, every tablet is told, and the sockets are
// closed so their reconnect loops start. The next boot picks the rooms back up.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    gracefulShutdown({ httpServer, io, app: arcade, repos, signal, timeout: 8000 })
  })
}

app.get('/healthz', (_req, res) => res.type('text').send('ok'))
app.get('/api/version', (_req, res) => res.json({ version }))

// Tablets report their own crashes here rather than over the socket, since a
// crash is the one time the socket might not be there.
app.post('/api/client-error', express.json({ limit: '32kb' }), (req, res) => {
  const room = roomFor(String(req.body?.venue ?? ''))
  if (!room) return res.status(404).json({ error: 'NO_VENUE' })
  reportClientError(room, req.body)
  res.status(204).end()
})

// A tablet trades a staff-issued pairing code for its device token here.
app.post('/api/venue/:slug/pair', express.json({ limit: '4kb' }), pairHandler({ roomFor }))

// The platform operator's page: venues are created and edited here, on the
// running server. Logic lives in server/admin.js; this is the mount point.
app.use('/api/admin', adminRouter({ arcade, repos }))

// Staff sign in here for the session token their socket handshake carries.
app.post('/api/venue/:slug/staff/login', express.json({ limit: '4kb' }), loginHandler({ roomFor }))
app.post('/api/venue/:slug/staff/logout', express.json({ limit: '4kb' }), logoutHandler({ roomFor }))
app.get('/api/venue/:slug/staff/status', statusHandler({ roomFor }))

// The bare URL is the single-venue demo: it lands on the first venue listed.
// Vite serves the client in dev, so the client asks for this instead of being
// redirected — the only route that has to work in both.
app.get('/api/venue', (_req, res) => {
  const venue = venues.default()
  res.json({ slug: venue.slug, name: venue.name })
})

if (process.env.NODE_ENV === 'production') {
  app.get(['/', '/staff'], (req, res) => res.redirect(`/v/${venues.default().slug}${req.path === '/' ? '' : req.path}`))
  // With no operator configured there is no admin page to fall through to.
  app.get('/admin', adminPage())
  app.use(express.static(dist, { maxAge: '1h', index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    // Anchored at dist so the dotfiles check only sees "index.html", not the
    // directories above it — a checkout under a dot-directory would 404.
    res.sendFile('index.html', { root: dist })
  })
}

// The single-venue layout used to live at data/floorplan.json. Carry it over to
// the default venue the first time this boots, rather than silently resetting
// a room somebody already laid out.
function migrateLegacyPlan() {
  const legacy = path.join(dataDir, 'floorplan.json')
  const current = path.join(dataDir, 'venues', 'demo', 'floorplan.json')
  if (!fs.existsSync(legacy) || fs.existsSync(current)) return
  try {
    fs.mkdirSync(path.dirname(current), { recursive: true })
    fs.copyFileSync(legacy, current)
    console.log(`  moved ${legacy} -> ${current}`)
  } catch (error) {
    console.warn('floorplan: could not migrate legacy layout —', error.message)
  }
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((nic) => nic && nic.family === 'IPv4' && !nic.internal)
    .map((nic) => nic.address)
}

const PORT = Number(process.env.PORT) || 3000
httpServer.listen(PORT, '0.0.0.0', () => {
  const dev = process.env.NODE_ENV !== 'production'
  const clientPort = dev ? 5173 : PORT
  const storage = repos.backend === 'postgres' ? 'postgres' : `${repos.backend} (${dataDir})`
  console.log(`\n  TABLE ARCADE  ·  ${dev ? 'development' : 'production'}  ·  build ${version}  ·  storage: ${storage}`)
  reportAdminMode(console.log)
  if (adminEnabled()) console.log(`    admin    http://localhost:${clientPort}/admin`)
  console.log('')
  for (const venue of venues.all()) {
    console.log(`  ${venue.name} (${venue.slug})`)
    console.log(`    local    http://localhost:${clientPort}/v/${venue.slug}`)
    for (const address of lanAddresses()) {
      console.log(`    tablets  http://${address}:${clientPort}/v/${venue.slug}`)
    }
    console.log(`    staff    http://localhost:${clientPort}/v/${venue.slug}/staff\n`)
  }
})
