import { createHash, randomBytes } from 'node:crypto'

// A device is one paired tablet. The plaintext token is handed out exactly
// once, at pairing; every backend stores only its SHA-256, so a copy of the
// database (or of data/) cannot be used to walk into a venue.
//
//   { id, venue, label, createdAt, revokedAt, lastSeenAt }   (times in ms)

export const newToken = () => randomBytes(32).toString('base64url')

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')

export const DEFAULT_LABEL = 'Tablet'

export const cleanLabel = (label) => String(label ?? '').trim().slice(0, 60) || DEFAULT_LABEL

const ms = (value) => (value == null ? null : value instanceof Date ? value.getTime() : Number(value))

// Postgres row -> device.
export function fromRow(row) {
  return {
    id: String(row.id),
    venue: row.venue,
    label: row.label ?? DEFAULT_LABEL,
    createdAt: ms(row.created_at),
    revokedAt: ms(row.revoked_at),
    lastSeenAt: ms(row.last_seen_at)
  }
}

// The in-memory and on-disk shape is the device itself, plus the hash.
export const publicDevice = ({ tokenHash: _hash, ...device }) => ({ ...device })

// Memory and file share one implementation over a tiny store interface:
//   all()            -> every record, every venue (with tokenHash)
//   put(record)      -> insert or replace by id
export function createDevicesRepo(store) {
  const byId = (id) => store.all().find((d) => d.id === String(id)) ?? null

  return {
    async issue({ venue, label } = {}) {
      if (!venue) throw new Error('issue: venue is required')
      const token = newToken()
      const record = {
        id: `d_${randomBytes(6).toString('base64url')}`,
        venue,
        label: cleanLabel(label),
        tokenHash: hashToken(token),
        createdAt: Date.now(),
        revokedAt: null,
        lastSeenAt: null
      }
      store.put(record)
      return { ...publicDevice(record), token }
    },
    async find(tokenHash) {
      const record = store.all().find((d) => d.tokenHash === tokenHash)
      return record ? publicDevice(record) : null
    },
    async list(venue) {
      return store
        .all()
        .filter((d) => d.venue === venue && d.revokedAt === null)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(publicDevice)
    },
    async revoke(id) {
      const record = byId(id)
      if (!record || record.revokedAt !== null) return false
      store.put({ ...record, revokedAt: Date.now() })
      return true
    },
    async touch(id, at = Date.now()) {
      const record = byId(id)
      if (!record) return
      store.put({ ...record, lastSeenAt: at })
    }
  }
}
