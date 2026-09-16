import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Versioned migrations: every server/db/migrations/NNN_name.sql runs once, in
// filename order, and schema_migrations remembers which have. Runs at boot, so
// a deploy is "push the code"; also runnable by hand with `npm run db:migrate`.

const here = path.dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = path.join(here, 'migrations')

// Any constant will do; it just has to be the same in every process that
// might boot against this database at once.
const LOCK_KEY = 0x7ab1e_a7c

export function listMigrations(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort()
    .map((name) => ({ version: name.replace(/\.sql$/, ''), file: path.join(dir, name) }))
}

// `pool` is anything with connect() -> client with query()/release(): a pg.Pool.
// Returns the versions applied by this call.
export async function migrate(pool, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  const client = await pool.connect()
  const applied = []
  try {
    // Two machines rolling at once must not both try to create the tables —
    // and that includes this one: CREATE TABLE IF NOT EXISTS is not atomic
    // across sessions, so the lock comes before the bookkeeping.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version    text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`)
      const { rows } = await client.query('SELECT version FROM schema_migrations')
      const done = new Set(rows.map((r) => r.version))
      for (const { version, file } of listMigrations(dir)) {
        if (done.has(version)) continue
        const sql = fs.readFileSync(file, 'utf8')
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw new Error(`migration ${version} failed: ${error.message}`)
        }
        applied.push(version)
        log(`  applied ${version}`)
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY])
    }
  } finally {
    client.release()
  }
  return applied
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: url })
  try {
    const applied = await migrate(pool, { log: console.log })
    console.log(applied.length ? `  ${applied.length} migration(s) applied` : '  schema is up to date')
  } finally {
    await pool.end()
  }
}
