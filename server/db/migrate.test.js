import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listMigrations, migrate } from './migrate.js'

const DATABASE_URL = process.env.DATABASE_URL

test('migrations are discovered in version order and nothing else is', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'))
  for (const name of ['010_later.sql', '002_second.sql', 'notes.md', '001_init.sql', '003_third.sql.bak']) {
    fs.writeFileSync(path.join(dir, name), '')
  }
  assert.deepEqual(
    listMigrations(dir).map((m) => m.version),
    ['001_init', '002_second', '010_later']
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the shipped migrations are numbered without gaps or duplicates', () => {
  const versions = listMigrations().map((m) => Number(m.version.split('_')[0]))
  assert.ok(versions.length >= 1)
  assert.deepEqual(versions, versions.map((_, i) => i + 1))
})

test(
  'the runner applies each file once and records it',
  { skip: DATABASE_URL ? false : 'DATABASE_URL is not set' },
  async () => {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: DATABASE_URL })
    try {
      await migrate(pool)
      // A second run finds nothing left to do.
      assert.deepEqual(await migrate(pool), [])
      const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version')
      assert.deepEqual(rows.map((r) => r.version), listMigrations().map((m) => m.version))
      const { rows: tables } = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      )
      for (const name of ['devices', 'floorplans', 'staff_users', 'tickets', 'venues']) {
        assert.ok(tables.some((r) => r.table_name === name), `${name} exists`)
      }
    } finally {
      await pool.end()
    }
  }
)
