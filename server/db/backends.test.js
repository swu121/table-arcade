import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRepos, createMemoryRepos } from './index.js'

// One contract, every backend. Memory and file always run; Postgres runs only
// when DATABASE_URL points somewhere, so `npm test` never needs a database.

const DATABASE_URL = process.env.DATABASE_URL
const stamp = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const venue = (slug) => ({
  slug,
  name: 'North',
  menu: [{ id: 'soju', name: 'Soju', price: 12, icon: 'shot' }],
  botTables: [12]
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
