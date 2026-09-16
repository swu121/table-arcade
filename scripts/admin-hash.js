// The platform operator's password, as a hash to configure the server with.
//
//   npm run admin:hash
//
// Prompts for a password (or reads ADMIN_PASSWORD) and prints the
// `scrypt:N:r:p:salt:hash` line to put in ADMIN_PASSWORD_HASH — the same
// format every staff password is stored in. Nothing is written anywhere: the
// operator is two env vars, not a row.
import readline from 'node:readline'
import { MIN_PASSWORD, hashPassword } from '../server/db/staff.js'

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
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD
  if (!process.stdin.isTTY) {
    console.error('no terminal to prompt on — set ADMIN_PASSWORD')
    process.exit(1)
  }
  const first = await promptHidden(`Admin password (at least ${MIN_PASSWORD} characters): `)
  const second = await promptHidden('Again: ')
  if (first !== second) {
    console.error('those did not match')
    process.exit(1)
  }
  return first
}

const password = await askPassword()
if (password.length < MIN_PASSWORD) {
  console.error(`that is under ${MIN_PASSWORD} characters`)
  process.exit(1)
}

const hash = await hashPassword(password)
console.log(`\nADMIN_PASSWORD_HASH=${hash}\n`)
console.log('  Set it alongside ADMIN_EMAIL. On Fly:')
console.log(`  fly secrets set ADMIN_EMAIL=you@example.com ADMIN_PASSWORD_HASH='${hash}'\n`)
