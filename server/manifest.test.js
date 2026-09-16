import test from 'node:test'
import assert from 'node:assert/strict'
import { createVenueRegistry } from './venues.js'
import { manifestHandler, venueManifest } from './manifest.js'

const venue = (over = {}) => ({ slug: 'soju-house', name: 'Soju House', ...over })

function fakeRes() {
  const res = {
    code: 200,
    headers: {},
    type: (value) => ((res.contentType = value), res),
    set: (key, value) => ((res.headers[key] = value), res),
    status: (code) => ((res.code = code), res),
    json: (body) => ((res.body = body), res)
  }
  return res
}

test('a venue installs under its own name, at its own address', () => {
  const manifest = venueManifest(venue())
  assert.equal(manifest.name, 'Soju House')
  assert.equal(manifest.start_url, '/v/soju-house')
  // What tells two installed venues apart on one deployment.
  assert.equal(manifest.id, '/v/soju-house')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'fullscreen')
  assert.equal(manifest.orientation, 'landscape')
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ['192x192', '512x512', '512x512']
  )
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'))
})

test('the staff screen is a separate app from the tablet', () => {
  const tablet = venueManifest(venue())
  const staff = venueManifest(venue(), { staff: true })
  assert.equal(staff.name, 'Soju House Staff')
  assert.equal(staff.start_url, '/v/soju-house/staff')
  assert.notEqual(staff.id, tablet.id, 'installing both leaves two icons, not one')
  // And two icons a person can tell apart on the same home screen.
  assert.equal(tablet.short_name, 'Soju House')
  assert.equal(staff.short_name, 'Soju Staff')
})

test('a long name is cut to what fits under an icon', () => {
  const long = venue({ name: 'The Very Long Bar And Grill' })
  const manifest = venueManifest(long)
  assert.equal(manifest.name, 'The Very Long Bar And Grill', 'the full name still labels the app')
  assert.ok(manifest.short_name.length <= 12)
  assert.equal(manifest.short_name, 'The Very Lon')
  assert.equal(manifest.short_name.trim(), manifest.short_name, 'never ends mid-space')

  // A first word that leaves no room says the one thing that matters.
  assert.equal(venueManifest(venue({ name: 'Bartholomews' }), { staff: true }).short_name, 'Staff')
  assert.equal(venueManifest(long, { staff: true }).short_name, 'The Staff')
})

test('the handler serves the venue named in the URL, and nothing else', () => {
  const venues = createVenueRegistry([
    { slug: 'north', name: 'North', archived: false },
    { slug: 'closed', name: 'Closed Down', archived: true }
  ])
  const handler = manifestHandler({ venues })

  const found = fakeRes()
  handler({ params: { slug: 'north' } }, found)
  assert.equal(found.code, 200)
  assert.equal(found.contentType, 'application/manifest+json')
  assert.equal(found.headers['Cache-Control'], 'no-cache')
  assert.equal(found.body.start_url, '/v/north')

  const missing = fakeRes()
  handler({ params: { slug: 'nowhere' } }, missing)
  assert.equal(missing.code, 404)

  // An archived venue is gone from the floor, so it is gone from here too.
  const archived = fakeRes()
  handler({ params: { slug: 'closed' } }, archived)
  assert.equal(archived.code, 404)
})
