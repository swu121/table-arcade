// What Playwright's webServer runs: a clean data dir with two venues, a fresh
// production build, then the real server on the spare port.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, PORT, ROOT, VENUES } from './env.js'

fs.rmSync(DATA_DIR, { recursive: true, force: true })
fs.mkdirSync(DATA_DIR, { recursive: true })
fs.writeFileSync(path.join(DATA_DIR, 'venues.json'), JSON.stringify(VENUES, null, 2))

execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', DATA_DIR }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}
server.on('exit', (code) => process.exit(code ?? 0))
