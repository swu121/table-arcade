import { MENU, BOT_TABLES } from './state.js'

// A venue is one restaurant: everything that makes its room different from the
// next one. It's a row in Postgres, or an entry in data/venues.json when there
// is no database — either way, onboarding is "add a venue", never "deploy".
//
//   { slug, name, menu?, botTables?, requirePairing?, archived? }
//
// Anything missing falls back to the demo defaults in state.js. requirePairing
// — whether a tablet needs a device token to connect — defaults to on in
// production and off everywhere else, so the dev server and the tests never
// have to pair. archived is how a venue goes away: there is no delete, and an
// archived venue is refused at the handshake like a slug nobody ever set up.

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

export const defaultRequirePairing = () => process.env.NODE_ENV === 'production'

const DEFAULT_VENUES = [{ slug: 'demo', name: 'Table Arcade' }]

// An empty store — no venues.json yet, or a database that hasn't been seeded —
// is the single-venue demo, not a server with nowhere to land.
export function venueList(list) {
  const venues = normalise(list)
  return venues.length ? venues : normalise(DEFAULT_VENUES)
}

export async function loadVenues(repos) {
  return venueList(await repos.venues.list())
}

export function normalise(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const venues = []
  for (const entry of list) {
    const venue = cleanVenue(entry)
    if (!venue || seen.has(venue.slug)) continue
    seen.add(venue.slug)
    venues.push(venue)
  }
  return venues
}

// One entry, cleaned — or null if the slug is not one. Everything that becomes
// a venue (a seeded row, a hand-edited file, an admin form) comes through
// here, so there is one answer to "what is a legal menu".
export function cleanVenue(entry) {
  const slug = String(entry?.slug ?? '').toLowerCase()
  if (!SLUG_PATTERN.test(slug)) return null
  return {
    slug,
    name: String(entry.name ?? slug).slice(0, 60),
    menu: cleanMenu(entry.menu) ?? MENU,
    botTables: Array.isArray(entry.botTables) ? cleanBotTables(entry.botTables) : BOT_TABLES,
    requirePairing: typeof entry.requirePairing === 'boolean' ? entry.requirePairing : defaultRequirePairing(),
    archived: entry.archived === true
  }
}

// A usable menu, or null when there isn't one — the caller decides whether
// that means "keep the default" or "refuse this".
export function cleanMenu(list) {
  if (!Array.isArray(list)) return null
  const menu = list.map(menuItem).filter(Boolean)
  return menu.length ? menu : null
}

export const cleanBotTables = (list) =>
  (Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100)

function menuItem(item) {
  const id = String(item?.id ?? '')
  const price = Number(item?.price)
  if (!id || !Number.isFinite(price)) return null
  return { id, name: String(item.name ?? id).slice(0, 40), price, icon: String(item.icon ?? 'beer') }
}

// The list the server is serving, live. It is mutable on purpose: the admin
// page adds and edits venues on a running server, and `update` writes into the
// *existing* venue object — the same one every live room holds as `room.venue`
// — so a rename or a new menu reaches the floor without restarting anything.
//
// Archived venues are still in here (nothing is deleted), but `get` and `all`
// step over them, so the handshake and the boot log behave as if they were
// never set up. `find` and `every` see them, which is how the admin page can
// list one and open it again.
export function createVenueRegistry(venues) {
  const order = [...venues]
  const bySlug = new Map(order.map((v) => [v.slug, v]))
  const key = (slug) => String(slug ?? '').toLowerCase()
  const live = () => order.filter((v) => !v.archived)

  return {
    all: () => live(),
    every: () => [...order],
    get: (slug) => {
      const venue = bySlug.get(key(slug))
      return venue && !venue.archived ? venue : null
    },
    find: (slug) => bySlug.get(key(slug)) ?? null,

    // The venue a bare URL lands on: the first one listed that is still open.
    // If every venue has been archived there is nowhere good to send anyone,
    // and the first one listed beats crashing on the way out.
    default: () => live()[0] ?? order[0],

    // A new restaurant. Returns the venue, or null if the entry is not one or
    // the slug is taken — the caller says which to whoever filled the form.
    add(entry) {
      const venue = cleanVenue(entry)
      if (!venue || bySlug.has(venue.slug)) return null
      bySlug.set(venue.slug, venue)
      order.push(venue)
      return venue
    },

    // A patch over what the venue already is, re-validated as a whole. The
    // slug never moves: it is in URLs, device rows and staff accounts.
    update(slug, patch = {}) {
      const venue = bySlug.get(key(slug))
      if (!venue) return null
      const merged = cleanVenue({ ...venue, ...patch, slug: venue.slug })
      if (!merged) return null
      return Object.assign(venue, merged)
    }
  }
}
