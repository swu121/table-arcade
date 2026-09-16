import { createFileRepos } from './file.js'
import { createMemoryRepos } from './memory.js'

export { createFileRepos, createMemoryRepos }

// The repository layer: venues, floor plans, tickets and the room snapshot a
// graceful shutdown leaves behind, behind one interface the handlers use
// without knowing what is underneath.
//
//   repos.venues.list() / upsert(venue)
//   repos.floorplans.get(slug) / save(slug, plan)
//   repos.tickets.create(slug, ticket) / deliver(slug, id) / openFor(slug) / clearFor(slug, table)
//   repos.snapshots.save(slug, snapshot) / load(slug) / clear(slug)
//   repos.devices.issue({ venue, label }) / find(tokenHash) / list(venue) / revoke(id) / touch(id)
//   repos.staff.create({ venue, email, password, name }) / findByEmail(venue, email) / list(venue)
//               / revoke(id) / verify(venue, email, password)
//   repos.close()
//
// Chosen once at startup: DATABASE_URL means Postgres, a data directory means
// JSON files with tickets in memory, neither means memory only.
export async function createRepos({ databaseUrl = process.env.DATABASE_URL, dataDir = null, log } = {}) {
  if (databaseUrl) {
    const { createPostgresRepos } = await import('./postgres.js')
    return createPostgresRepos(databaseUrl, { log })
  }
  if (dataDir) return createFileRepos(dataDir)
  return createMemoryRepos()
}
