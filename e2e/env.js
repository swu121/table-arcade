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
// tablet sits down.
export const VENUES = [
  { slug: 'demo', name: 'Table Arcade' },
  { slug: 'annex', name: 'The Annex', botTables: [] }
]

// Every tablet is a landscape tablet.
export const contextOptions = {
  baseURL: BASE_URL,
  viewport: { width: 1024, height: 768 }
}
