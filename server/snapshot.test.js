import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { init, buildSync } from './handlers.js'
import { createMemoryRepos } from './db/index.js'
import { gracefulShutdown } from './shutdown.js'
import { snapshotRoom, restoreRoom, SNAPSHOT_VERSION } from './snapshot.js'
import { RECONNECT_GRACE } from './state.js'

// A restart is two boots over the same store. Everything the first one had in
// memory — who's seated, what they're playing, what they said — has to be in
// the second one by the time the tablets reconnect.
const VENUES = [{ slug: 'north', name: 'North', botTables: [12, 17] }]

async function boot(repos = createMemoryRepos()) {
  const httpServer = createServer()
  const io = new Server(httpServer)
  const app = init(io, { venues: VENUES, repos })
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    app,
    io,
    httpServer,
    repos,
    client: () => connect(`http://localhost:${port}/venue/north`, { transports: ['websocket'], reconnection: false }),
    close: async (...clients) => {
      for (const client of clients) client.close()
      app.stop()
      io.close()
      await new Promise((resolve) => httpServer.close(resolve))
    }
  }
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve))
const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))

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

function tablet(server) {
  const socket = server.client()
  socket.syncs = inbox(socket, 'state:sync')
  socket.threads = inbox(socket, 'chat:thread')
  socket.restarts = inbox(socket, 'app:restarting')
  return socket
}

async function seat(socket, number) {
  if (!socket.connected) await once(socket, 'connect')
  socket.emit('table:claim', { tableNumber: number })
  socket.emit('table:signIn')
  return socket.syncs.until((sync) => sync.self?.signedIn)
}

const inGame = (sync) => sync.game?.status === 'active'
const discs = (board) => board.flat().filter((cell) => cell !== null).length
// The challenged table (the bot) moves first, so "my turn with n discs down"
// is the moment a human move is accepted.
const myTurn = (me, n) => (sync) => inGame(sync) && sync.game.state.turn === me && discs(sync.game.state.board) >= n

// Everything in a sync that is about the room rather than the socket: out go
// whether the table is bound right now and who else is, and the two deadlines
// that are re-anchored to the new clock on purpose (asserted separately).
function roomFacts(sync) {
  const { taken, lobby, self, game, challenge, ...rest } = sync
  return {
    ...rest,
    self: self && { number: self.number, signedIn: self.signedIn },
    lobby: lobby.map(({ status, ...t }) => t),
    challenge: challenge && { ...challenge, expiresAt: undefined },
    game: game && {
      ...game,
      opponentGone: undefined,
      reconnectDeadline: undefined,
      state: { ...game.state, startsAt: undefined }
    }
  }
}

// A room with one of everything: table 4 signed in with a pending challenge
// out to table 5, table 6 mid-Connect 4 against bot 12, table 7 in a race
// against bot 17, and a message from 5 that 4 hasn't read.
async function busyRoom(server) {
  const four = tablet(server)
  const five = tablet(server)
  const six = tablet(server)
  const seven = tablet(server)
  await seat(four, 4)
  await seat(five, 5)
  await seat(six, 6)
  await seat(seven, 7)

  five.emit('chat:send', { toTable: 4, text: 'you up for one?' })
  await four.syncs.until((sync) => sync.social.unread[5] === 1)

  four.emit('challenge:send', { toTable: 5, item: 'draft', gameType: 'connect4' })
  await five.syncs.until((sync) => sync.challenge?.role === 'to')

  six.emit('challenge:send', { toTable: 12, item: 'wings', gameType: 'connect4' })
  const c4 = await six.syncs.until(myTurn(6, 1))
  six.emit('game:action', { gameId: c4.game.id, column: 3 })
  await six.syncs.until(myTurn(6, 3))

  seven.emit('challenge:send', { toTable: 17, item: 'shot', gameType: 'flappy' })
  await seven.syncs.until(inGame)

  return { four, five, six, seven }
}

test('a room snapshot restores to the same sync, apart from who is connected', async (t) => {
  const repos = createMemoryRepos()
  const first = await boot(repos)
  const tablets = await busyRoom(first)
  const room = first.app.roomFor('north')

  const before = Object.fromEntries([4, 5, 6, 7, 12].map((n) => [n, roomFacts(buildSync(room, room.tables.get(n)))]))
  const now = Date.now()
  const snapshot = snapshotRoom(room, now)
  assert.equal(snapshot.v, SNAPSHOT_VERSION)
  assert.equal(snapshot.challenges.length, 1)
  assert.equal(snapshot.games.length, 2)
  assert.ok(snapshot.challenges[0].expiresIn > 0 && snapshot.challenges[0].expiresIn <= 30_000)
  assert.ok(!('timeoutHandle' in snapshot.challenges[0]))
  assert.ok(snapshot.games.every((g) => !('ctx' in g) && g.state !== undefined))
  assert.ok(snapshot.tables.every((x) => !('socketId' in x)))
  const race = snapshot.games.find((g) => g.type === 'flappy')
  assert.ok('startsIn' in race.state && !('botsRunning' in race.state))

  // Through the store and into a second server, the way a restart does it.
  await repos.snapshots.save('north', JSON.parse(JSON.stringify(snapshot)))
  await first.close(...Object.values(tablets))

  const second = await boot(repos)
  t.after(() => second.close())
  const restored = second.app.roomFor('north')
  await restored.ready

  const after = Object.fromEntries([4, 5, 6, 7, 12].map((n) => [n, roomFacts(buildSync(restored, restored.tables.get(n)))]))
  assert.deepEqual(after, before)
  assert.equal(await repos.snapshots.load('north'), null, 'a snapshot is read once')

  // Unbound, and the reconnect grace is running on the humans in games.
  for (const n of [4, 5, 6, 7]) assert.equal(restored.tables.get(n).socketId, null)
  const c4 = [...restored.games.values()].find((g) => g.type === 'connect4')
  assert.equal(c4.goneTable, 6)
  assert.ok(c4.disconnectDeadline > Date.now() && c4.ctx)
  // The pending challenge has its timer back with what was left of its thirty
  // seconds, and the race's count-in was still running so it moved with the clock.
  const challenge = [...restored.challenges.values()][0]
  assert.ok(challenge.timeoutHandle)
  const wasLeft = snapshot.challenges[0].expiresIn
  assert.ok(wasLeft > 0 && Math.abs(challenge.expiresAt - Date.now() - wasLeft) < 2000)
  const flappy = [...restored.games.values()].find((g) => g.type === 'flappy')
  assert.ok(flappy.state.startsAt > now && flappy.state.startsAt <= Date.now() + 3200)
  assert.equal(flappy.state.botsRunning, true)
})

test('new sockets are held, not refused, once the shutdown begins', async (t) => {
  const server = await boot()
  const four = tablet(server)
  await seat(four, 4)
  await server.app.suspend()
  assert.deepEqual(await four.restarts.next(), { retryIn: 3000 })

  // A refused namespace would fire connect_error and the client would stop
  // trying; a held one just never connects until the sockets are closed.
  const late = server.client()
  const outcome = await Promise.race([
    once(late, 'connect').then(() => 'connected'),
    once(late, 'connect_error').then(() => 'refused'),
    settle(300).then(() => 'held')
  ])
  assert.equal(outcome, 'held')
  await server.close(four, late)
})

test('the room survives a graceful shutdown and the game carries on', async (t) => {
  const repos = createMemoryRepos()
  const first = await boot(repos)
  const four = tablet(first)
  const five = tablet(first)
  await seat(four, 4)
  await seat(five, 5)

  four.emit('challenge:send', { toTable: 12, item: 'wings', gameType: 'connect4' })
  const started = await four.syncs.until(myTurn(4, 1))
  four.emit('game:action', { gameId: started.game.id, column: 3 })
  const played = await four.syncs.until(myTurn(4, 3))
  five.emit('chat:send', { toTable: 4, text: 'go on then' })
  await four.syncs.until((sync) => sync.social.unread[5] === 1)

  // Deploy.
  const lines = []
  let exited = null
  await gracefulShutdown({
    httpServer: first.httpServer,
    io: first.io,
    app: first.app,
    repos,
    log: (line) => lines.push(line),
    exit: (code) => (exited = code)
  })
  assert.equal(exited, 0)
  assert.deepEqual(await four.restarts.next(), { retryIn: 3000 })
  assert.deepEqual(await five.restarts.next(), { retryIn: 3000 })
  for (const socket of [four, five]) if (socket.connected) await once(socket, 'disconnect')
  assert.match(lines[0], /SIGTERM: suspending every room/)
  assert.equal((await repos.snapshots.load('north')).games.length, 1)

  const second = await boot(repos)
  const four2 = tablet(second)
  const five2 = tablet(second)
  t.after(() => second.close(four2, five2))

  // Table 4 comes back to the same game, board and all.
  if (!four2.connected) await once(four2, 'connect')
  four2.emit('table:claim', { tableNumber: 4 })
  const back = await four2.syncs.until(inGame)
  assert.equal(back.game.id, played.game.id)
  assert.deepEqual(back.game.state.board, played.game.state.board)
  assert.equal(back.self.signedIn, true)
  assert.equal(back.self.status, 'playing')
  assert.equal(back.social.unread[5], 1)
  assert.equal(back.game.opponentGone, false, 'the bot was never away')

  // ...and plays on: a move, and the bot answers it.
  four2.emit('game:action', { gameId: back.game.id, column: 2 })
  const later = await four2.syncs.until(myTurn(4, 5))
  assert.equal(later.game.id, played.game.id)

  // Table 5's thread with 4 is intact, and its "returned" entry lands in its history.
  if (!five2.connected) await once(five2, 'connect')
  five2.emit('table:claim', { tableNumber: 5 })
  await five2.syncs.until((sync) => sync.self?.number === 5 && sync.self.signedIn)
  five2.emit('chat:open', { withTable: 4 })
  const thread = await five2.threads.until((payload) => payload.withTable === 4)
  assert.ok(thread.messages.some((m) => m.text === 'go on then'))
  assert.equal(second.app.roomFor('north').tables.get(5).history[0].kind, 'returned')
})

test('a race game is resumed with its bot picking up where it was', async (t) => {
  const repos = createMemoryRepos()
  const first = await boot(repos)
  const seven = tablet(first)
  await seat(seven, 7)
  seven.emit('challenge:send', { toTable: 17, item: 'shot', gameType: 'flappy' })
  const started = await seven.syncs.until(inGame)
  const room = first.app.roomFor('north')
  const game = room.games.get(started.game.id)

  // Fake the bot part-way through its run, well past the count-in.
  game.state.startsAt = Date.now() - 10_000
  game.state.runs[17].score = 3
  const snapshot = snapshotRoom(room)
  assert.equal(snapshot.games[0].state.startsIn, game.state.startsAt - snapshot.takenAt)
  await repos.snapshots.save('north', snapshot)
  await first.close(seven)

  const second = await boot(repos)
  const seven2 = tablet(second)
  t.after(() => second.close(seven2))
  const restored = second.app.roomFor('north')
  await restored.ready
  const resumed = restored.games.get(started.game.id)
  assert.equal(resumed.state.startsAt, game.state.startsAt, 'a run underway keeps its start')
  assert.equal(resumed.state.runs[17].score, 3)

  // The bot's next step is one beat away, not a whole count-in.
  if (!seven2.connected) await once(seven2, 'connect')
  seven2.emit('table:claim', { tableNumber: 7 })
  const moved = await seven2.syncs.until((sync) => inGame(sync) && sync.game.state.opponent.score > 3)
  assert.equal(moved.game.id, started.game.id)
})

test('a stale snapshot, or one from another format, is discarded with a line in the log', async (t) => {
  const repos = createMemoryRepos()
  const first = await boot(repos)
  const four = tablet(first)
  await seat(four, 4)
  const snapshot = snapshotRoom(first.app.roomFor('north'))
  await first.close(four)

  const lines = []
  const log = console.log
  console.log = (line) => lines.push(String(line))
  t.after(() => (console.log = log))

  await repos.snapshots.save('north', { ...snapshot, takenAt: Date.now() - RECONNECT_GRACE - 1000 })
  const second = await boot(repos)
  const room = second.app.roomFor('north')
  await room.ready
  await second.close()
  assert.equal(room.tables.has(4), false)
  assert.match(lines.at(-1), /discarding the one for north — \d+s old/)
  assert.equal(await repos.snapshots.load('north'), null, 'discarded snapshots are cleared too')

  await repos.snapshots.save('north', { ...snapshot, v: SNAPSHOT_VERSION + 1 })
  const third = await boot(repos)
  const again = third.app.roomFor('north')
  await again.ready
  await third.close()
  assert.equal(again.tables.has(4), false)
  assert.match(lines.at(-1), /version 2 is not 1/)

  // And a snapshot for some other venue never lands here.
  const fourth = await boot(repos)
  const other = fourth.app.roomFor('north')
  await other.ready
  assert.equal(restoreRoom(other, { ...snapshot, slug: 'south' }, Date.now(), { log: (l) => lines.push(l) }), false)
  assert.match(lines.at(-1), /taken for south/)
  await fourth.close()
})
