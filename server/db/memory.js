import { clone } from './tickets.js'
import { createDevicesRepo } from './devices.js'

// The whole repository interface, in Maps. Tests use it, and so does a server
// booted with neither DATABASE_URL nor a data directory. Tickets here behave
// exactly like the file backend's: they live as long as the process.
export function createMemoryRepos() {
  const venues = new Map()
  const floorplans = new Map()
  const tickets = new Map() // slug -> Map<id, ticket>
  const devices = new Map() // id -> record, hash and all
  const snapshots = new Map()

  const bucket = (slug) => {
    let map = tickets.get(slug)
    if (!map) tickets.set(slug, (map = new Map()))
    return map
  }

  return {
    backend: 'memory',

    venues: {
      async list() {
        return [...venues.values()].map((v) => structuredClone(v))
      },
      async upsert(venue) {
        venues.set(venue.slug, structuredClone(venue))
      }
    },

    floorplans: {
      async get(slug) {
        const plan = floorplans.get(slug)
        return plan ? structuredClone(plan) : null
      },
      async save(slug, plan) {
        floorplans.set(slug, structuredClone(plan))
      }
    },

    tickets: createMemoryTickets(bucket),

    devices: createDevicesRepo({
      all: () => [...devices.values()],
      put: (record) => devices.set(record.id, { ...record })
    }),
    snapshots: {
      async save(slug, snapshot) {
        snapshots.set(slug, structuredClone(snapshot))
      },
      async load(slug) {
        const snapshot = snapshots.get(slug)
        return snapshot ? structuredClone(snapshot) : null
      },
      async clear(slug) {
        snapshots.delete(slug)
      }
    },

    async close() {}
  }
}

// Shared with the file backend, which keeps tickets in memory too.
export function createMemoryTickets(bucket) {
  return {
    async create(slug, ticket) {
      bucket(slug).set(ticket.id, clone(ticket))
    },
    async deliver(slug, id, deliveredAt = Date.now()) {
      const ticket = bucket(slug).get(id)
      if (!ticket) return
      ticket.status = 'delivered'
      ticket.deliveredAt = deliveredAt
    },
    async openFor(slug) {
      return [...bucket(slug).values()].filter((t) => t.status !== 'delivered').map(clone)
    },
    async clearFor(slug, table) {
      const map = bucket(slug)
      for (const [id, ticket] of map) {
        if (ticket.owingTable === table || ticket.owedToTable === table) map.delete(id)
      }
    }
  }
}
