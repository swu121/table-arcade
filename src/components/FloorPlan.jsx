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

function Table({ table, status, isSelf, pickable, selected, draggable, showSeats, onTap, onPointerDown }) {
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

      {outline}

      {pickable &&
        (round ? (
          <circle className="fp-pick" cx={cx} cy={cy} r={r - 7} />
        ) : (
          <rect className="fp-pick" x={x + 7} y={y + 7} width={w - 14} height={h - 14} rx={7} />
        ))}

      {selected &&
        (round ? (
          <circle className="fp-selected" cx={cx} cy={cy} r={r + 6} />
        ) : (
          <rect className="fp-selected" x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx={16} />
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

      {interactive && <rect className="fp-hit" x={x} y={y} width={w} height={h} />}
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
  onTableTap = null,
  onFixtureTap = null,
  onTablePointerDown = null,
  onFixturePointerDown = null,
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
              draggable={draggable}
              showSeats={showSeats}
              onTap={onTableTap}
              onPointerDown={onTablePointerDown}
            />
          )
        })}
      </svg>
    </div>
  )
}
