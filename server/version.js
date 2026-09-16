import fs from 'node:fs'
import path from 'node:path'

// The build stamps one version into both halves: the client bundle carries it
// as a constant, and `vite build` writes the same value to dist/version.json.
// Reading it from dist means the server can only ever claim the version of the
// client it is actually serving. Development is always 'dev' on both sides, so
// a running Vite dev server never asks its tablets to reload.
export function loadVersion(dist) {
  if (process.env.NODE_ENV !== 'production') return 'dev'
  try {
    const { version } = JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8'))
    return typeof version === 'string' && version ? version : 'dev'
  } catch {
    return 'dev'
  }
}
