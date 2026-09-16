import fs from 'node:fs'
import path from 'node:path'
import { normalise } from '../venues.js'
import { createMemoryTickets } from './memory.js'
import { createDevicesRepo } from './devices.js'
import { createStaffRepo } from './staff.js'

// What the server did before there was a database: venues in
// <dataDir>/venues.json, each venue's layout in
// <dataDir>/venues/<slug>/floorplan.json, and tickets nowhere — they live as
// long as the process. Same interface as the Postgres backend, so the handlers
// cannot tell which one they were given.
export function createFileRepos(dataDir) {
  const venuesFile = path.join(dataDir, 'venues.json')
  const planFile = (slug) => path.join(dataDir, 'venues', slug, 'floorplan.json')
  const devicesFile = (slug) => path.join(dataDir, 'venues', slug, 'devices.json')
  const staffFile = (slug) => path.join(dataDir, 'venues', slug, 'staff.json')

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

  // Paired tablets, one devices.json per venue next to its floor plan. A
  // token lookup has no venue to hand, so it reads every venue's file; there
  // are a handful of venues and a connect is rare, so that is fine.
  function venueDirs() {
    try {
      return fs
        .readdirSync(path.join(dataDir, 'venues'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  // One JSON list per venue, keyed by id, the venue implied by the directory.
  // Devices and staff users both live this way.
  function perVenueStore(fileFor) {
    const records = (slug) => {
      const raw = readJson(fileFor(slug))
      return Array.isArray(raw) ? raw.filter((r) => r && typeof r.id === 'string') : []
    }
    return {
      all: () => venueDirs().flatMap((slug) => records(slug).map((r) => ({ ...r, venue: slug }))),
      put: (record) => {
        const list = records(record.venue)
        const at = list.findIndex((r) => r.id === record.id)
        const { venue: _venue, ...entry } = record
        if (at === -1) list.push(entry)
        else list[at] = entry
        writeJson(fileFor(record.venue), list)
      }
    }
  }

  const deviceStore = perVenueStore(devicesFile)
  const staffStore = perVenueStore(staffFile)

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
        if (typeof venue.requirePairing === 'boolean') entry.requirePairing = venue.requirePairing
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

    devices: createDevicesRepo(deviceStore),

    staff: createStaffRepo(staffStore),

    async close() {}
  }
}
