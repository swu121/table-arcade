// The first staff user for a venue, from the command line.
//
//   npm run staff:add -- <slug> <email> <name>
//
// Prompts for the password (or reads STAFF_PASSWORD, for scripts) and writes
// the user to whichever backend the server would use: Postgres with
// DATABASE_URL, else JSON under DATA_DIR (default data/). Once one user
// exists, the rest can be added from the staff screen.
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createRepos } from '../server/db/index.js'
import { MIN_PASSWORD } from '../server/db/staff.js'
import { loadVenues } from '../server/venues.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(here, '..', 'data')

const [slug, email, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ')
if (!slug || !email || !name) {
  console.error('usage: npm run staff:add -- <slug> <email> <name>')
  process.exit(1)
}

// A password typed at the terminal is not echoed.
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const write = rl._writeToOutput.bind(rl)
    rl.question(question, (answer) => {
      rl._writeToOutput = write
      process.stdout.write('\n')
      rl.close()
      resolve(answer)
    })
    rl._writeToOutput = () => {}
  })
}

async function askPassword() {
  if (process.env.STAFF_PASSWORD) return process.env.STAFF_PASSWORD
  if (!process.stdin.isTTY) {
    console.error('no terminal to prompt on — set STAFF_PASSWORD')
    process.exit(1)
  }
  const first = await promptHidden(`Password for ${email} (at least ${MIN_PASSWORD} characters): `)
  const second = await promptHidden('Again: ')
  if (first !== second) {
    console.error('those did not match')
    process.exit(1)
  }
  return first
}

const repos = await createRepos({ dataDir, log: console.log })
try {
  const venues = await loadVenues(repos)
  const venue = venues.find((v) => v.slug === slug.toLowerCase())
  if (!venue) {
    console.error(`no venue "${slug}" — known: ${venues.map((v) => v.slug).join(', ')}`)
    process.exit(1)
  }
  const password = await askPassword()
  const user = await repos.staff.create({ venue: venue.slug, email, password, name })
  const storage = repos.backend === 'postgres' ? 'postgres' : `${repos.backend} (${dataDir})`
  console.log(`  ${user.name} <${user.email}> can now sign in at /v/${venue.slug}/staff  ·  storage: ${storage}`)
} catch (error) {
  console.error(error.code ? `  ${error.message}` : error)
  process.exitCode = 1
} finally {
  await repos.close()
}
