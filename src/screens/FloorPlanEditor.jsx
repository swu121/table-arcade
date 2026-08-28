import { useEffect, useMemo, useRef, useState } from 'react'
import { socket } from '../socket.js'
import { FloorPlan } from '../components/FloorPlan.jsx'

const GRID = 10
const KINDS = [
  { kind: 'bar', label: 'Bar', w: 300, h: 68 },
  { kind: 'kitchen', label: 'Kitchen', w: 220, h: 68 },
  { kind: 'door', label: 'Entrance', w: 150, h: 44 },
  { kind: 'restroom', label: 'Restrooms', w: 150, h: 80 },
  { kind: 'wall', label: '', w: 240, h: 16 }
]

const snap = (value) => Math.round(value / GRID) * GRID
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function normalise(plan) {
  return {
    width: plan?.width || 1000,
    height: plan?.height || 700,
    name: plan?.name ?? 'Main floor',
    tables: (plan?.tables ?? []).map((t) => ({ ...t })),
    fixtures: (plan?.fixtures ?? []).map((f) => ({ ...f }))
  }
}

function nextFreeNumber(tables) {
  const taken = new Set(tables.map((t) => t.number))
  for (let n = 1; n <= 99; n++) if (!taken.has(n)) return n
  return null
}

function freeSpot(plan, w, h) {
  // Drop new items on the first grid slot that isn't already occupied, so a
  // burst of "Add table" clicks doesn't pile everything on one square.
  const boxes = [...plan.tables, ...plan.fixtures]
  for (let y = 40; y + h <= plan.height - 20; y += 40) {
    for (let x = 40; x + w <= plan.width - 20; x += 40) {
      const clash = boxes.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y)
      if (!clash) return { x: snap(x), y: snap(y) }
    }
  }
  return { x: 40, y: 40 }
}

function Section({ title, children }) {
  return (
    <div className="panel p-3">
      <div className="overline mb-2.5">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-dim">{label}</span>
      {children}
    </label>
  )
}

export function FloorPlanEditor({ floorplan }) {
  const [plan, setPlan] = useState(() => normalise(floorplan))
  const [dirty, setDirty] = useState(false)
  const [selection, setSelection] = useState(null)
  const [numberDraft, setNumberDraft] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const svgRef = useRef(null)
  const drag = useRef(null)
  // A save/reset we asked for: the next plan the server pushes is the truth,
  // so adopt it even though we are still marked dirty.
  const awaiting = useRef(false)

  useEffect(() => {
    if (!floorplan) return
    if (awaiting.current) {
      awaiting.current = false
      setPlan(normalise(floorplan))
      setDirty(false)
      setSelection(null)
      return
    }
    if (dirty) return
    setPlan(normalise(floorplan))
  }, [floorplan, dirty])

  const selectedTable = selection?.type === 'table' ? plan.tables.find((t) => t.number === selection.key) : null
  const selectedFixture = selection?.type === 'fixture' ? plan.fixtures.find((f) => f.id === selection.key) : null

  useEffect(() => {
    setNumberDraft(selectedTable ? String(selectedTable.number) : '')
    setError('')
  }, [selection?.key, selection?.type, selectedTable?.number])

  const duplicates = useMemo(() => {
    const seen = new Set()
    const dupes = new Set()
    for (const t of plan.tables) {
      if (seen.has(t.number)) dupes.add(t.number)
      seen.add(t.number)
    }
    return dupes
  }, [plan.tables])

  const edit = (updater) => {
    setPlan((current) => updater(current))
    setDirty(true)
  }

  /* ------------------------------------------------------------- dragging */

  const beginDrag = (event, type, item) => {
    if (event.button != null && event.button > 0) return
    const svg = svgRef.current
    if (!svg) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const matrix = svg.getScreenCTM()
    if (!matrix) return
    const inverse = matrix.inverse()
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)

    drag.current = {
      type,
      key: type === 'table' ? item.number : item.id,
      offsetX: point.x - item.x,
      offsetY: point.y - item.y,
      startX: item.x,
      startY: item.y,
      w: item.w,
      h: item.h,
      inverse,
      capture: event.currentTarget,
      pointerId: event.pointerId,
      moved: false
    }
    setSelection({ type, key: type === 'table' ? item.number : item.id })
  }

  const onPointerMove = (event) => {
    const state = drag.current
    if (!state) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(state.inverse)
    const rawX = point.x - state.offsetX
    const rawY = point.y - state.offsetY

    // Decided here rather than inside the updater below: React runs updaters
    // during render, so a flick whose last move and pointerup land in the same
    // task would reach endDrag with moved still false and silently lose the edit.
    const targetX = clamp(snap(rawX), 0, plan.width - state.w)
    const targetY = clamp(snap(rawY), 0, plan.height - state.h)
    if (targetX !== state.startX || targetY !== state.startY) state.moved = true

    setPlan((current) => {
      let changed = false
      const move = (item) => {
        const x = clamp(snap(rawX), 0, current.width - item.w)
        const y = clamp(snap(rawY), 0, current.height - item.h)
        if (x === item.x && y === item.y) return item
        changed = true
        return { ...item, x, y }
      }

      const next =
        state.type === 'table'
          ? { ...current, tables: current.tables.map((t) => (t.number === state.key ? move(t) : t)) }
          : { ...current, fixtures: current.fixtures.map((f) => (f.id === state.key ? move(f) : f)) }

      return changed ? next : current
    })
  }

  const endDrag = () => {
    const state = drag.current
    if (!state) return
    drag.current = null
    if (state.capture?.hasPointerCapture?.(state.pointerId)) {
      state.capture.releasePointerCapture(state.pointerId)
    }
    if (state.moved) setDirty(true)
  }

  /* --------------------------------------------------------------- edits */

  const addTable = () => {
    const number = nextFreeNumber(plan.tables)
    if (number == null) return setError('All 99 table numbers are in use.')
    const spot = freeSpot(plan, 78, 78)
    edit((current) => ({
      ...current,
      tables: [...current.tables, { number, x: spot.x, y: spot.y, w: 78, h: 78, shape: 'round', seats: 4 }]
    }))
    setSelection({ type: 'table', key: number })
  }

  const addFixture = (spec) => {
    const id = `fx_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const spot = freeSpot(plan, spec.w, spec.h)
    edit((current) => ({
      ...current,
      fixtures: [...current.fixtures, { id, kind: spec.kind, label: spec.label, ...spot, w: spec.w, h: spec.h }]
    }))
    setSelection({ type: 'fixture', key: id })
  }

  const deleteSelected = () => {
    if (!selection) return
    edit((current) =>
      selection.type === 'table'
        ? { ...current, tables: current.tables.filter((t) => t.number !== selection.key) }
        : { ...current, fixtures: current.fixtures.filter((f) => f.id !== selection.key) }
    )
    setSelection(null)
  }

  const patchTable = (number, patch) =>
    edit((current) => ({
      ...current,
      tables: current.tables.map((t) => (t.number === number ? { ...t, ...patch } : t))
    }))

  const patchFixture = (id, patch) =>
    edit((current) => ({
      ...current,
      fixtures: current.fixtures.map((f) => (f.id === id ? { ...f, ...patch } : f))
    }))

  const checkNumber = (raw) => {
    if (!selectedTable) return null
    const value = Number(raw.trim())
    if (raw.trim() === '' || !Number.isInteger(value) || value < 1 || value > 99) {
      return { error: 'Table numbers are whole numbers from 1 to 99.' }
    }
    if (value !== selectedTable.number && plan.tables.some((t) => t.number === value)) {
      return { error: `Table ${value} is already on the plan.` }
    }
    return { value }
  }

  // Committed on blur/Enter, not per keystroke — otherwise typing "14" would
  // rename the table to 1 on the way through.
  const commitNumber = () => {
    const result = checkNumber(numberDraft)
    if (!result) return
    if (result.error) {
      setNumberDraft(String(selectedTable.number))
      return setError('')
    }
    setError('')
    if (result.value === selectedTable.number) return
    patchTable(selectedTable.number, { number: result.value })
    setSelection({ type: 'table', key: result.value })
  }

  const setShape = (shape) => {
    if (!selectedTable) return
    const h = selectedTable.h
    patchTable(selectedTable.number, {
      shape,
      w: clamp(shape === 'rect' ? Math.round(h * 1.35) : h, 40, 300)
    })
  }

  const resize = (item, type, axis, delta) => {
    const table = type === 'table'
    const min = table ? 40 : 20
    const max = table ? 300 : axis === 'w' ? plan.width : plan.height
    // A round table keeps w === h, so it has to fit inside whichever edge is nearer.
    const room =
      table && item.shape !== 'rect'
        ? Math.min(plan.width - item.x, plan.height - item.y)
        : axis === 'w'
          ? plan.width - item.x
          : plan.height - item.y

    const value = Math.min(clamp((item[axis] ?? 0) + delta, min, max), room)
    if (!table) return patchFixture(item.id, { [axis]: value })
    patchTable(item.number, item.shape === 'rect' ? { [axis]: value } : { w: value, h: value })
  }

  /* ------------------------------------------------------------ transport */

  const canSave = duplicates.size === 0 && plan.tables.every((t) => Number.isInteger(t.number))

  const save = () => {
    if (!canSave) return setError('Fix duplicate table numbers before saving.')
    setError('')
    awaiting.current = true
    socket.emit('staff:savePlan', { plan })
  }

  const reset = () => {
    awaiting.current = true
    setConfirmReset(false)
    socket.emit('staff:resetPlan')
  }

  const inspected = selectedTable ?? selectedFixture

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="display text-2xl leading-none">Floor plan</h2>
          <span className={`chip ${dirty ? 'chip-wait' : 'chip-open'}`}>
            <span className={`dot ${dirty ? 'dot-live' : ''}`} />
            {dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <span className="text-xs text-dim">
            {plan.tables.length} tables · {plan.fixtures.length} fixtures
          </span>
        </div>

        <div className="flex items-center gap-2">
          {confirmReset ? (
            <>
              <span className="text-xs text-dim">Discard the whole layout?</span>
              <button type="button" className="btn btn-ghost h-11 px-4 text-xs" onClick={() => setConfirmReset(false)}>
                Keep it
              </button>
              <button type="button" className="btn btn-danger h-11 px-4 text-xs" onClick={reset}>
                Reset to default
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost h-11 px-4 text-xs" onClick={() => setConfirmReset(true)}>
              Reset to default
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary h-11 px-6 text-xs"
            onClick={save}
            disabled={!dirty || !canSave}
          >
            Save layout
          </button>
        </div>
      </div>

      {(error || duplicates.size > 0) && (
        <div className="mx-5 mb-2 shrink-0 rounded-xl border border-neon/50 bg-neon/10 px-4 py-2 text-xs font-bold text-[#ff7599]">
          {error || `Duplicate table numbers: ${[...duplicates].join(', ')}`}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 px-5 pb-4">
        <div
          className="panel relative min-h-0 min-w-0 flex-1 p-3"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <FloorPlan
            plan={plan}
            svgRef={svgRef}
            showGrid
            showSeats
            draggable
            selectedTable={selectedTable ? selectedTable.number : null}
            selectedFixture={selectedFixture ? selectedFixture.id : null}
            onTablePointerDown={(event, table) => beginDrag(event, 'table', table)}
            onFixturePointerDown={(event, fixture) => beginDrag(event, 'fixture', fixture)}
          />
        </div>

        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
          <Section title="Add">
            <button type="button" className="btn btn-primary h-12 w-full text-xs" onClick={addTable}>
              Add table
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {KINDS.map((spec) => (
                <button
                  key={spec.kind}
                  type="button"
                  className="btn btn-ghost h-11 px-2 text-[0.65rem]"
                  onClick={() => addFixture(spec)}
                >
                  {spec.label || 'Wall'}
                </button>
              ))}
            </div>
          </Section>

          {!inspected && (
            <Section title="Nothing selected">
              <p className="text-xs leading-relaxed text-dim">
                Drag a table or fixture to move it. Everything snaps to a {GRID}-unit grid. Tap one to rename, resize or
                delete it.
              </p>
            </Section>
          )}

          {selectedTable && (
            <Section title={`Table ${selectedTable.number}`}>
              <Field label="Number">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={numberDraft}
                  onChange={(event) => {
                    setNumberDraft(event.target.value)
                    setError(checkNumber(event.target.value)?.error ?? '')
                  }}
                  onBlur={commitNumber}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                  className="tnum w-20 rounded-lg border border-edge bg-void px-2 py-1.5 text-right text-sm font-bold"
                />
              </Field>

              <Field label="Shape">
                <span className="flex gap-1.5">
                  {['round', 'rect'].map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => setShape(shape)}
                      className={`btn h-9 px-3 text-[0.65rem] ${
                        selectedTable.shape === shape ? 'btn-primary' : 'btn-ghost'
                      }`}
                    >
                      {shape === 'round' ? 'Round' : 'Rect'}
                    </button>
                  ))}
                </span>
              </Field>

              <Field label="Seats">
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => patchTable(selectedTable.number, { seats: clamp(selectedTable.seats - 1, 1, 20) })}
                  >
                    −
                  </button>
                  <span className="tnum w-6 text-center text-sm font-bold">{selectedTable.seats}</span>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => patchTable(selectedTable.number, { seats: clamp(selectedTable.seats + 1, 1, 20) })}
                  >
                    +
                  </button>
                </span>
              </Field>

              <Field label="Size">
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => resize(selectedTable, 'table', 'w', -GRID)}
                  >
                    −
                  </button>
                  <span className="tnum w-14 text-center text-xs text-dim">
                    {selectedTable.w}×{selectedTable.h}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => resize(selectedTable, 'table', 'w', GRID)}
                  >
                    +
                  </button>
                </span>
              </Field>

              <button type="button" className="btn btn-danger mt-2 h-11 w-full text-xs" onClick={deleteSelected}>
                Delete table
              </button>
            </Section>
          )}

          {selectedFixture && (
            <Section title={selectedFixture.kind}>
              <Field label="Label">
                <input
                  type="text"
                  maxLength={24}
                  value={selectedFixture.label ?? ''}
                  onChange={(event) => patchFixture(selectedFixture.id, { label: event.target.value })}
                  className="w-36 rounded-lg border border-edge bg-void px-2 py-1.5 text-sm"
                />
              </Field>

              <Field label="Width">
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => resize(selectedFixture, 'fixture', 'w', -GRID)}
                  >
                    −
                  </button>
                  <span className="tnum w-10 text-center text-xs text-dim">{selectedFixture.w}</span>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => resize(selectedFixture, 'fixture', 'w', GRID)}
                  >
                    +
                  </button>
                </span>
              </Field>

              <Field label="Height">
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => resize(selectedFixture, 'fixture', 'h', -GRID)}
                  >
                    −
                  </button>
                  <span className="tnum w-10 text-center text-xs text-dim">{selectedFixture.h}</span>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 text-base"
                    onClick={() => resize(selectedFixture, 'fixture', 'h', GRID)}
                  >
                    +
                  </button>
                </span>
              </Field>

              <button type="button" className="btn btn-danger mt-2 h-11 w-full text-xs" onClick={deleteSelected}>
                Delete fixture
              </button>
            </Section>
          )}
        </aside>
      </div>
    </div>
  )
}
