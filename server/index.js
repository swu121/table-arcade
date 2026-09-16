import express from 'express'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { createRepos } from './db/index.js'
import { init } from './handlers.js'
import { loadVenues } from './venues.js'

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

const listed = await loadVenues(repos)
if (repos.backend === 'postgres' && !(await repos.venues.list()).length) {
  console.warn('  no venues in the database yet — serving the demo venue. Run `npm run seed` to add yours.')
}
const { venues } = init(io, { repos, venues: listed })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    httpServer.close()
    repos.close().finally(() => process.exit(0))
  })
}

app.get('/healthz', (_req, res) => res.type('text').send('ok'))

// The bare URL is the single-venue demo: it lands on the first venue listed.
// Vite serves the client in dev, so the client asks for this instead of being
// redirected — the only route that has to work in both.
app.get('/api/venue', (_req, res) => {
  const venue = venues.default()
  res.json({ slug: venue.slug, name: venue.name })
})

if (process.env.NODE_ENV === 'production') {
  app.get(['/', '/staff'], (req, res) => res.redirect(`/v/${venues.default().slug}${req.path === '/' ? '' : req.path}`))
  app.use(express.static(dist, { maxAge: '1h', index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(dist, 'index.html'))
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
  console.log(`\n  TABLE ARCADE  ·  ${dev ? 'development' : 'production'}  ·  storage: ${storage}\n`)
  for (const venue of venues.all()) {
    console.log(`  ${venue.name} (${venue.slug})`)
    console.log(`    local    http://localhost:${clientPort}/v/${venue.slug}`)
    for (const address of lanAddresses()) {
      console.log(`    tablets  http://${address}:${clientPort}/v/${venue.slug}`)
    }
    console.log(`    staff    http://localhost:${clientPort}/v/${venue.slug}/staff\n`)
  }
})
