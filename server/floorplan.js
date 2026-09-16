// Session state is deliberately in-memory, but the floor plan is *configuration*
// — an owner drags 24 tables into place once and it must survive a restart.
export const PLAN_UNITS = { width: 1000, height: 700 }

export function defaultPlan() {
  const tables = []
  const push = (number, x, y, shape = 'round', seats = 4) =>
    tables.push({ number, x, y, w: shape === 'round' ? 78 : 104, h: 78, shape, seats })

  // Two-top rail along the left window
  for (let i = 0; i < 5; i++) push(i + 1, 96, 116 + i * 106, 'round', 2)
  // Centre floor, the four-tops
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      push(6 + row * 3 + col, 320 + col * 132, 150 + row * 122, 'round', 4)
    }
  }
  // Back booths
  for (let i = 0; i < 4; i++) push(18 + i, 800, 128 + i * 128, 'rect', 6)

  return {
    ...PLAN_UNITS,
    name: 'Main floor',
    tables,
    fixtures: [
      { id: 'bar', kind: 'bar', label: 'Bar', x: 620, y: 20, w: 300, h: 68 },
      { id: 'kitchen', kind: 'kitchen', label: 'Kitchen', x: 20, y: 20, w: 220, h: 68 },
      { id: 'door', kind: 'door', label: 'Entrance', x: 430, y: 640, w: 150, h: 44 },
      { id: 'restroom', kind: 'restroom', label: 'Restrooms', x: 20, y: 600, w: 150, h: 80 }
    ]
  }
}

// One store per venue, holding the plan the room is using right now. Where it
// lives between restarts is the repository's business: `persist(plan)` is
// called after every save and reset, and `load(raw)` takes back whatever the
// repository kept, validated and clamped exactly like a save.
export function createPlanStore({ persist = null } = {}) {
  let plan = defaultPlan()

  function write() {
    if (!persist) return
    Promise.resolve()
      .then(() => persist(plan))
      .catch((error) => console.warn('floorplan: could not persist —', error.message))
  }

  return {
    get: () => plan,

    load(raw) {
      const cleaned = cleanPlan(raw)
      if (cleaned) plan = cleaned
      return plan
    },

    save(next) {
      const cleaned = cleanPlan(next)
      if (!cleaned) return null
      plan = cleaned
      write()
      return plan
    },

    reset() {
      plan = defaultPlan()
      write()
      return plan
    }
  }
}

export function cleanPlan(next) {
  if (!next || !Array.isArray(next.tables) || !Array.isArray(next.fixtures)) return null

  const seen = new Set()
  const tables = []
  for (const table of next.tables) {
    const number = Number(table?.number)
    if (!Number.isInteger(number) || number < 1 || number > 99 || seen.has(number)) continue
    seen.add(number)
    tables.push({
      number,
      x: clamp(table.x, 0, PLAN_UNITS.width),
      y: clamp(table.y, 0, PLAN_UNITS.height),
      w: clamp(table.w, 40, 300),
      h: clamp(table.h, 40, 300),
      shape: table.shape === 'rect' ? 'rect' : 'round',
      seats: clamp(table.seats, 1, 20)
    })
  }

  const fixtures = next.fixtures.slice(0, 40).map((fixture, i) => ({
    id: String(fixture?.id ?? `fx_${i}`),
    kind: String(fixture?.kind ?? 'wall'),
    label: String(fixture?.label ?? '').slice(0, 24),
    x: clamp(fixture.x, 0, PLAN_UNITS.width),
    y: clamp(fixture.y, 0, PLAN_UNITS.height),
    w: clamp(fixture.w, 20, PLAN_UNITS.width),
    h: clamp(fixture.h, 20, PLAN_UNITS.height)
  }))

  return { ...PLAN_UNITS, name: String(next.name ?? 'Main floor').slice(0, 40), tables, fixtures }
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, Math.round(number)))
}
