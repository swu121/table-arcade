import '../styles/floorplan.css'
import { useId } from 'react'

// No status map at all means "not a live floor" (the editor) — render neutral.
// A map that simply lacks this table means the tablet is offline.
const readStatus = (statuses, number) => {
  if (!statuses) return undefined
  const value = typeof statuses.get === 'function' ? statuses.get(number) : statuses[number]
  return value ?? 'offline'
}

const has = (set, value) => Boolean(set && (typeof set.has === 'function' ? set.has(value) : set[value]))

// SVG has no text wrapping or shrink-to-fit, so a long fixture label or a
// 2-digit number would happily spill out of its shape. Estimate and clamp.
function fitFont(text, maxWidth, ideal, charRatio) {
  const chars = Math.max(1, String(text ?? '').length)
  return Math.max(6, Math.min(ideal, maxWidth / (chars * charRatio)))
}

function Fixture({ fixture, selected, draggable, onTap, onPointerDown }) {
  const { x, y, w, h, label, kind } = fixture
  const interactive = Boolean(onTap || onPointerDown)
  const size = fitFont(label, w - 16, Math.min(h * 0.42, 22), 0.72)

  return (
    <g
      className="fp-item fp-fixture"
      data-kind={kind}
      data-active={interactive || undefined}
      data-drag={draggable || undefined}
      onClick={onTap ? () => onTap(fixture) : undefined}
      onPointerDown={onPointerDown ? (event) => onPointerDown(event, fixture) : undefined}
    >
      <rect className="fp-fixture-box" x={x} y={y} width={w} height={h} rx={kind === 'wall' ? 3 : 10} />
      {selected && <rect className="fp-selected" x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={14} />}
      {label && (
        <text
          className="fp-label"
          x={x + w / 2}
          y={y + h / 2}
          fontSize={size}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {label}
        </text>
      )}
      {interactive && <rect className="fp-hit" x={x} y={y} width={w} height={h} />}
    </g>
  )
}

// Chairs are drawn just outside the table edge, one per seat, so the floor
// reads at a glance without anyone having to parse the little seat digit.
const chairDepth = (w, h) => Math.max(4, Math.min(8, Math.min(w, h) * 0.11))

function chairs(table) {
  const { x, y, w, h, shape, seats } = table
  const count = Math.max(0, Math.min(20, Math.round(seats ?? 0)))
  if (!count) return []

  const depth = chairDepth(w, h)
  const gap = depth * 0.5
  const out = []

  if (shape !== 'rect') {
    const r = Math.min(w, h) / 2
    const cx = x + w / 2
    const cy = y + h / 2
    const ring = r + gap + depth / 2
    const length = Math.min(r * 0.62, (2 * Math.PI * ring) / count - depth)
    for (let i = 0; i < count; i++) {
      const angle = -90 + (i * 360) / count
      const rad = (angle * Math.PI) / 180
      out.push({
        cx: cx + ring * Math.cos(rad),
        cy: cy + ring * Math.sin(rad),
        length: Math.max(depth, length),
        depth,
        angle: angle + 90
      })
    }
    return out
  }

  // Rectangles seat people along the long sides first, with a head at each end
  // once the table is big enough for it.
  const ends = count >= 6 ? 1 : 0
  const rest = count - ends * 2
  const along = [Math.ceil(rest / 2), Math.floor(rest / 2)]
  const side = (n, place) => {
    for (let i = 0; i < n; i++) place((i + 1) / (n + 1))
  }

  const spanLength = (n, span) => Math.max(depth, Math.min(Math.min(w, h) * 0.3, span / (n + 0.5)))
  const topLen = spanLength(along[0], w)
  const bottomLen = spanLength(along[1], w)
  const endLen = spanLength(ends, h)

  side(along[0], (t) => out.push({ cx: x + w * t, cy: y - gap - depth / 2, length: topLen, depth, angle: 0 }))
  side(along[1], (t) => out.push({ cx: x + w * t, cy: y + h + gap + depth / 2, length: bottomLen, depth, angle: 0 }))
  side(ends, (t) => out.push({ cx: x - gap - depth / 2, cy: y + h * t, length: endLen, depth, angle: 90 }))
  side(ends, (t) => out.push({ cx: x + w + gap + depth / 2, cy: y + h * t, length: endLen, depth, angle: 90 }))

  return out
}

function Table({
  table,
  status,
  isSelf,
  pickable,
  selected,
  unread,
  draggable,
  showSeats,
  onTap,
  onPointerDown
}) {
  const { x, y, w, h, shape, number, seats } = table
  const round = shape !== 'rect'
  const r = Math.min(w, h) / 2
  const cx = x + w / 2
  const cy = y + h / 2

  const interactive = Boolean(onPointerDown) || (pickable && Boolean(onTap))
  const label = String(number)
  const inner = round ? r * 1.5 : w - 14
  const numberSize = fitFont(label, inner, Math.min(w, h) * 0.46, 0.56)
  const footer = isSelf ? 'YOU' : showSeats ? `${seats}` : ''
  const footerSize = Math.max(7, Math.min(w, h) * 0.16)
  // Clear the chairs so the selection ring doesn't cut straight through them.
  const pad = seats > 0 ? chairDepth(w, h) * 1.5 + 4 : 6
  const badge = Math.max(8, Math.min(w, h) * 0.19)
  const lift = footer ? Math.min(w, h) * 0.08 : 0

  const outline = round ? (
    <circle className="fp-shape" cx={cx} cy={cy} r={r} />
  ) : (
    <rect className="fp-shape" x={x} y={y} width={w} height={h} rx={12} />
  )

  return (
    <g
      className="fp-item fp-table"
      data-status={status}
      data-self={isSelf || undefined}
      data-active={interactive || undefined}
      data-drag={draggable || undefined}
      onClick={onTap && pickable ? () => onTap(table) : undefined}
      onPointerDown={onPointerDown ? (event) => onPointerDown(event, table) : undefined}
    >
      {isSelf &&
        (round ? (
          <circle className="fp-halo" cx={cx} cy={cy} r={r} />
        ) : (
          <rect className="fp-halo" x={x} y={y} width={w} height={h} rx={12} />
        ))}

      {chairs(table).map((chair, i) => (
        <rect
          key={i}
          className="fp-chair"
          x={chair.cx - chair.length / 2}
          y={chair.cy - chair.depth / 2}
          width={chair.length}
          height={chair.depth}
          rx={chair.depth / 2}
          transform={chair.angle ? `rotate(${chair.angle} ${chair.cx} ${chair.cy})` : undefined}
        />
      ))}

      {outline}

      {pickable &&
        (round ? (
          <circle className="fp-pick" cx={cx} cy={cy} r={r - 7} />
        ) : (
          <rect className="fp-pick" x={x + 7} y={y + 7} width={w - 14} height={h - 14} rx={7} />
        ))}

      {selected &&
        (round ? (
          <circle className="fp-selected" cx={cx} cy={cy} r={r + pad} />
        ) : (
          <rect
            className="fp-selected"
            x={x - pad}
            y={y - pad}
            width={w + pad * 2}
            height={h + pad * 2}
            rx={10 + pad}
          />
        ))}

      <text
        className="fp-num"
        x={cx}
        y={cy - lift}
        fontSize={numberSize}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>

      {footer && (
        <text
          className={isSelf ? 'fp-you' : 'fp-seats'}
          x={cx}
          y={cy + numberSize * 0.46}
          fontSize={footerSize}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {footer}
        </text>
      )}

      {unread > 0 && (
        <g className="fp-unread">
          <circle
            className="fp-unread-dot"
            cx={round ? cx + r * 0.71 : x + w}
            cy={round ? cy - r * 0.71 : y}
            r={badge}
          />
          <text
            className="fp-unread-count"
            x={round ? cx + r * 0.71 : x + w}
            y={round ? cy - r * 0.71 : y}
            fontSize={badge * 1.3}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {unread > 9 ? '9+' : unread}
          </text>
        </g>
      )}

      {interactive && <rect className="fp-hit" x={x} y={y} width={w} height={h} />}
    </g>
  )
}

// Corner grips, drawn in a layer above every table so a neighbour can never sit
// on top of a grip the staffer is reaching for. The dot is small; the invisible
// hit rect around it is finger-sized.
function EditOverlay({ item, type, mode, onHandlePointerDown }) {
  const { x, y, w, h } = item
  const pad = type === 'table' && item.seats > 0 ? chairDepth(w, h) * 1.5 + 4 : 6
  const grip = 4.5
  const box = { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 }

  const corners = [
    ['nw', box.x, box.y],
    ['ne', box.x + box.w, box.y],
    ['sw', box.x, box.y + box.h],
    ['se', box.x + box.w, box.y + box.h]
  ]

  return (
    <g className="fp-overlay" data-mode={mode ?? 'idle'}>
      {corners.map(([corner, hx, hy]) => (
        <g
          key={corner}
          className="fp-handle"
          data-corner={corner}
          onPointerDown={(event) => onHandlePointerDown(event, item, corner, type)}
        >
          <rect className="fp-hit" x={hx - 16} y={hy - 16} width={32} height={32} />
          <rect
            className="fp-handle-box"
            x={hx - grip}
            y={hy - grip}
            width={grip * 2}
            height={grip * 2}
            rx={grip * 0.45}
          />
        </g>
      ))}
    </g>
  )
}

export function FloorPlan({
  plan,
  statuses = null,
  selfNumber = null,
  selectable = null,
  selectedTable = null,
  selectedFixture = null,
  unread = null,
  onTableTap = null,
  onFixtureTap = null,
  onTablePointerDown = null,
  onFixturePointerDown = null,
  onHandlePointerDown = null,
  dragMode = null,
  showGrid = false,
  gridStep = 10,
  showSeats = false,
  draggable = false,
  svgRef = null,
  className = ''
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const width = plan?.width || 1000
  const height = plan?.height || 700
  const tables = plan?.tables ?? []
  const fixtures = plan?.fixtures ?? []
  const gridId = `fpgrid-${uid}`

  const editing = onHandlePointerDown
    ? selectedTable != null
      ? { item: tables.find((t) => t.number === selectedTable), type: 'table' }
      : selectedFixture != null
        ? { item: fixtures.find((f) => f.id === selectedFixture), type: 'fixture' }
        : null
    : null

  return (
    <div className={`fp-wrap ${draggable ? 'fp-wrap--drag' : ''} ${className}`.trim()}>
      <svg
        ref={svgRef}
        className="fp-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={plan?.name ? `${plan.name} floor plan` : 'Floor plan'}
      >
        <defs>
          <pattern id={gridId} width={gridStep * 5} height={gridStep * 5} patternUnits="userSpaceOnUse">
            <path
              className="fp-grid-line"
              d={`M0 0 H${gridStep * 5} M0 ${gridStep} H${gridStep * 5} M0 ${gridStep * 2} H${gridStep * 5} M0 ${
                gridStep * 3
              } H${gridStep * 5} M0 ${gridStep * 4} H${gridStep * 5}`}
            />
            <path
              className="fp-grid-line"
              d={`M0 0 V${gridStep * 5} M${gridStep} 0 V${gridStep * 5} M${gridStep * 2} 0 V${gridStep * 5} M${
                gridStep * 3
              } 0 V${gridStep * 5} M${gridStep * 4} 0 V${gridStep * 5}`}
            />
            <path className="fp-grid-line fp-grid-line--major" d={`M0 0 H${gridStep * 5} M0 0 V${gridStep * 5}`} />
          </pattern>
        </defs>

        <rect className="fp-floor" x="1" y="1" width={width - 2} height={height - 2} rx="18" />
        {showGrid && <rect x="1" y="1" width={width - 2} height={height - 2} rx="18" fill={`url(#${gridId})`} />}

        {fixtures.map((fixture) => (
          <Fixture
            key={fixture.id}
            fixture={fixture}
            selected={selectedFixture === fixture.id}
            draggable={draggable}
            onTap={onFixtureTap}
            onPointerDown={onFixturePointerDown}
          />
        ))}

        {tables.map((table) => {
          const status = readStatus(statuses, table.number)
          const pickable = has(selectable, table.number)
          return (
            <Table
              key={table.number}
              table={table}
              status={status}
              isSelf={selfNumber != null && table.number === selfNumber}
              pickable={pickable}
              selected={selectedTable === table.number}
              unread={unread?.[table.number] ?? 0}
              draggable={draggable}
              showSeats={showSeats}
              onTap={onTableTap}
              onPointerDown={onTablePointerDown}
            />
          )
        })}

        {editing?.item && (
          <EditOverlay
            item={editing.item}
            type={editing.type}
            mode={dragMode}
            onHandlePointerDown={onHandlePointerDown}
          />
        )}
      </svg>
    </div>
  )
}
