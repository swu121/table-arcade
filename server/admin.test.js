import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import express from 'express'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { adminRouter, LOGIN_LIMIT } from './admin.js'
import { init } from './handlers.js'
import { createFileRepos, createMemoryRepos } from './db/index.js'
import { hashPassword } from './db/staff.js'
import { pairHandler } from './pairing.js'
import { loginHandler } from './staff.js'

// One venue to start with; every other one in these tests is created through
// the admin API on the running server, which is the whole point of it.
const VENUES = [{ slug: 'demo', name: 'Table Arcade', botTables: [12], requirePairing: false }]

const OPERATOR = { email: 'ops@example.com', password: 'correct horse staple' }
const OPERATOR_HASH = await hashPassword(OPERATOR.password)

// The three modes are read off process.env every time, so a test picks one and
// puts the environment back afterwards.
function mode(t, { email = null, hash = null, nodeEnv = undefined } = {}) {
  const before = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    NODE_ENV: process.env.NODE_ENV
  }
  const set = (key, value) => (value == null ? delete process.env[key] : (process.env[key] = value))
  set('ADMIN_EMAIL', email)
  set('ADMIN_PASSWORD_HASH', hash)
  if (nodeEnv !== undefined) set('NODE_ENV', nodeEnv)
  t.after(() => {
    for (const [key, value] of Object.entries(before)) set(key, value)
  })
}

const configured = (t) => mode(t, { email: OPERATOR.email, hash: OPERATOR_HASH })
const devDoor = (t) => mode(t, {})
const disabled = (t) => mode(t, { nodeEnv: 'production' })

async function boot(t, repos = createMemoryRepos()) {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer)
  const arcade = init(io, { venues: VENUES, repos })
  app.use('/api/admin', adminRouter({ arcade, repos }))
  app.post('/api/venue/:slug/pair', express.json(), pairHandler({ roomFor: arcade.roomFor }))
  app.post('/api/venue/:slug/staff/login', express.json(), loginHandler({ roomFor: arcade.roomFor }))
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const base = `http://localhost:${httpServer.address().port}`

  const clients = []
  const server = {
    arcade,
    repos,
    base,
    api: (method, path, { body, token } = {}) =>
      fetch(`${base}/api/admin${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
    pair: (slug, code) =>
      fetch(`${base}/api/venue/${slug}/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, label: 'Patio' })
      }),
    staffLogin: (slug, body) =>
      fetch(`${base}/api/venue/${slug}/staff/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }),
    client(slug, auth = {}) {
      const socket = watch(connect(`${base}/venue/${slug}`, { transports: ['websocket'], auth }))
      clients.push(socket)
      return socket
    }
  }

  server.signIn = async () => {
    const res = await server.api('POST', '/login', { body: OPERATOR })
    assert.equal(res.status, 200)
    return (await res.json()).token
  }

  t.after(async () => {
    for (const client of clients) client.close()
    arcade.stop()
    io.close()
    await new Promise((resolve) => httpServer.close(resolve))
  })
  return server
}

// A middleware refusal is final, and the first state:sync is sent the moment
// the connection is accepted — so both listeners go on the socket when it is
// made, not when a test gets round to asking.
function watch(socket) {
  socket.outcome = new Promise((resolve) => {
    socket.once('connect', () => resolve('connect'))
    socket.once('connect_error', (error) => resolve(error.message))
  })
  socket.syncs = inbox(socket, 'state:sync')
  return socket
}

function inbox(socket, event) {
  const queue = []
  const waiting = []
  socket.on(event, (payload) => (waiting.length ? waiting.shift()(payload) : queue.push(payload)))
  return {
    next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiting.push(resolve)))
  }
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'table-arcade-admin-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/* ------------------------------------------------------------- the door --- */

test('without a session the admin API is 401, and a wrong password never gets one', async (t) => {
  configured(t)
  const server = await boot(t)

  assert.equal((await server.api('GET', '/venues')).status, 401)
  assert.equal((await server.api('GET', '/venues', { token: 'not-a-token' })).status, 401)

  const wrongPassword = await server.api('POST', '/login', {
    body: { email: OPERATOR.email, password: 'nope nope nope' }
  })
  assert.equal(wrongPassword.status, 401)
  assert.equal((await wrongPassword.json()).error, 'BAD_LOGIN')

  const wrongEmail = await server.api('POST', '/login', {
    body: { email: 'someone@else.com', password: OPERATOR.password }
  })
  assert.equal(wrongEmail.status, 401)

  const token = await server.signIn()
  const venues = await server.api('GET', '/venues', { token })
  assert.equal(venues.status, 200)
  assert.deepEqual((await venues.json()).venues.map((v) => v.slug), ['demo'])

  // Signing out ends it.
  assert.equal((await server.api('POST', '/logout', { token })).status, 204)
  assert.equal((await server.api('GET', '/venues', { token })).status, 401)
})

test('admin logins are rate limited', async (t) => {
  configured(t)
  const server = await boot(t)
  const attempt = () => server.api('POST', '/login', { body: { email: OPERATOR.email, password: 'wrong' } })

  for (let i = 0; i < LOGIN_LIMIT; i += 1) assert.equal((await attempt()).status, 401)
  const over = await attempt()
  assert.equal(over.status, 429)
  assert.equal((await over.json()).error, 'TOO_MANY')
  // Even the right password is past the line now.
  assert.equal((await server.api('POST', '/login', { body: OPERATOR })).status, 429)
})

test('with neither env var set the dev door is open, and in production there is no admin at all', async (t) => {
  await t.test('dev', async (t) => {
    devDoor(t)
    const server = await boot(t)
    const status = await server.api('GET', '/status')
    assert.equal(status.status, 200)
    assert.equal((await status.json()).dev, true)
    // No token anywhere, and the list answers.
    const venues = await server.api('GET', '/venues')
    assert.equal(venues.status, 200)
    assert.deepEqual((await venues.json()).venues.map((v) => v.slug), ['demo'])
  })

  await t.test('production, unconfigured', async (t) => {
    disabled(t)
    const server = await boot(t)
    assert.equal((await server.api('GET', '/status')).status, 404)
    assert.equal((await server.api('GET', '/venues')).status, 404)
    assert.equal((await server.api('POST', '/login', { body: OPERATOR })).status, 404)
  })
})

/* ---------------------------------------------------------- the venues --- */

test('a venue created through the admin API is joinable with no restart', async (t) => {
  configured(t)
  const server = await boot(t)
  const token = await server.signIn()

  // Before it exists, the namespace is refused.
  assert.equal(await server.client('anchor').outcome, 'Invalid namespace')

  const res = await server.api('POST', '/venues', {
    token,
    body: { slug: 'anchor', name: 'The Anchor', requirePairing: false, botTables: [7] }
  })
  assert.equal(res.status, 201)
  const { venue } = await res.json()
  assert.equal(venue.slug, 'anchor')
  assert.equal(venue.name, 'The Anchor')
  assert.deepEqual(venue.botTables, [7])
  // It starts on the demo menu rather than nothing.
  assert.ok(venue.menu.length > 0)

  const tablet = server.client('anchor')
  assert.equal(await tablet.outcome, 'connect')
  const sync = await tablet.syncs.next()
  assert.equal(sync.venue.name, 'The Anchor')
  assert.deepEqual(sync.lobby.map((table) => table.number), [7])

  // And it is in the list, with the socket that just joined counted.
  const listed = (await (await server.api('GET', '/venues', { token })).json()).venues
  const row = listed.find((v) => v.slug === 'anchor')
  assert.equal(row.live, true)
  assert.equal(row.sockets, 1)
  assert.equal(row.staff, 0)
  assert.equal(row.devices, 0)
})

test('a bad slug, a duplicate and a missing name are refused', async (t) => {
  configured(t)
  const server = await boot(t)
  const token = await server.signIn()
  const post = (body) => server.api('POST', '/venues', { token, body })

  assert.equal((await post({ slug: 'Not A Slug', name: 'No' })).status, 400)
  assert.equal((await post({ slug: '-leading', name: 'No' })).status, 400)
  assert.equal((await post({ slug: 'fine', name: '  ' })).status, 400)
  assert.equal((await post({ slug: 'demo', name: 'Twice' })).status, 409)
  assert.equal((await post({ slug: 'fine', name: 'Fine' })).status, 201)
  assert.equal((await post({ slug: 'fine', name: 'Fine again' })).status, 409)
})

test('a new name and a new menu reach a live room on the next sync', async (t) => {
  configured(t)
  const server = await boot(t)
  const token = await server.signIn()

  const tablet = server.client('demo')
  assert.equal(await tablet.outcome, 'connect')
  const first = await tablet.syncs.next()
  assert.equal(first.venue.name, 'Table Arcade')

  const next = tablet.syncs.next()
  const res = await server.api('PATCH', '/venues/demo', {
    token,
    body: { name: 'The Old Arcade', menu: [{ id: 'soju', name: 'Soju', price: 12, icon: 'shot' }] }
  })
  assert.equal(res.status, 200)

  const sync = await next
  assert.equal(sync.venue.name, 'The Old Arcade')
  assert.deepEqual(sync.menu, [{ id: 'soju', name: 'Soju', price: 12, icon: 'shot' }])

  // A menu with nothing usable in it is refused rather than emptying the board.
  const bad = await server.api('PATCH', '/venues/demo', { token, body: { menu: [{ name: 'no id or price' }] } })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error, 'BAD_MENU')
  assert.equal(server.arcade.venues.get('demo').menu.length, 1)

  assert.equal((await server.api('PATCH', '/venues/nowhere', { token, body: { name: 'x' } })).status, 404)
})

test('new bot tables sit down in a live room', async (t) => {
  configured(t)
  const server = await boot(t)
  const token = await server.signIn()

  const tablet = server.client('demo')
  assert.equal(await tablet.outcome, 'connect')
  await tablet.syncs.next()

  const next = tablet.syncs.next()
  await server.api('PATCH', '/venues/demo', { token, body: { botTables: [12, 19] } })
  const sync = await next
  assert.deepEqual(sync.lobby.map((table) => table.number).sort((a, b) => a - b), [12, 19])
})

test('an archived venue is refused at the handshake and drops out of the default', async (t) => {
  configured(t)
  const server = await boot(t)
  const token = await server.signIn()

  await server.api('POST', '/venues', { token, body: { slug: 'annex', name: 'The Annex', requirePairing: false } })
  assert.equal(server.arcade.venues.default().slug, 'demo')

  // A room that is already live is closed too, not only a cold one.
  const before = server.client('demo')
  assert.equal(await before.outcome, 'connect')

  const res = await server.api('PATCH', '/venues/demo', { token, body: { archived: true } })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).venue.archived, true)

  assert.equal(await server.client('demo').outcome, 'Invalid namespace')
  assert.equal(server.arcade.venues.default().slug, 'annex')
  assert.equal(server.arcade.venues.get('demo'), null)
  // Archived, not deleted: the admin list still shows it, and it can come back.
  const listed = (await (await server.api('GET', '/venues', { token })).json()).venues
  assert.deepEqual(listed.map((v) => [v.slug, v.archived]), [['demo', true], ['annex', false]])

  await server.api('PATCH', '/venues/demo', { token, body: { archived: false } })
  assert.equal(await server.client('demo').outcome, 'connect')
  assert.equal(server.arcade.venues.default().slug, 'demo')
})

/* -------------------------------------------------------- onboarding --- */

test('the first staff account for a new venue is made from admin, and can sign in', async (t) => {
  configured(t)
  const server = await boot(t)
  const token = await server.signIn()
  await server.api('POST', '/venues', { token, body: { slug: 'anchor', name: 'The Anchor' } })

  const weak = await server.api('POST', '/venues/anchor/staff', {
    token,
    body: { name: 'Sam', email: 'sam@example.com', password: 'short' }
  })
  assert.equal(weak.status, 400)
  assert.equal((await weak.json()).error, 'WEAK_PASSWORD')

  const res = await server.api('POST', '/venues/anchor/staff', {
    token,
    body: { name: 'Sam', email: 'Sam@Example.com', password: 'correct horse' }
  })
  assert.equal(res.status, 201)
  const { user } = await res.json()
  assert.equal(user.email, 'sam@example.com')
  assert.equal(user.passwordHash, undefined)

  // The same account the venue's own login route checks.
  const login = await server.staffLogin('anchor', { email: 'sam@example.com', password: 'correct horse' })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).name, 'Sam')

  const row = (await (await server.api('GET', '/venues', { token })).json()).venues.find((v) => v.slug === 'anchor')
  assert.equal(row.staff, 1)

  assert.equal((await server.api('POST', '/venues/nowhere/staff', { token, body: { name: 'x' } })).status, 404)
})

test("a pairing code issued from admin pairs the venue's first tablet", async (t) => {
  configured(t)
  const server = await boot(t)
  const token = await server.signIn()
  await server.api('POST', '/venues', {
    token,
    body: { slug: 'anchor', name: 'The Anchor', requirePairing: true }
  })

  // Pairing is on, so there is no way in without a token.
  assert.equal(await server.client('anchor').outcome, 'Unauthorized')

  const res = await server.api('POST', '/venues/anchor/pair-code', { token })
  assert.equal(res.status, 200)
  const { code, expiresAt } = await res.json()
  assert.match(code, /^\d{6}$/)
  assert.ok(expiresAt > Date.now())

  const paired = await server.pair('anchor', code)
  assert.equal(paired.status, 200)
  const { token: deviceToken } = await paired.json()
  assert.equal(await server.client('anchor', { token: deviceToken }).outcome, 'connect')

  // The code works once.
  assert.equal((await server.pair('anchor', code)).status, 401)

  const row = (await (await server.api('GET', '/venues', { token })).json()).venues.find((v) => v.slug === 'anchor')
  assert.equal(row.devices, 1)
})

test('a venue created from admin is in venues.json for the next boot', async (t) => {
  configured(t)
  const dir = tempDir(t)
  const server = await boot(t, createFileRepos(dir))
  const token = await server.signIn()

  await server.api('POST', '/venues', {
    token,
    body: { slug: 'anchor', name: 'The Anchor', requirePairing: false, botTables: [7] }
  })
  await server.api('PATCH', '/venues/anchor', {
    token,
    body: { name: 'The Anchor Bar', menu: [{ id: 'soju', name: 'Soju', price: 12, icon: 'shot' }] }
  })

  const file = path.join(dir, 'venues.json')
  assert.ok(fs.existsSync(file))

  // A fresh process over the same directory: the venue is simply there.
  const next = createFileRepos(dir)
  const listed = await next.venues.list()
  assert.deepEqual(listed.map((v) => v.slug), ['anchor'])
  assert.equal(listed[0].name, 'The Anchor Bar')
  assert.deepEqual(listed[0].menu, [{ id: 'soju', name: 'Soju', price: 12, icon: 'shot' }])
  assert.deepEqual(listed[0].botTables, [7])
  assert.equal(listed[0].archived, false)

  // And archiving survives too.
  await server.api('PATCH', '/venues/anchor', { token, body: { archived: true } })
  assert.equal((await createFileRepos(dir).venues.list())[0].archived, true)
})
