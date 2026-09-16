import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import express from 'express'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { init } from './handlers.js'
import { createMemoryRepos } from './db/index.js'
import { hashPassword, verifyPassword } from './db/staff.js'
import { LOGIN_LIMIT, createStaffSessions, loginHandler, logoutHandler, statusHandler } from './staff.js'

// `north` insists on pairing, as a venue does in production; `open` does not.
// Neither has a staff user until a test makes one, so the dev door is open in
// both until then (NODE_ENV is unset under `npm test`).
const VENUES = [
  { slug: 'north', name: 'North', botTables: [12], requirePairing: true },
  { slug: 'open', name: 'Open', botTables: [12], requirePairing: false }
]

const SAM = { email: 'Sam@Example.com', password: 'correct horse', name: 'Sam' }

async function boot(repos = createMemoryRepos()) {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer)
  const server = init(io, { venues: VENUES, repos })
  app.post('/api/venue/:slug/staff/login', express.json(), loginHandler({ roomFor: server.roomFor }))
  app.post('/api/venue/:slug/staff/logout', express.json(), logoutHandler({ roomFor: server.roomFor }))
  app.get('/api/venue/:slug/staff/status', statusHandler({ roomFor: server.roomFor }))
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  const base = `http://localhost:${port}`
  const post = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
  return {
    app: server,
    repos,
    login: (slug, body) => post(`/api/venue/${slug}/staff/login`, body),
    logout: (slug, token) => post(`/api/venue/${slug}/staff/logout`, {}, { authorization: `Bearer ${token}` }),
    status: (slug) => fetch(`${base}/api/venue/${slug}/staff/status`).then((r) => r.json()),
    client: (slug, auth = {}) => watch(connect(`${base}/venue/${slug}`, { transports: ['websocket'], auth })),
    close: async (...clients) => {
      for (const client of clients) client.close()
      server.stop()
      io.close()
      await new Promise((resolve) => httpServer.close(resolve))
    }
  }
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve))

// A middleware refusal is final — the client does not retry — so the listener
// has to be on the socket from the moment it is made, not when a test gets
// round to asking.
function watch(socket) {
  socket.outcome = new Promise((resolve) => {
    socket.once('connect', () => resolve('connect'))
    socket.once('connect_error', (error) => resolve(error.message))
  })
  return socket
}

// Resolves with 'connect' or the connect_error message, whichever came first.
const outcome = (socket) => socket.outcome

function inbox(socket, event) {
  const queue = []
  const waiting = []
  socket.on(event, (payload) => (waiting.length ? waiting.shift()(payload) : queue.push(payload)))
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiting.push(resolve)))
  const until = async (pred) => {
    let payload
    do payload = await next()
    while (!pred(payload))
    return payload
  }
  return { next, until, size: () => queue.length }
}

const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))

async function signIn(server, slug, { email, password } = SAM) {
  const res = await server.login(slug, { email, password })
  assert.equal(res.status, 200)
  return res.json()
}

// The tests run with NODE_ENV unset; a few need to see production.
function inProduction(t) {
  const before = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  t.after(() => {
    if (before === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = before
  })
}

/* ---------------------------------------------------------- passwords --- */

test('passwords hash with scrypt, verify in constant time, and never match the wrong one', async () => {
  const stored = await hashPassword('correct horse')
  assert.match(stored, /^scrypt:16384:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
  assert.notEqual(stored, await hashPassword('correct horse'), 'a fresh salt each time')
  assert.equal(await verifyPassword('correct horse', stored), true)
  assert.equal(await verifyPassword('correct horsf', stored), false)
  assert.equal(await verifyPassword('', stored), false)
  assert.equal(await verifyPassword('correct horse', 'garbage'), false)
  assert.equal(await verifyPassword('correct horse', null), false)
})

/* ----------------------------------------------------------- sessions --- */

test('a session token resolves until it expires, and each use slides the expiry', () => {
  const sessions = createStaffSessions({ ttl: 1000 })
  const user = { id: 's_1', name: 'Sam', email: 'sam@example.com' }
  const { token, expiresAt } = sessions.create(user, 0)
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(expiresAt, 1000)

  assert.equal(sessions.resolve(token, 900).userId, 's_1')
  assert.equal(sessions.resolve(token, 1500).userId, 's_1', 'the use at 900 pushed the expiry to 1900')
  assert.equal(sessions.resolve(token, 3000), null)
  assert.equal(sessions.resolve('nope', 0), null)
  assert.equal(sessions.resolve(undefined, 0), null)

  const again = sessions.create(user, 0)
  assert.equal(sessions.revokeUser('s_1'), 1)
  assert.equal(sessions.resolve(again.token, 1), null)
})

/* ----------------------------------------------------------- endpoint --- */

test('a good login returns a session; the wrong password, an unknown email and a revoked user all get the same 401', async (t) => {
  const server = await boot()
  t.after(() => server.close())
  const sam = await server.repos.staff.create({ venue: 'north', ...SAM })

  const good = await server.login('north', { email: 'sam@example.com', password: 'correct horse' })
  assert.equal(good.status, 200)
  const session = await good.json()
  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(session.name, 'Sam')
  assert.ok(session.expiresAt > Date.now() + 13 * 24 * 60 * 60_000)
  assert.ok((await server.repos.staff.findByEmail('north', SAM.email)).lastLoginAt > 0)

  const wrong = await server.login('north', { email: SAM.email, password: 'correct horsf' })
  assert.equal(wrong.status, 401)
  assert.equal((await wrong.json()).error, 'BAD_LOGIN')

  const unknown = await server.login('north', { email: 'nobody@example.com', password: 'correct horse' })
  assert.equal(unknown.status, 401)
  assert.equal((await unknown.json()).error, 'BAD_LOGIN')

  // Sam's login is Sam's venue's only.
  assert.equal((await server.login('open', { email: SAM.email, password: SAM.password })).status, 401)
  assert.equal((await server.login('nowhere', { email: SAM.email, password: SAM.password })).status, 404)
  assert.equal((await server.login('north', {})).status, 401)

  await server.repos.staff.revoke(sam.id)
  const revoked = await server.login('north', { email: SAM.email, password: SAM.password })
  assert.equal(revoked.status, 401)
  assert.equal((await revoked.json()).error, 'BAD_LOGIN')
})

test('login attempts are rate limited', async (t) => {
  const server = await boot()
  t.after(() => server.close())
  await server.repos.staff.create({ venue: 'north', ...SAM })

  for (let i = 0; i < LOGIN_LIMIT; i += 1) {
    assert.equal((await server.login('north', { email: SAM.email, password: 'wrong' })).status, 401)
  }
  const blocked = await server.login('north', { email: SAM.email, password: SAM.password })
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).error, 'TOO_MANY')
})

/* ---------------------------------------------------------- handshake --- */

test('a staff handshake needs a live session; a tablet is never staff', async (t) => {
  const server = await boot()
  await server.repos.staff.create({ venue: 'open', ...SAM })
  const { token } = await signIn(server, 'open')

  const bare = server.client('open', { staff: '' })
  const wrong = server.client('open', { staff: 'not-a-session' })
  const flag = server.client('open', { staff: true })
  const staff = server.client('open', { staff: token })
  const tablet = server.client('open')
  t.after(() => server.close(bare, wrong, flag, staff, tablet))

  assert.equal(await outcome(bare), 'Unauthorized')
  assert.equal(await outcome(wrong), 'Unauthorized')
  assert.equal(await outcome(flag), 'Unauthorized')
  assert.equal(await outcome(staff), 'connect')
  const room = server.app.roomFor('open')
  const data = room.nsp.sockets.get(staff.id).data
  assert.equal(data.staff.name, 'Sam')
  assert.equal(data.staff.email, 'sam@example.com')
  assert.equal(data.deviceId, undefined, 'a staff screen holds no device')

  // The staff screen gets the board and the user list; a tablet asking for
  // either, or trying to deliver a ticket, is refused.
  const users = inbox(staff, 'staff:users')
  staff.emit('staff:join')
  const board = await once(staff, 'staff:sync')
  assert.equal(board.venue.slug, 'open')
  const listed = await users.next()
  assert.deepEqual(listed.users.map((u) => u.email), ['sam@example.com'])
  assert.equal(listed.me.name, 'Sam')

  assert.equal(await outcome(tablet), 'connect')
  const errors = inbox(tablet, 'app:error')
  const syncs = inbox(tablet, 'staff:sync')
  tablet.emit('staff:join')
  assert.equal((await errors.next()).code, 'FORBIDDEN')
  tablet.emit('staff:deliver', { ticketId: 'tk_1' })
  assert.equal((await errors.next()).code, 'FORBIDDEN')
  tablet.emit('staff:pairCode')
  assert.equal((await errors.next()).code, 'FORBIDDEN')
  await settle()
  assert.equal(syncs.size(), 0)
  assert.equal(room.nsp.sockets.get(tablet.id).data.staff, undefined)
})

test('the dev door admits `staff: "dev"` only while the venue has no users, and never in production', async (t) => {
  const server = await boot()
  t.after(() => server.close())

  assert.deepEqual(await server.status('north'), { dev: true })
  const before = server.client('north', { staff: 'dev' })
  t.after(() => before.close())
  assert.equal(await outcome(before), 'connect')
  assert.equal(server.app.roomFor('north').nsp.sockets.get(before.id).data.staff.dev, true)

  // The dev screen can add the first real user — and that shuts the door.
  const users = inbox(before, 'staff:users')
  before.emit('staff:join')
  await users.next()
  before.emit('staff:addUser', { ...SAM })
  const added = await users.next()
  assert.deepEqual(added.users.map((u) => u.name), ['Sam'])

  assert.deepEqual(await server.status('north'), { dev: false })
  const after = server.client('north', { staff: 'dev' })
  t.after(() => after.close())
  assert.equal(await outcome(after), 'Unauthorized')

  // `open` still has nobody, so its door is open — until production.
  assert.deepEqual(await server.status('open'), { dev: true })
  inProduction(t)
  assert.deepEqual(await server.status('open'), { dev: false })
  const prod = server.client('open', { staff: 'dev' })
  t.after(() => prod.close())
  assert.equal(await outcome(prod), 'Unauthorized')
})

test('adding a user validates, refuses a duplicate email, and revoking kicks that user but never the last one', async (t) => {
  const server = await boot()
  await server.repos.staff.create({ venue: 'open', ...SAM })
  const { token } = await signIn(server, 'open')
  const staff = server.client('open', { staff: token })
  t.after(() => server.close(staff))
  const errors = inbox(staff, 'app:error')
  const users = inbox(staff, 'staff:users')
  if (!staff.connected) await once(staff, 'connect')
  staff.emit('staff:join')
  const first = await users.next()
  const samId = first.users[0].id

  staff.emit('staff:revokeUser', { id: samId })
  assert.equal((await errors.next()).code, 'LAST_STAFF')

  staff.emit('staff:addUser', { name: 'Ali', email: 'not an email', password: 'long enough' })
  assert.equal((await errors.next()).code, 'BAD_EMAIL')
  staff.emit('staff:addUser', { name: 'Ali', email: 'ali@example.com', password: 'short' })
  assert.equal((await errors.next()).code, 'WEAK_PASSWORD')
  staff.emit('staff:addUser', { name: 'Ali', email: 'SAM@example.com', password: 'long enough' })
  assert.equal((await errors.next()).code, 'EMAIL_TAKEN')
  staff.emit('staff:addUser', { name: 'Ali', email: 'ali@example.com', password: 'long enough' })
  const two = await users.until((p) => p.users.length === 2)
  const ali = two.users.find((u) => u.email === 'ali@example.com')

  // Ali signs in on another screen, then Sam revokes them: Ali is told and
  // dropped, and Ali's session is dead.
  const aliSession = await signIn(server, 'open', { email: 'ali@example.com', password: 'long enough' })
  const aliScreen = server.client('open', { staff: aliSession.token })
  t.after(() => aliScreen.close())
  assert.equal(await outcome(aliScreen), 'connect')
  const signedOut = once(aliScreen, 'staff:signedOut')
  const dropped = once(aliScreen, 'disconnect')
  staff.emit('staff:revokeUser', { id: ali.id })
  assert.deepEqual(await signedOut, { reason: 'revoked' })
  assert.equal(await dropped, 'io server disconnect')
  await users.until((p) => p.users.length === 1)
  const back = server.client('open', { staff: aliSession.token })
  t.after(() => back.close())
  assert.equal(await outcome(back), 'Unauthorized')
  assert.equal((await server.login('open', { email: 'ali@example.com', password: 'long enough' })).status, 401)

  // Revoking a user from another venue's screen is refused by id.
  staff.emit('staff:revokeUser', { id: 'nope' })
  assert.equal((await errors.next()).code, 'NO_USER')
})

test('logging out ends the session and drops its screen', async (t) => {
  const server = await boot()
  await server.repos.staff.create({ venue: 'open', ...SAM })
  const { token } = await signIn(server, 'open')
  const staff = server.client('open', { staff: token })
  t.after(() => server.close(staff))
  assert.equal(await outcome(staff), 'connect')

  const signedOut = once(staff, 'staff:signedOut')
  assert.equal((await server.logout('open', token)).status, 204)
  assert.deepEqual(await signedOut, { reason: 'logout' })

  const back = server.client('open', { staff: token })
  t.after(() => back.close())
  assert.equal(await outcome(back), 'Unauthorized')
  assert.equal(server.app.roomFor('open').staffSessions.live(), 0)
})
