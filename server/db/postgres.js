import pg from 'pg'
import { normalise } from '../venues.js'
import { migrate } from './migrate.js'
import { fromRow, toRow } from './tickets.js'
import { cleanLabel, fromRow as deviceFromRow, hashToken, newToken } from './devices.js'
import {
  checkNewUser,
  cleanEmail,
  cleanName,
  fromRow as staffFromRow,
  hashPassword,
  staffError,
  verifyPassword
} from './staff.js'

// The durable backend. Opening it runs any pending migrations, so a deploy
// against a fresh database comes up with its tables already there.
export async function createPostgresRepos(connectionString, { log = () => {} } = {}) {
  const pool = new pg.Pool({ connectionString, max: 5 })
  // A dropped idle connection must not take the process down with it.
  pool.on('error', (error) => console.warn('db: pool error —', error.message))
  await migrate(pool, { log })

  const query = (text, params) => pool.query(text, params)

  return {
    backend: 'postgres',
    pool,

    venues: {
      async list() {
        const { rows } = await query('SELECT slug, name, menu, bot_tables, require_pairing FROM venues ORDER BY id')
        return normalise(
          rows.map((r) => ({
            slug: r.slug,
            name: r.name,
            menu: r.menu,
            botTables: r.bot_tables,
            requirePairing: r.require_pairing ?? undefined
          }))
        )
      },
      async upsert(venue) {
        await query(
          `INSERT INTO venues (slug, name, menu, bot_tables, require_pairing)
           VALUES ($1, $2, $3::jsonb, $4::integer[], $5)
           ON CONFLICT (slug) DO UPDATE
             SET name = EXCLUDED.name, menu = EXCLUDED.menu, bot_tables = EXCLUDED.bot_tables,
                 require_pairing = EXCLUDED.require_pairing, updated_at = now()`,
          [
            venue.slug,
            venue.name,
            JSON.stringify(venue.menu ?? []),
            venue.botTables ?? [],
            typeof venue.requirePairing === 'boolean' ? venue.requirePairing : null
          ]
        )
      }
    },

    floorplans: {
      async get(slug) {
        const { rows } = await query('SELECT plan FROM floorplans WHERE venue_slug = $1', [slug])
        return rows[0]?.plan ?? null
      },
      async save(slug, plan) {
        await query(
          `INSERT INTO floorplans (venue_slug, plan) VALUES ($1, $2::jsonb)
           ON CONFLICT (venue_slug) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()`,
          [slug, JSON.stringify(plan)]
        )
      }
    },

    tickets: {
      async create(slug, ticket) {
        const r = toRow(slug, ticket)
        await query(
          `INSERT INTO tickets
             (id, venue_slug, from_table, to_table, item, price, kind, status, game_id, game_name, reason, created_at, delivered_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [r.id, r.venue_slug, r.from_table, r.to_table, JSON.stringify(r.item), r.price, r.kind, r.status,
           r.game_id, r.game_name, r.reason, r.created_at, r.delivered_at]
        )
      },
      async deliver(slug, id, deliveredAt = Date.now()) {
        await query(
          `UPDATE tickets SET status = 'delivered', delivered_at = $3
           WHERE venue_slug = $1 AND id = $2 AND status = 'open'`,
          [slug, id, new Date(deliveredAt)]
        )
      },
      async openFor(slug) {
        const { rows } = await query(
          `SELECT * FROM tickets WHERE venue_slug = $1 AND status = 'open' ORDER BY created_at`,
          [slug]
        )
        return rows.map(fromRow)
      },
      // Staff cleared the table: the party left and nothing of theirs should
      // greet the next one, which is what the room does with its own Map.
      async clearFor(slug, table) {
        await query('DELETE FROM tickets WHERE venue_slug = $1 AND (from_table = $2 OR to_table = $2)', [slug, table])
      }
    },

    // Paired tablets. The plaintext token leaves this function once, from
    // issue(); every other call speaks in hashes and ids.
    devices: {
      async issue({ venue, label } = {}) {
        const token = newToken()
        const { rows } = await query(
          `INSERT INTO devices (venue_id, token_hash, label)
           SELECT id, $2, $3 FROM venues WHERE slug = $1
           RETURNING id, $1::text AS venue, label, created_at, revoked_at, last_seen_at`,
          [venue, hashToken(token), cleanLabel(label)]
        )
        if (!rows[0]) throw new Error(`issue: no venue ${venue}`)
        return { ...deviceFromRow(rows[0]), token }
      },
      async find(tokenHash) {
        const { rows } = await query(
          `SELECT d.id, v.slug AS venue, d.label, d.created_at, d.revoked_at, d.last_seen_at
           FROM devices d JOIN venues v ON v.id = d.venue_id
           WHERE d.token_hash = $1`,
          [tokenHash]
        )
        return rows[0] ? deviceFromRow(rows[0]) : null
      },
      async list(venue) {
        const { rows } = await query(
          `SELECT d.id, v.slug AS venue, d.label, d.created_at, d.revoked_at, d.last_seen_at
           FROM devices d JOIN venues v ON v.id = d.venue_id
           WHERE v.slug = $1 AND d.revoked_at IS NULL
           ORDER BY d.created_at`,
          [venue]
        )
        return rows.map(deviceFromRow)
      },
      async revoke(id) {
        if (!/^\d+$/.test(String(id))) return false
        const { rowCount } = await query('UPDATE devices SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id])
        return rowCount > 0
      },
      async touch(id, at = Date.now()) {
        if (!/^\d+$/.test(String(id))) return
        await query('UPDATE devices SET last_seen_at = $2 WHERE id = $1', [id, new Date(at)])
      }
    },

    // Staff logins. Only the scrypt hash is stored; verify() does the
    // comparison in JS (see db/staff.js) and stamps last_login_at.
    staff: {
      async create({ venue, email, password, name } = {}) {
        const clean = { email: cleanEmail(email), name: cleanName(name), password }
        checkNewUser(clean)
        const passwordHash = await hashPassword(password)
        let rows
        try {
          ;({ rows } = await query(
            `INSERT INTO staff_users (venue_id, email, password_hash, name)
             SELECT id, $2, $3, $4 FROM venues WHERE slug = $1
             RETURNING id, $1::text AS venue, email, name, created_at, revoked_at, last_login_at`,
            [venue, clean.email, passwordHash, clean.name]
          ))
        } catch (error) {
          if (error.code === '23505') throw staffError('EMAIL_TAKEN', 'Someone here already signs in with that email.')
          throw error
        }
        if (!rows[0]) throw new Error(`create: no venue ${venue}`)
        return staffFromRow(rows[0])
      },
      async findByEmail(venue, email) {
        const { rows } = await query(
          `SELECT s.id, v.slug AS venue, s.email, s.name, s.created_at, s.revoked_at, s.last_login_at
           FROM staff_users s JOIN venues v ON v.id = s.venue_id
           WHERE v.slug = $1 AND lower(s.email) = $2`,
          [venue, cleanEmail(email)]
        )
        return rows[0] ? staffFromRow(rows[0]) : null
      },
      async list(venue) {
        const { rows } = await query(
          `SELECT s.id, v.slug AS venue, s.email, s.name, s.created_at, s.revoked_at, s.last_login_at
           FROM staff_users s JOIN venues v ON v.id = s.venue_id
           WHERE v.slug = $1 AND s.revoked_at IS NULL
           ORDER BY s.created_at`,
          [venue]
        )
        return rows.map(staffFromRow)
      },
      async revoke(id) {
        if (!/^\d+$/.test(String(id))) return false
        const { rowCount } = await query('UPDATE staff_users SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id])
        return rowCount > 0
      },
      async verify(venue, email, password) {
        const { rows } = await query(
          `SELECT s.id, v.slug AS venue, s.email, s.name, s.password_hash, s.created_at, s.revoked_at, s.last_login_at
           FROM staff_users s JOIN venues v ON v.id = s.venue_id
           WHERE v.slug = $1 AND lower(s.email) = $2`,
          [venue, cleanEmail(email)]
        )
        const row = rows[0]
        // Verified against a throwaway hash when there is no such user, so
        // the two answers take the same time.
        const good = await verifyPassword(password, row ? row.password_hash : await hashPassword('not-a-password'))
        if (!good || !row || row.revoked_at !== null) return null
        const at = new Date()
        await query('UPDATE staff_users SET last_login_at = $2 WHERE id = $1', [row.id, at])
        return staffFromRow({ ...row, last_login_at: at })
      }
    },

    async close() {
      await pool.end()
    }
  }
}
