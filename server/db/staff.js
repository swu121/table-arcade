import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

// A staff user is one login for one venue. Passwords are hashed with scrypt
// (Node's own, no dependency) and stored as `scrypt:N:r:p:salt:hash`, so a
// copy of the database (or of data/) is not a way in.
//
//   { id, venue, email, name, createdAt, revokedAt, lastLoginAt }   (times in ms)

const scrypt = promisify(scryptCb)

export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, saltBytes: 16 }
export const MIN_PASSWORD = 8

// Errors the repos throw carry a code the handlers can put on screen.
export const staffError = (code, message) => Object.assign(new Error(message), { code })

export const cleanEmail = (email) => String(email ?? '').trim().toLowerCase().slice(0, 120)
export const cleanName = (name, fallback = '') => String(name ?? '').trim().slice(0, 60) || fallback

// Loose on purpose: something@something, no spaces. The venue owner types
// these, not the public.
export const validEmail = (email) => /^[^\s@]+@[^\s@]+$/.test(email)

export function checkNewUser({ email, password, name }) {
  if (!validEmail(email)) throw staffError('BAD_EMAIL', 'That does not look like an email address.')
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw staffError('WEAK_PASSWORD', `Passwords need at least ${MIN_PASSWORD} characters.`)
  }
  if (!name) throw staffError('BAD_NAME', 'Give them a name.')
}

export async function hashPassword(password, { N, r, p, keylen, saltBytes } = SCRYPT) {
  const salt = randomBytes(saltBytes)
  const key = await scrypt(String(password), salt, keylen, { N, r, p })
  return `scrypt:${N}:${r}:${p}:${salt.toString('base64url')}:${key.toString('base64url')}`
}

// Constant-time on the comparison, and always does the work: a malformed
// stored hash still costs one scrypt, so the answer's timing is the same.
export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored ?? '').split(':')
  const ok = scheme === 'scrypt' && salt && hash
  const expected = ok ? Buffer.from(hash, 'base64url') : Buffer.alloc(SCRYPT.keylen)
  const params = ok ? { N: Number(N), r: Number(r), p: Number(p) } : { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }
  let key
  try {
    key = await scrypt(String(password), ok ? Buffer.from(salt, 'base64url') : Buffer.alloc(SCRYPT.saltBytes), expected.length, params)
  } catch {
    return false
  }
  return ok && key.length === expected.length && timingSafeEqual(key, expected)
}

// What an unknown email is verified against, so "no such user" and "wrong
// password" take the same time.
const DUMMY_HASH = hashPassword('not-a-password')

const ms = (value) => (value == null ? null : value instanceof Date ? value.getTime() : Number(value))

// Postgres row -> user.
export function fromRow(row) {
  return {
    id: String(row.id),
    venue: row.venue,
    email: row.email,
    name: row.name ?? row.email,
    createdAt: ms(row.created_at),
    revokedAt: ms(row.revoked_at),
    lastLoginAt: ms(row.last_login_at)
  }
}

export const publicUser = ({ passwordHash: _hash, ...user }) => ({ ...user })

// Memory and file share one implementation over a tiny store interface:
//   all()            -> every record, every venue (with passwordHash)
//   put(record)      -> insert or replace by id
export function createStaffRepo(store) {
  const byId = (id) => store.all().find((u) => u.id === String(id)) ?? null
  const lookup = (venue, email) =>
    store.all().find((u) => u.venue === venue && u.email === cleanEmail(email)) ?? null

  return {
    async create({ venue, email, password, name } = {}) {
      if (!venue) throw new Error('create: venue is required')
      const clean = { email: cleanEmail(email), name: cleanName(name), password }
      checkNewUser(clean)
      if (lookup(venue, clean.email)) throw staffError('EMAIL_TAKEN', 'Someone here already signs in with that email.')
      const record = {
        id: `s_${randomBytes(6).toString('base64url')}`,
        venue,
        email: clean.email,
        name: clean.name,
        passwordHash: await hashPassword(password),
        createdAt: Date.now(),
        revokedAt: null,
        lastLoginAt: null
      }
      store.put(record)
      return publicUser(record)
    },
    async findByEmail(venue, email) {
      const record = lookup(venue, email)
      return record ? publicUser(record) : null
    },
    async list(venue) {
      return store
        .all()
        .filter((u) => u.venue === venue && u.revokedAt === null)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(publicUser)
    },
    async revoke(id) {
      const record = byId(id)
      if (!record || record.revokedAt !== null) return false
      store.put({ ...record, revokedAt: Date.now() })
      return true
    },
    // The user on a good password for an active account, else null — and
    // the same amount of work either way.
    async verify(venue, email, password) {
      const record = lookup(venue, email)
      const good = await verifyPassword(password, record ? record.passwordHash : await DUMMY_HASH)
      if (!good || !record || record.revokedAt !== null) return null
      const seen = { ...record, lastLoginAt: Date.now() }
      store.put(seen)
      return publicUser(seen)
    }
  }
}
