import fs from 'node:fs'
import path from 'node:path'
import { normalise } from '../venues.js'
import { createMemoryTickets } from './memory.js'

// What the server did before there was a database: venues in
// <dataDir>/venues.json, each venue's layout in
// <dataDir>/venues/<slug>/floorplan.json, and tickets nowhere — they live as
// long as the process. Same interface as the Postgres backend, so the handlers
// cannot tell which one they were given.
export function createFileRepos(dataDir) {
  const venuesFile = path.join(dataDir, 'venues.json')
  const planFile = (slug) => path.join(dataDir, 'venues', slug, 'floorplan.json')

  function readJson(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      // Missing, or hand-edited into something unreadable: same as absent.
      return null
    }
  }

  function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(value, null, 2))
  }

  const tickets = new Map()
  const bucket = (slug) => {
    let map = tickets.get(slug)
    if (!map) tickets.set(slug, (map = new Map()))
    return map
  }

  return {
    backend: 'file',
    dataDir,

    venues: {
      async list() {
        return normalise(readJson(venuesFile))
      },
      async upsert(venue) {
        const raw = readJson(venuesFile)
        const list = Array.isArray(raw) ? raw : []
        const entry = { slug: venue.slug, name: venue.name, menu: venue.menu, botTables: venue.botTables }
        const at = list.findIndex((v) => v?.slug === venue.slug)
        if (at === -1) list.push(entry)
        else list[at] = entry
        writeJson(venuesFile, list)
      }
    },

    floorplans: {
      async get(slug) {
        const raw = readJson(planFile(slug))
        return Array.isArray(raw?.tables) ? raw : null
      },
      async save(slug, plan) {
        writeJson(planFile(slug), plan)
      }
    },

    tickets: createMemoryTickets(bucket),

    async close() {}
  }
}
