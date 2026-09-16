// What Playwright's webServer runs: a clean data dir with two venues, a fresh
// production build, then the real server on the spare port.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createFileRepos } from '../server/db/index.js'
import { hashPassword } from '../server/db/staff.js'
import { ADMIN, DATA_DIR, PORT, ROOT, STAFF, VENUES } from './env.js'

fs.rmSync(DATA_DIR, { recursive: true, force: true })
fs.mkdirSync(DATA_DIR, { recursive: true })
fs.writeFileSync(path.join(DATA_DIR, 'venues.json'), JSON.stringify(VENUES, null, 2))

// One staff account per venue, through the same file backend the server
// will read, so the staff screen can be signed in to.
const repos = createFileRepos(DATA_DIR)
for (const venue of VENUES) await repos.staff.create({ venue: venue.slug, ...STAFF })

execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })

// The platform operator, configured the way a real deploy configures one:
// two env vars and no row anywhere.
const ADMIN_PASSWORD_HASH = await hashPassword(ADMIN.password)

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    DATA_DIR,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD_HASH
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}
server.on('exit', (code) => process.exit(code ?? 0))
