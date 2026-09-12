import fs from 'node:fs'
import path from 'node:path'
import { MENU, BOT_TABLES } from './state.js'

// A venue is one restaurant: everything that makes its room different from the
// next one. Today it's a row in data/venues.json; the shape is what a database
// row will look like later, so onboarding is "add a venue", never "deploy".
//
//   { slug, name, menu?, botTables? }
//
// Anything missing falls back to the demo defaults in state.js.

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

const DEFAULT_VENUES = [{ slug: 'demo', name: 'Table Arcade' }]

export function loadVenues(dataDir) {
  const file = path.join(dataDir, 'venues.json')
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const venues = normalise(raw)
    if (venues.length) return venues
  } catch {
    // No venues file yet: the single-venue demo.
  }
  return normalise(DEFAULT_VENUES)
}

export function normalise(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const venues = []
  for (const entry of list) {
    const slug = String(entry?.slug ?? '').toLowerCase()
    if (!SLUG_PATTERN.test(slug) || seen.has(slug)) continue
    seen.add(slug)
    venues.push({
      slug,
      name: String(entry.name ?? slug).slice(0, 60),
      menu: Array.isArray(entry.menu) && entry.menu.length ? entry.menu.map(menuItem).filter(Boolean) : MENU,
      botTables: Array.isArray(entry.botTables)
        ? entry.botTables.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100)
        : BOT_TABLES
    })
  }
  return venues
}

function menuItem(item) {
  const id = String(item?.id ?? '')
  const price = Number(item?.price)
  if (!id || !Number.isFinite(price)) return null
  return { id, name: String(item.name ?? id).slice(0, 40), price, icon: String(item.icon ?? 'beer') }
}

export function createVenueRegistry(venues) {
  const bySlug = new Map(venues.map((v) => [v.slug, v]))
  return {
    all: () => [...bySlug.values()],
    get: (slug) => bySlug.get(String(slug ?? '').toLowerCase()) ?? null,
    // The venue a bare URL lands on: the first one listed.
    default: () => venues[0]
  }
}
