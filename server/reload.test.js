import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { init, reportClientError } from './handlers.js'

const VENUES = [{ slug: 'north', name: 'North', botTables: [12] }]

async function boot(version = 'dev') {
  const httpServer = createServer()
  const io = new Server(httpServer)
  const app = init(io, { venues: VENUES, version })
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    app,
    client: (auth = {}) => connect(`http://localhost:${port}/venue/north`, { transports: ['websocket'], auth }),
    close: async (...clients) => {
      for (const client of clients) client.close()
      app.stop()
      io.close()
      await new Promise((resolve) => httpServer.close(resolve))
    }
  }
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve))
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

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

function tablet(server, auth) {
  const socket = server.client(auth)
  socket.syncs = inbox(socket, 'state:sync')
  socket.reloads = inbox(socket, 'app:reload')
  socket.staff = inbox(socket, 'staff:sync')
  return socket
}

async function seat(socket, number) {
  if (!socket.connected) await once(socket, 'connect')
  socket.emit('table:claim', { tableNumber: number })
  socket.emit('table:signIn')
  return socket.syncs.until((sync) => sync.self?.signedIn)
}

test('a tablet from an older build is asked to reload, gently', async (t) => {
  const server = await boot('b2')
  const stale = tablet(server, { version: 'b1' })
  const fresh = tablet(server, { version: 'b2' })
  t.after(() => server.close(stale, fresh))

  const ask = await stale.reloads.next()
  assert.deepEqual(ask, { reason: 'version', urgent: false })

  await once(fresh, 'connect')
  await settle()
  assert.equal(fresh.reloads.size(), 0)
})

test('a dev server never asks anyone to reload', async (t) => {
  const server = await boot('dev')
  const socket = tablet(server, { version: 'whatever' })
  t.after(() => server.close(socket))
  await once(socket, 'connect')
  await settle()
  assert.equal(socket.reloads.size(), 0)
})

test('staff can restart one tablet now, or every tablet when idle', async (t) => {
  const server = await boot()
  const a = tablet(server)
  const b = tablet(server)
  const staff = tablet(server, { staff: 'dev' })
  t.after(() => server.close(a, b, staff))
  await seat(a, 4)
  await seat(b, 5)
  if (!staff.connected) await once(staff, 'connect')
  staff.emit('staff:join')
  await staff.staff.next()

  staff.emit('staff:reloadTable', { number: 4 })
  assert.deepEqual(await a.reloads.next(), { reason: 'staff', urgent: true })
  await settle()
  assert.equal(b.reloads.size(), 0)

  const synced = await staff.staff.next()
  const four = synced.floor.find((row) => row.number === 4)
  assert.equal(four.history[0].kind, 'reload')

  staff.emit('staff:reloadAll')
  assert.deepEqual(await a.reloads.next(), { reason: 'staff', urgent: false })
  assert.deepEqual(await b.reloads.next(), { reason: 'staff', urgent: false })
  await settle()
  assert.equal(staff.reloads.size(), 0, 'the staff screen that pressed it stays put')
})

test('a crash report lands in the table’s activity for staff', async (t) => {
  const server = await boot()
  const a = tablet(server)
  const staff = tablet(server, { staff: 'dev' })
  t.after(() => server.close(a, staff))
  await seat(a, 7)
  if (!staff.connected) await once(staff, 'connect')
  staff.emit('staff:join')
  await staff.staff.next()

  const room = server.app.roomFor('north')
  const warn = console.warn
  const lines = []
  console.warn = (line) => lines.push(String(line))
  t.after(() => (console.warn = warn))

  const entry = reportClientError(room, {
    table: 7,
    kind: 'render',
    message: 'x'.repeat(400),
    stack: 'Error: boom\n  at Board',
    version: 'b1'
  })
  assert.equal(entry.table, 7)
  assert.equal(entry.message.length, 300)
  assert.match(lines[0], /client-error north table 7 render/)

  const synced = await staff.staff.next()
  const seven = synced.floor.find((row) => row.number === 7)
  assert.equal(seven.history[0].kind, 'crash')
  assert.equal(seven.history[0].errorKind, 'render')

  // A report from a table nobody holds is logged but changes nothing.
  const before = staff.staff.size()
  reportClientError(room, { table: 99, message: 'lost' })
  await settle()
  assert.equal(staff.staff.size(), before)
})
