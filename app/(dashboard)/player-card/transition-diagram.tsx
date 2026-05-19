// Server component — pure SVG, no client JS needed

const CANVAS_W = 760
const CANVAS_H = 480
const NODE_R = 26

// Fixed positions for every common BJJ position in the 760×480 canvas
const FIXED: Record<string, [number, number]> = {
  standing:               [370,  62],
  takedown_scramble:      [192,  68],
  scrambling:             [530,  62],
  transition:             [370, 135],

  closed_guard:           [76,  200],
  open_guard:             [256, 218],
  half_guard:             [196, 322],
  deep_half:              [116, 392],
  butterfly_guard:        [76,  358],
  de_la_riva:             [152, 265],
  reverse_de_la_riva:     [188, 298],
  spider_guard:           [155, 342],
  lasso_guard:            [68,  428],
  x_guard:                [278, 392],
  single_leg_x:           [352, 305],
  ashi_garami:            [325, 362],
  fifty_fifty:            [455, 378],
  leg_entanglement_other: [495, 438],

  on_top_attempting_pass: [405, 432],

  side_control:           [506, 295],
  mount:                  [602, 185],
  back_control:           [665,  62],
  north_south:            [548, 390],
  knee_on_belly:          [622, 302],
  turtle:                 [662, 372],
}

// Fallback grid for any position not in FIXED
const FALLBACK_SLOTS: [number, number][] = [
  [680, 445], [600, 450], [510, 450], [415, 450], [320, 450], [225, 450],
]

export type TransitionData = {
  nodes: {
    id: string
    name: string
    totalTime: number
    dominantTime: number
    inferiorTime: number
  }[]
  edges: { fromId: string; toId: string; count: number; yourAction: boolean }[]
}

// ─── Layout ────────────────────────────────────────────────────────────────────

function buildLayout(
  nodes: TransitionData['nodes'],
): Map<string, [number, number]> {
  const map = new Map<string, [number, number]>()
  let fallbackIdx = 0
  for (const n of nodes) {
    map.set(n.id, FIXED[n.id] ?? FALLBACK_SLOTS[fallbackIdx++ % FALLBACK_SLOTS.length])
  }
  return map
}

// ─── Power chain ───────────────────────────────────────────────────────────────

function findPowerChain(edges: TransitionData['edges']): string[] {
  const yourEdges = edges.filter(e => e.yourAction)
  if (yourEdges.length < 2) return []

  const adj: Record<string, string[]> = {}
  for (const e of yourEdges) {
    ;(adj[e.fromId] ??= []).push(e.toId)
  }

  let longest: string[] = []

  function dfs(node: string, path: string[], seen: Set<string>) {
    if (path.length > longest.length) longest = [...path]
    for (const next of (adj[node] ?? [])) {
      if (!seen.has(next)) {
        seen.add(next)
        dfs(next, [...path, next], seen)
        seen.delete(next)
      }
    }
  }

  const targets = new Set(yourEdges.map(e => e.toId))
  const starts = new Set(yourEdges.map(e => e.fromId).filter(n => !targets.has(n)))
  const startFrom = starts.size > 0 ? starts : new Set(yourEdges.map(e => e.fromId))
  for (const s of startFrom) dfs(s, [s], new Set([s]))

  return longest.length >= 2 ? longest : []
}

// ─── Label splitting ────────────────────────────────────────────────────────────

function splitLabel(name: string): string[] {
  if (name.length <= 13) return [name]
  const words = name.split(' ')
  if (words.length < 2) return [name]
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

// ─── SVG sub-components ────────────────────────────────────────────────────────

function NodeCircle({
  cx, cy, r, name, dominantTime, inferiorTime, totalTime, isTop,
}: {
  cx: number; cy: number; r: number
  name: string; dominantTime: number; inferiorTime: number; totalTime: number
  isTop: boolean
}) {
  const domPct = totalTime > 0 ? dominantTime / totalTime : 0
  const infPct = totalTime > 0 ? inferiorTime / totalTime : 0
  const color = domPct >= 0.5 ? '#10b981' : infPct >= 0.4 ? '#ef4444' : '#71717a'
  const fill  = domPct >= 0.5 ? '#10b98118' : infPct >= 0.4 ? '#ef444418' : '#3f3f4680'
  const lines = splitLabel(name)

  return (
    <g>
      {isTop && (
        <circle cx={cx} cy={cy} r={r + 8} fill={color} opacity={0.12} className="pulse-ring" />
      )}
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={color} strokeWidth={2} />
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={cy + r + 11 + i * 11}
          textAnchor="middle"
          dominantBaseline="auto"
          fontSize={9}
          fontWeight="600"
          fill="#d4d4d8"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

function EdgeArrow({
  from, to, count, maxCount, yourAction, curved, compact,
}: {
  from: [number, number]; to: [number, number]
  count: number; maxCount: number; yourAction: boolean; curved: boolean; compact: boolean
}) {
  const [x1, y1] = from
  const [x2, y2] = to
  const dx = x2 - x1, dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 2) return null

  const ux = dx / dist, uy = dy / dist
  const px = -uy, py = ux  // perpendicular
  const curveDir = curved ? 1 : 0
  const off = curveDir * 28

  // Start/end on circle perimeters, offset sideways for curved pairs
  const sideOff = off * 0.25
  const sx = x1 + ux * NODE_R + px * sideOff
  const sy = y1 + uy * NODE_R + py * sideOff
  const ex = x2 - ux * (NODE_R + 7) + px * sideOff
  const ey = y2 - uy * (NODE_R + 7) + py * sideOff

  // Quadratic control point
  const cx = (sx + ex) / 2 + px * off
  const cy = (sy + ey) / 2 + py * off

  // Bezier midpoint at t=0.5
  const bx = (sx + 2 * cx + ex) / 4
  const by = (sy + 2 * cy + ey) / 4

  const sw = 1.5 + (count / maxCount) * 3.5
  const color = yourAction ? '#10b981' : '#ef4444'
  const markerId = yourAction ? 'arr-g' : 'arr-r'

  return (
    <g>
      <path
        d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeOpacity={0.65}
        markerEnd={`url(#${markerId})`}
      />
      {!compact && (
        <g transform={`translate(${bx},${by})`}>
          <rect x={-11} y={-8} width={22} height={16} rx={4} fill="#18181b" opacity={0.9} />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fontWeight="700"
            fill="#d4d4d8"
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >
            ×{count}
          </text>
        </g>
      )}
    </g>
  )
}

function Legend({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} style={{ fontFamily: 'system-ui, sans-serif' }}>
      <text fontSize={7.5} fontWeight="700" fill="#52525b" letterSpacing={1}>LEGEND</text>
      {[
        { color: '#10b981', label: 'In Control' },
        { color: '#ef4444', label: 'Under Pressure' },
        { color: '#71717a', label: 'Neutral' },
      ].map(({ color, label }, i) => (
        <g key={label} transform={`translate(0,${15 + i * 15})`}>
          <circle cx={5} cy={4} r={5} fill={color} opacity={0.75} />
          <text x={14} y={8} fontSize={8} fill="#a1a1aa">{label}</text>
        </g>
      ))}
      {[
        { color: '#10b981', label: 'Your move' },
        { color: '#ef4444', label: 'Opp move' },
      ].map(({ color, label }, i) => (
        <g key={label} transform={`translate(0,${65 + i * 15})`}>
          <line x1={0} y1={5} x2={11} y2={5} stroke={color} strokeWidth={2} />
          <text x={15} y={9} fontSize={8} fill="#a1a1aa">{label}</text>
        </g>
      ))}
    </g>
  )
}

// ─── Main export ────────────────────────────────────────────────────────────────

export function TransitionDiagram({
  data,
  compact = false,
}: {
  data: TransitionData
  compact?: boolean
}) {
  if (data.nodes.length < 3) return null

  const layout = buildLayout(data.nodes)
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]))
  const visibleIds = new Set(data.nodes.map(n => n.id))

  const edges = data.edges
    .filter(e => visibleIds.has(e.fromId) && visibleIds.has(e.toId) && e.fromId !== e.toId)
    .sort((a, b) => b.count - a.count)
    .slice(0, 14)

  const maxCount = edges[0]?.count ?? 1

  // Detect bidirectional pairs — curve them apart
  const edgeSet = new Set(edges.map(e => `${e.fromId}→${e.toId}`))
  const isBidir = (e: { fromId: string; toId: string }) =>
    edgeSet.has(`${e.toId}→${e.fromId}`)

  // Find node with most time (gets glow)
  const topNodeId = data.nodes[0]?.id

  // Power chain (only in full mode)
  const powerChain = compact ? [] : findPowerChain(edges)

  const svgHeight = compact ? 300 : CANVAS_H

  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width={CANVAS_W}
      height={svgHeight}
      className="w-full h-auto"
    >
      <defs>
        <style>{`
          @keyframes pulseGlow { 0%,100% { opacity:.10 } 50% { opacity:.28 } }
          .pulse-ring { animation: pulseGlow 2.4s ease-in-out infinite }
        `}</style>

        {/* Arrow markers — one per colour */}
        {(['g', 'r'] as const).map(k => (
          <marker
            key={k}
            id={`arr-${k}`}
            markerWidth="7" markerHeight="7"
            refX="5" refY="3.5"
            orient="auto"
          >
            <path
              d="M0,0.5 L0,6.5 L6.5,3.5 z"
              fill={k === 'g' ? '#10b981' : '#ef4444'}
              opacity="0.8"
            />
          </marker>
        ))}
      </defs>

      {/* Power chain annotation */}
      {powerChain.length >= 2 && (() => {
        const pts = powerChain.map(id => layout.get(id)).filter((p): p is [number, number] => !!p)
        const midPt = pts[Math.floor(pts.length / 2)]
        const nodeNames = powerChain.map(id => nodeMap.get(id)?.name ?? id)
        return (
          <g>
            <polyline
              points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="#10b981"
              strokeWidth={1.5}
              strokeOpacity={0.22}
              strokeDasharray="5,3"
            />
            {midPt && (
              <g transform={`translate(${midPt[0] + NODE_R + 6},${midPt[1] - 18})`}
                style={{ fontFamily: 'system-ui, sans-serif' }}>
                <text fontSize={10} fontWeight="800" fill="#10b981">Top Game Chain</text>
                <text y={13} fontSize={8.5} fill="#6b7280">
                  {nodeNames.join(' → ')}
                </text>
              </g>
            )}
          </g>
        )
      })()}

      {/* Edges — drawn under nodes */}
      {edges.map((e, i) => {
        const from = layout.get(e.fromId)
        const to = layout.get(e.toId)
        if (!from || !to) return null
        return (
          <EdgeArrow
            key={i}
            from={from}
            to={to}
            count={e.count}
            maxCount={maxCount}
            yourAction={e.yourAction}
            curved={isBidir(e)}
            compact={compact}
          />
        )
      })}

      {/* Nodes — drawn on top */}
      {data.nodes.map(n => {
        const pos = layout.get(n.id)
        if (!pos) return null
        return (
          <NodeCircle
            key={n.id}
            cx={pos[0]}
            cy={pos[1]}
            r={NODE_R}
            name={n.name}
            dominantTime={n.dominantTime}
            inferiorTime={n.inferiorTime}
            totalTime={n.totalTime}
            isTop={n.id === topNodeId}
          />
        )
      })}

      {/* Legend (full mode only, top-right) */}
      {!compact && <Legend x={CANVAS_W - 108} y={12} />}
    </svg>
  )
}
