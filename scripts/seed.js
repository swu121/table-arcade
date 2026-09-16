// First deploy: put the demo venues into Postgres.
//
//   DATABASE_URL=postgres://... node scripts/seed.js [venues.json]
//
// Upserts every venue in the file (default docs/venues.example.json), so
// running it twice is harmless and editing the file then re-running updates
// names, menus and bot tables in place. Floor plans are left alone: a venue
// without one gets the default plan, and staff lay out the real room from
// the editor.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRepos } from '../server/db/index.js'
import { normalise } from '../server/venues.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = process.argv[2] ?? path.join(here, '..', 'docs', 'venues.example.json')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — nothing to seed into.')
  process.exit(1)
}

const venues = normalise(JSON.parse(fs.readFileSync(file, 'utf8')))
if (!venues.length) {
  console.error(`${file} has no usable venues.`)
  process.exit(1)
}

const repos = await createRepos({ log: console.log })
try {
  for (const venue of venues) {
    await repos.venues.upsert(venue)
    console.log(`  ${venue.name} (${venue.slug}) — ${venue.menu.length} menu items, bots ${venue.botTables.join(', ') || 'none'}`)
  }
  console.log(`  ${venues.length} venue(s) seeded from ${path.relative(process.cwd(), file)}`)
} finally {
  await repos.close()
}
