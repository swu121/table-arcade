import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRepos, createMemoryRepos } from './index.js'
import { hashToken } from './devices.js'

// One contract, every backend. Memory and file always run; Postgres runs only
// when DATABASE_URL points somewhere, so `npm test` never needs a database.

const DATABASE_URL = process.env.DATABASE_URL
const stamp = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const venue = (slug) => ({
  slug,
  name: 'North',
  menu: [{ id: 'soju', name: 'Soju', price: 12, icon: 'shot' }],
  botTables: [12],
  requirePairing: false
})

const PLAN = {
  width: 1000,
  height: 700,
  name: 'Patio',
  tables: [{ number: 4, x: 10, y: 20, w: 78, h: 78, shape: 'round', seats: 2 }],
  fixtures: [{ id: 'bar', kind: 'bar', label: 'Bar', x: 0, y: 0, w: 100, h: 40 }]
}

const CREATED_AT = Date.now() - 1000

const ticket = (id, owingTable, owedToTable, reason = 'gift') => ({
  id,
  item: { id: 'soju', name: 'Soju', price: 12, icon: 'shot' },
  owingTable,
  owedToTable,
  status: 'pending',
  createdAt: CREATED_AT,
  gameId: reason === 'gift' ? null : 'g_1',
  gameName: reason === 'gift' ? null : 'Connect 4',
  reason
})

function contract(name, open, { skip = false } = {}) {
  test(`${name}: venues round-trip and upsert in place`, { skip }, async (t) => {
    const repos = await open(t)
    const slug = stamp()
    await repos.venues.upsert(venue(slug))
    assert.deepEqual((await repos.venues.list()).find((v) => v.slug === slug), venue(slug))

    await repos.venues.upsert({ ...venue(slug), name: 'North Side' })
    const listed = (await repos.venues.list()).filter((v) => v.slug === slug)
    assert.equal(listed.length, 1)
    assert.equal(listed[0].name, 'North Side')
  })

  test(`${name}: a floor plan is null until saved, then comes back as saved`, { skip }, async (t) => {
    const repos = await open(t)
    const slug = stamp()
    await repos.venues.upsert(venue(slug))
    assert.equal(await repos.floorplans.get(slug), null)
    await repos.floorplans.save(slug, PLAN)
    assert.deepEqual(await repos.floorplans.get(slug), PLAN)
    await repos.floorplans.save(slug, { ...PLAN, name: 'Roof' })
    assert.equal((await repos.floorplans.get(slug)).name, 'Roof')
  })

  test(`${name}: tickets open, deliver, clear, and stay inside their venue`, { skip }, async (t) => {
    const repos = await open(t)
    const north = stamp()
    const south = stamp()
    await repos.venues.upsert(venue(north))
    await repos.venues.upsert(venue(south))

    await repos.tickets.create(north, ticket('tk_1', 4, 12))
    await repos.tickets.create(north, ticket('tk_2', 7, 4, 'quit'))
    await repos.tickets.create(south, ticket('tk_3', 4, 20))

    const pending = await repos.tickets.openFor(north)
    assert.deepEqual(pending.map((x) => x.id).sort(), ['tk_1', 'tk_2'])
    // The room gets tickets back in the shape it stored them.
    assert.deepEqual(pending.find((x) => x.id === 'tk_2'), ticket('tk_2', 7, 4, 'quit'))
    assert.equal(pending.find((x) => x.id === 'tk_1').status, 'pending')

    await repos.tickets.deliver(north, 'tk_1', Date.now())
    assert.deepEqual((await repos.tickets.openFor(north)).map((x) => x.id), ['tk_2'])
    // Delivering an unknown ticket is a no-op, not an error.
    await repos.tickets.deliver(north, 'tk_404')

    // Table 4 is cleared in north: its ticket goes, south's table 4 keeps theirs.
    await repos.tickets.clearFor(north, 4)
    assert.deepEqual(await repos.tickets.openFor(north), [])
    assert.deepEqual((await repos.tickets.openFor(south)).map((x) => x.id), ['tk_3'])
  })

  test(`${name}: devices are issued once in plaintext, found by hash, listed per venue, revoked and touched`, { skip }, async (t) => {
    const repos = await open(t)
    const north = stamp()
    const south = stamp()
    await repos.venues.upsert(venue(north))
    await repos.venues.upsert(venue(south))

    const issued = await repos.devices.issue({ venue: north, label: '  Bar left  ' })
    assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(issued.venue, north)
    assert.equal(issued.label, 'Bar left')
    assert.equal(issued.revokedAt, null)
    assert.equal(issued.lastSeenAt, null)
    const other = await repos.devices.issue({ venue: south })
    assert.equal(other.label, 'Tablet')
    assert.notEqual(other.token, issued.token)

    // Only the hash is stored: the plaintext token is never a lookup key.
    assert.equal(await repos.devices.find(issued.token), null)
    const found = await repos.devices.find(hashToken(issued.token))
    assert.equal(found.id, issued.id)
    assert.equal(found.venue, north)
    assert.equal('token' in found, false)
    assert.equal(await repos.devices.find(hashToken('nope')), null)

    assert.deepEqual((await repos.devices.list(north)).map((d) => d.id), [issued.id])
    assert.deepEqual((await repos.devices.list(south)).map((d) => d.id), [other.id])

    const at = Date.now() - 5000
    await repos.devices.touch(issued.id, at)
    assert.equal((await repos.devices.find(hashToken(issued.token))).lastSeenAt, at)

    assert.equal(await repos.devices.revoke(issued.id), true)
    assert.equal(await repos.devices.revoke(issued.id), false)
    assert.equal(await repos.devices.revoke('d_missing'), false)
    // A revoked device is still findable, so the handshake can say why.
    assert.ok((await repos.devices.find(hashToken(issued.token))).revokedAt > 0)
    assert.deepEqual(await repos.devices.list(north), [])
    assert.deepEqual((await repos.devices.list(south)).map((d) => d.id), [other.id])
  })

  test(`${name}: a room snapshot is null until saved, comes back whole, and clears`, { skip }, async (t) => {
    const repos = await open(t)
    const slug = stamp()
    await repos.venues.upsert(venue(slug))
    assert.equal(await repos.snapshots.load(slug), null)

    const snapshot = {
      v: 1,
      slug,
      takenAt: Date.now(),
      tables: [{ number: 4, signedIn: true, history: [], notifications: [], unread: { 5: 1 } }],
      challenges: [{ id: 'ch_1', from: 4, to: 5, expiresIn: 12_000 }],
      games: [{ id: 'g_1', type: 'connect4', players: [6, 12], state: { board: [[null, 6]] } }],
      threads: [{ key: '4-5', messages: [{ id: 'm_1', from: 5, to: 4, text: 'hey', at: 1 }], readAt: { 5: 1 } }],
      tickets: []
    }
    await repos.snapshots.save(slug, snapshot)
    assert.deepEqual(await repos.snapshots.load(slug), snapshot)

    // Saving again replaces, never accumulates.
    await repos.snapshots.save(slug, { ...snapshot, games: [] })
    assert.deepEqual((await repos.snapshots.load(slug)).games, [])

    await repos.snapshots.clear(slug)
    assert.equal(await repos.snapshots.load(slug), null)
    // Clearing what isn't there is fine.
    await repos.snapshots.clear(slug)
  })
}

contract('memory', async (t) => {
  const repos = createMemoryRepos()
  t.after(() => repos.close())
  return repos
})

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'table-arcade-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

contract('file', async (t) => {
  const repos = createFileRepos(tempDir(t))
  t.after(() => repos.close())
  return repos
})

test('file: venues and floor plans are on disk where the server has always kept them', async (t) => {
  const dir = tempDir(t)
  const first = createFileRepos(dir)
  assert.deepEqual(await first.venues.list(), [])
  await first.venues.upsert(venue('north'))
  await first.floorplans.save('north', PLAN)
  await first.tickets.create('north', ticket('tk_1', 4, 12))

  assert.ok(fs.existsSync(path.join(dir, 'venues.json')))
  assert.ok(fs.existsSync(path.join(dir, 'venues', 'north', 'floorplan.json')))

  // A fresh process over the same directory sees the venue and the plan...
  const second = createFileRepos(dir)
  assert.deepEqual(await second.venues.list(), [venue('north')])
  assert.deepEqual(await second.floorplans.get('north'), PLAN)
  // ...and not the ticket: without a database, tickets last as long as the process.
  assert.deepEqual(await second.tickets.openFor('north'), [])
})

test('file: devices live in venues/<slug>/devices.json, hashed, and outlive the process', async (t) => {
  const dir = tempDir(t)
  const first = createFileRepos(dir)
  const issued = await first.devices.issue({ venue: 'north', label: 'Patio' })

  const file = path.join(dir, 'venues', 'north', 'devices.json')
  assert.ok(fs.existsSync(file))
  const onDisk = fs.readFileSync(file, 'utf8')
  assert.ok(!onDisk.includes(issued.token), 'the plaintext token is never written')
  assert.ok(onDisk.includes(hashToken(issued.token)))

  const second = createFileRepos(dir)
  assert.equal((await second.devices.find(hashToken(issued.token))).id, issued.id)
  assert.deepEqual((await second.devices.list('north')).map((d) => d.label), ['Patio'])
})

test('file: a hand-edited venues.json still normalises', async (t) => {
  const dir = tempDir(t)
  fs.writeFileSync(
    path.join(dir, 'venues.json'),
    JSON.stringify([{ slug: 'Demo' }, { slug: 'bad slug!' }, { slug: 'demo' }, { slug: 'soju', botTables: ['3', 900] }])
  )
  const listed = await createFileRepos(dir).venues.list()
  assert.deepEqual(listed.map((v) => v.slug), ['demo', 'soju'])
  assert.equal(listed[0].menu.length, 8)
  assert.deepEqual(listed[1].botTables, [3])
})

contract(
  'postgres',
  async (t) => {
    const { createPostgresRepos } = await import('./postgres.js')
    const repos = await createPostgresRepos(DATABASE_URL)
    t.after(async () => {
      // Everything a test made hangs off a stamped venue; cascades take the rest.
      await repos.pool.query(`DELETE FROM venues WHERE slug LIKE 't-%'`)
      await repos.close()
    })
    return repos
  },
  { skip: DATABASE_URL ? false : 'DATABASE_URL is not set' }
)
