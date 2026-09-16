import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import express from 'express'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { init } from './handlers.js'
import { createMemoryRepos } from './db/index.js'
import { hashToken } from './db/devices.js'
import { createPairingStore, createRateLimiter, pairHandler, GUESS_LIMIT } from './pairing.js'

// `north` insists on pairing, the way a real venue does in production; `open`
// is what every venue is on the dev server, and what the other tests rely on.
const VENUES = [
  { slug: 'north', name: 'North', botTables: [12], requirePairing: true },
  { slug: 'open', name: 'Open', botTables: [12], requirePairing: false }
]

async function boot(repos = createMemoryRepos()) {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer)
  const server = init(io, { venues: VENUES, repos })
  app.post('/api/venue/:slug/pair', express.json(), pairHandler({ roomFor: server.roomFor }))
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  const base = `http://localhost:${port}`
  return {
    app: server,
    repos,
    pair: (slug, body) =>
      fetch(`${base}/api/venue/${slug}/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }),
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
// goes on the socket the moment it is made.
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
  return { next, until }
}

/* ------------------------------------------------------------- codes --- */

test('a pairing code is six digits, works once, and expires', () => {
  const store = createPairingStore()
  const { code, expiresAt } = store.create({ now: 1000 })
  assert.match(code, /^\d{6}$/)
  assert.equal(expiresAt, 1000 + 5 * 60_000)

  assert.equal(store.redeem('000000' === code ? '000001' : '000000', 2000), false)
  assert.equal(store.redeem(code, 2000), true)
  assert.equal(store.redeem(code, 2000), false, 'a code is single use')

  const late = store.create({ now: 1000 })
  assert.equal(store.redeem(late.code, late.expiresAt), false, 'expired at the deadline')
  assert.equal(store.live(), 0)

  const short = store.create({ ttl: 10, now: 1000 })
  assert.equal(store.redeem(short.code, 1005), true)
  assert.equal(store.redeem(undefined), false)
  assert.equal(store.redeem({}), false)
})

test('the rate limiter allows the limit and refuses the one after, per key, per window', () => {
  const limiter = createRateLimiter({ limit: 3, window: 1000 })
  assert.equal(limiter.hit('a', 0), false)
  assert.equal(limiter.hit('a', 1), false)
  assert.equal(limiter.hit('a', 2), false)
  assert.equal(limiter.hit('a', 3), true)
  assert.equal(limiter.hit('b', 3), false, 'another key is unaffected')
  assert.equal(limiter.hit('a', 1002), false, 'the window has moved on')
})

/* ---------------------------------------------------------- endpoint --- */

test('a valid code becomes a device token, exactly once', async (t) => {
  const server = await boot()
  t.after(() => server.close())
  const room = server.app.roomFor('north')
  const { code } = room.pairing.create()

  const res = await server.pair('north', { code, label: 'Window' })
  assert.equal(res.status, 200)
  const { token, deviceId } = await res.json()
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  const device = await server.repos.devices.find(hashToken(token))
  assert.equal(device.id, deviceId)
  assert.equal(device.venue, 'north')
  assert.equal(device.label, 'Window')

  const again = await server.pair('north', { code })
  assert.equal(again.status, 401)
  assert.equal((await again.json()).error, 'BAD_CODE')
})

test('a code from one venue does not pair a tablet into another', async (t) => {
  const server = await boot()
  t.after(() => server.close())
  const { code } = server.app.roomFor('north').pairing.create()
  assert.equal((await server.pair('open', { code })).status, 401)
  assert.equal((await server.pair('nowhere', { code })).status, 404)
})

test('an expired code is refused', async (t) => {
  const server = await boot()
  t.after(() => server.close())
  const { code } = server.app.roomFor('north').pairing.create({ ttl: 1 })
  await new Promise((resolve) => setTimeout(resolve, 5))
  const res = await server.pair('north', { code })
  assert.equal(res.status, 401)
})

test('guesses are rate limited', async (t) => {
  const server = await boot()
  t.after(() => server.close())
  const room = server.app.roomFor('north')
  const { code } = room.pairing.create()

  for (let i = 0; i < GUESS_LIMIT; i += 1) {
    assert.equal((await server.pair('north', { code: '000000' })).status, 401)
  }
  const blocked = await server.pair('north', { code })
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).error, 'TOO_MANY')
  // The limiter answered before the code was looked at, so it is still good.
  assert.equal(room.pairing.live(), 1)
})

/* --------------------------------------------------------- handshake --- */

test('a venue that requires pairing refuses a socket without a token', async (t) => {
  const server = await boot()
  const bare = server.client('north')
  const wrong = server.client('north', { token: 'not-a-token' })
  t.after(() => server.close(bare, wrong))
  assert.equal(await outcome(bare), 'Unauthorized')
  assert.equal(await outcome(wrong), 'Unauthorized')
})

test('a paired tablet is admitted, seen, and kicked when revoked', async (t) => {
  const server = await boot()
  const room = server.app.roomFor('north')
  const { code } = room.pairing.create()
  const { token, deviceId } = await (await server.pair('north', { code })).json()

  const tablet = server.client('north', { token })
  const staff = server.client('north', { staff: 'dev' })
  t.after(() => server.close(tablet, staff))
  assert.equal(await outcome(tablet), 'connect')
  assert.equal(room.nsp.sockets.get(tablet.id).data.deviceId, deviceId)
  // Touched on connect (throttled after that).
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok((await server.repos.devices.find(hashToken(token))).lastSeenAt > 0)

  // Staff see it online, then revoke it.
  const devices = inbox(staff, 'staff:devices')
  if (!staff.connected) await once(staff, 'connect')
  staff.emit('staff:join')
  const listed = await devices.until((p) => p.devices.some((d) => d.id === deviceId && d.online))
  assert.equal(listed.devices[0].label, 'Tablet')

  const revoked = once(tablet, 'device:revoked')
  const dropped = once(tablet, 'disconnect')
  staff.emit('staff:revokeDevice', { id: deviceId })
  assert.deepEqual(await revoked, { deviceId })
  assert.equal(await dropped, 'io server disconnect')
  await devices.until((p) => !p.devices.some((d) => d.id === deviceId))

  // The stale token is no good on the way back in.
  const back = server.client('north', { token })
  t.after(() => back.close())
  assert.equal(await outcome(back), 'Unauthorized')
})

test('a token from one venue is refused by another', async (t) => {
  const server = await boot()
  const { code } = server.app.roomFor('north').pairing.create()
  const { token } = await (await server.pair('north', { code })).json()
  const elsewhere = server.client('open', { token })
  t.after(() => server.close(elsewhere))
  // `open` admits anyone, but it does not mistake north's device for its own.
  assert.equal(await outcome(elsewhere), 'connect')
  assert.equal(server.app.roomFor('open').nsp.sockets.get(elsewhere.id).data.deviceId, undefined)
})

test('a venue with requirePairing off admits a socket without a token', async (t) => {
  const server = await boot()
  const bare = server.client('open')
  t.after(() => server.close(bare))
  assert.equal(await outcome(bare), 'connect')
})

// The staff screen no longer gets in on `staff: true`; a session token (or,
// outside production with no users, the dev door) is what admits it. See
// staff.test.js.
test('a staff handshake with the old `staff: true` flag is refused', async (t) => {
  const server = await boot()
  const staff = server.client('north', { staff: true })
  t.after(() => server.close(staff))
  assert.equal(await outcome(staff), 'Unauthorized')
})
