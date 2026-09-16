import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { init } from './handlers.js'

// Two restaurants on one server. Table 4 exists in both, and neither can see,
// message or challenge the other's.
const VENUES = [
  { slug: 'north', name: 'North', botTables: [12] },
  { slug: 'south', name: 'South', botTables: [20], menu: [{ id: 'soju', name: 'Soju', price: 12 }] }
]

async function boot() {
  const httpServer = createServer()
  const io = new Server(httpServer)
  const app = init(io, { venues: VENUES })
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    client: (slug) => connect(`http://localhost:${port}/venue/${slug}`, { transports: ['websocket'] }),
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
  const northStaff = tablet(server, 'north')
  const southStaff = tablet(server, 'south')
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

test('an unknown venue is refused at the namespace', async (t) => {
  const server = await boot()
  const client = server.client('nowhere')
  t.after(() => server.close(client))
  const error = await once(client, 'connect_error')
  assert.equal(error.message, 'Invalid namespace')
})
