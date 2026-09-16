import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Shared between the Playwright config, the server launcher and the specs.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PORT = 3457
export const BASE_URL = `http://localhost:${PORT}`

// A fixed path rather than mkdtemp: the specs need to find the floor plan the
// staff editor wrote, and the launcher wipes it at the start of every run.
export const DATA_DIR = path.join(os.tmpdir(), 'table-arcade-e2e')

// Two venues, so cross-venue isolation can be tested. `demo` keeps the default
// menu and bot tables; `annex` has no bots, so its floor is empty until a
// tablet sits down. Pairing is off: the server runs in production mode here,
// where it is on by default, and these specs drive the floor, not the gate.
export const VENUES = [
  { slug: 'demo', name: 'Table Arcade', requirePairing: false },
  { slug: 'annex', name: 'The Annex', botTables: [], requirePairing: false }
]

// The staff login is enforced in production, so the launcher seeds this user
// into every venue and the staff helper signs in with it.
export const STAFF = { email: 'sam@example.com', password: 'correct horse', name: 'Sam' }

// Every tablet is a landscape tablet.
export const contextOptions = {
  baseURL: BASE_URL,
  viewport: { width: 1024, height: 768 }
}
