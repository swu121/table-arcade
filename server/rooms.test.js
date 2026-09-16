import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { init } from './handlers.js'
import { createMemoryRepos } from './db/index.js'

// Two restaurants on one server. Table 4 exists in both, and neither can see,
// message or challenge the other's.
const VENUES = [
  { slug: 'north', name: 'North', botTables: [12] },
  { slug: 'south', name: 'South', botTables: [20], menu: [{ id: 'soju', name: 'Soju', price: 12 }] }
]

// `repos` is the durable store; passing the same one to two boots is a restart.
async function boot(repos = createMemoryRepos()) {
  const httpServer = createServer()
  const io = new Server(httpServer)
  const app = init(io, { venues: VENUES, repos })
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    app,
    client: (slug, auth = {}) => connect(`http://localhost:${port}/venue/${slug}`, { transports: ['websocket'], auth }),
    close: async (...clients) => {
      for (const client of clients) client.close()
      app.stop()
      io.close()
      await new Promise((resolve) => httpServer.close(resolve))
    }
  }
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve))

// Events can land two to a frame, so a listener attached between them misses
// one. Buffer everything from the moment the socket is made.
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

function tablet(server, slug) {
  const socket = server.client(slug)
  socket.syncs = inbox(socket, 'state:sync')
  socket.errors = inbox(socket, 'app:error')
  return socket
}

// A staff screen, in through the dev door: no staff users exist in these
// rooms, and the tests do not run in production (see staff.test.js for the
// real login).
function staffScreen(server, slug) {
  const socket = server.client(slug, { staff: 'dev' })
  socket.staff = inbox(socket, 'staff:sync')
  return socket
}

async function seat(socket, number) {
  if (!socket.connected) await once(socket, 'connect')
  socket.emit('table:claim', { tableNumber: number })
  socket.emit('table:signIn')
  return socket.syncs.until((sync) => sync.self?.signedIn)
}

test('venues are separate rooms with their own menus and bots', async (t) => {
  const server = await boot()
  const north = tablet(server, 'north')
  const south = tablet(server, 'south')
  t.after(() => server.close(north, south))
  const n = await seat(north, 4)
  const s = await seat(south, 4)

  assert.equal(n.venue.slug, 'north')
  assert.equal(s.venue.slug, 'south')
  assert.deepEqual(n.lobby.map((t) => t.number), [12])
  assert.deepEqual(s.lobby.map((t) => t.number), [20])
  assert.equal(n.menu.length, 8)
  assert.deepEqual(s.menu.map((m) => m.id), ['soju'])
})

test('a table cannot reach a table in another venue', async (t) => {
  const server = await boot()
  const north = tablet(server, 'north')
  const south = tablet(server, 'south')
  t.after(() => server.close(north, south))
  await seat(north, 4)
  await seat(south, 7)

  // South's table 7 is signed in, but north's table 4 asking for "table 7"
  // resolves inside north, where nobody is sitting there.
  north.emit('challenge:send', { toTable: 7, item: 'draft', gameType: 'connect4' })
  assert.equal((await north.errors.next()).code, 'NO_TABLE')

  north.emit('chat:send', { toTable: 7, text: 'hello?' })
  assert.equal((await north.errors.next()).code, 'NO_TABLE')
})

test('tickets and staff sync stay inside their venue', async (t) => {
  const server = await boot()
  const north = tablet(server, 'north')
  const south = tablet(server, 'south')
  const northStaff = staffScreen(server, 'north')
  const southStaff = staffScreen(server, 'south')
  t.after(() => server.close(north, south, northStaff, southStaff))
  await seat(north, 4)
  await seat(south, 4)
  await Promise.all([northStaff, southStaff].map((s) => (s.connected ? null : once(s, 'connect'))))
  northStaff.emit('staff:join')
  southStaff.emit('staff:join')
  await Promise.all([northStaff.staff.next(), southStaff.staff.next()])

  // A gift to the bot in north lands as a ticket in north only.
  north.emit('gift:send', { toTable: 12, item: 'draft' })
  const payload = await northStaff.staff.until((p) => p.tickets.length > 0)
  assert.equal(payload.venue.slug, 'north')
  assert.equal(payload.tickets[0].owingTable, 4)
  assert.equal(payload.tickets[0].owedToTable, 12)

  // South's staff screen, asked again after the fact, still has nothing.
  southStaff.emit('staff:join')
  const southPayload = await southStaff.staff.next()
  assert.equal(southPayload.venue.slug, 'south')
  assert.equal(southPayload.tickets.length, 0)
})

const PLAN = {
  width: 1000,
  height: 700,
  name: 'Patio',
  tables: [
    { number: 4, x: 10, y: 20, w: 78, h: 78, shape: 'round', seats: 2 },
    { number: 12, x: 200, y: 20, w: 78, h: 78, shape: 'round', seats: 4 }
  ],
  fixtures: []
}

const stored = (id, owingTable, owedToTable) => ({
  id,
  item: { id: 'draft', name: 'Draft Beer', price: 7, icon: 'beer' },
  owingTable,
  owedToTable,
  status: 'pending',
  createdAt: Date.now() - 60_000,
  gameId: null,
  gameName: null,
  reason: 'gift'
})

test('a room is created with the floor plan and open tickets the store kept', async (t) => {
  const repos = createMemoryRepos()
  await repos.floorplans.save('north', PLAN)
  await repos.tickets.create('north', stored('tk_old', 4, 12))
  await repos.tickets.create('north', { ...stored('tk_done', 4, 12), status: 'delivered', deliveredAt: Date.now() })
  await repos.tickets.create('south', stored('tk_south', 4, 20))

  const server = await boot(repos)
  const guest = tablet(server, 'north')
  const staff = staffScreen(server, 'north')
  t.after(() => server.close(guest, staff))

  // The very first tablet in already sees the saved room, not the default.
  const sync = await seat(guest, 4)
  assert.equal(sync.floorplan.name, 'Patio')
  assert.deepEqual(sync.floorplan.tables.map((x) => x.number), [4, 12])

  if (!staff.connected) await once(staff, 'connect')
  staff.emit('staff:join')
  const board = await staff.staff.next()
  assert.deepEqual(board.tickets.map((x) => x.id), ['tk_old'])
  assert.equal(board.tickets[0].status, 'pending')
  assert.equal(board.tickets[0].owingTable, 4)
  assert.equal(board.floorplan.name, 'Patio')
})

test('tickets and plan edits made tonight are still there after a restart', async (t) => {
  const repos = createMemoryRepos()

  // Night one: a gift, and staff lay out the patio.
  const first = await boot(repos)
  const guest = tablet(first, 'north')
  const staff = staffScreen(first, 'north')
  await seat(guest, 4)
  if (!staff.connected) await once(staff, 'connect')
  staff.emit('staff:join')
  await staff.staff.next()
  guest.emit('gift:send', { toTable: 12, item: 'draft' })
  const withTicket = await staff.staff.until((p) => p.tickets.length > 0)
  const ticketId = withTicket.tickets[0].id
  staff.emit('staff:savePlan', { plan: PLAN })
  await staff.staff.until((p) => p.floorplan.name === 'Patio')
  await first.close(guest, staff)

  // Deploy. A new server over the same store has the ticket and the plan.
  const second = await boot(repos)
  const staff2 = staffScreen(second, 'north')
  if (!staff2.connected) await once(staff2, 'connect')
  staff2.emit('staff:join')
  const board = await staff2.staff.next()
  assert.deepEqual(board.tickets.map((x) => x.id), [ticketId])
  assert.equal(board.tickets[0].owedToTable, 12)
  assert.equal(board.floorplan.name, 'Patio')

  staff2.emit('staff:deliver', { ticketId })
  await staff2.staff.until((p) => p.tickets[0].status === 'delivered')
  await second.close(staff2)

  // And delivering it was remembered too: the third boot has nothing open.
  assert.deepEqual(await repos.tickets.openFor('north'), [])
  const third = await boot(repos)
  const staff3 = staffScreen(third, 'north')
  t.after(() => third.close(staff3))
  if (!staff3.connected) await once(staff3, 'connect')
  staff3.emit('staff:join')
  assert.deepEqual((await staff3.staff.next()).tickets, [])
})

test('clearing a table drops its tickets from the store as well as the board', async (t) => {
  const repos = createMemoryRepos()
  await repos.tickets.create('north', stored('tk_a', 4, 12))
  await repos.tickets.create('north', stored('tk_b', 7, 12))
  const server = await boot(repos)
  const staff = staffScreen(server, 'north')
  t.after(() => server.close(staff))
  if (!staff.connected) await once(staff, 'connect')
  staff.emit('staff:join')
  await staff.staff.next()

  staff.emit('staff:clearTable', { number: 12 })
  await staff.staff.until((p) => p.tickets.length === 0)
  // The write-through is fire-and-forget; give it a turn of the loop.
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(await repos.tickets.openFor('north'), [])
})

test('an unknown venue is refused at the namespace', async (t) => {
  const server = await boot()
  const client = server.client('nowhere')
  t.after(() => server.close(client))
  const error = await once(client, 'connect_error')
  assert.equal(error.message, 'Invalid namespace')
})

// A room can exist before anyone connects to it — a startup rehydrate, a crash
// report over HTTP — and the sockets that arrive later must still be handled.
test('a room made before its first socket still answers', async (t) => {
  const server = await boot()
  const room = server.app.roomFor('north')
  assert.ok(room)
  const north = tablet(server, 'north')
  t.after(() => server.close(north))
  const sync = await seat(north, 4)
  assert.equal(sync.self.number, 4)
  assert.equal(sync.venue.slug, 'north')
})
