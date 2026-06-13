// Server component — pure SVG, no client JS needed

const CANVAS_W = 520
const CANVAS_H = 340
const NODE_R = 21
const LABEL_GAP = NODE_R + 19   // distance from node centre to label anchor
const CIRCLE_R = 106            // radius of the node ring
const CX = CANVAS_W / 2        // 260
const CY = 176                  // slightly above centre to leave label room top/bottom

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

// ─── Circular layout ───────────────────────────────────────────────────────────

function buildLayout(nodes: TransitionData['nodes']): Map<string, [number, number]> {
  const map = new Map<string, [number, number]>()
  const n = nodes.length
  nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i / n)
    map.set(node.id, [
      CX + CIRCLE_R * Math.cos(angle),
      CY + CIRCLE_R * Math.sin(angle),
    ])
  })
  return map
}

// ─── Label helpers ─────────────────────────────────────────────────────────────

function labelProps(angle: number): { anchor: 'start' | 'end' | 'middle'; baseX: number; baseY: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    anchor: cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle',
    baseX: CX + (CIRCLE_R + LABEL_GAP) * cos,
    baseY: CY + (CIRCLE_R + LABEL_GAP) * sin,
  }
}

function splitLabel(name: string): string[] {
  if (name.length <= 11) return [name]
  const words = name.split(' ')
  if (words.length < 2) return [name.slice(0, 11) + '…']
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

// ─── Node ──────────────────────────────────────────────────────────────────────

function NodeCircle({
  cx, cy, r, angle, name, dominantTime, inferiorTime, totalTime, isTop,
}: {
  cx: number; cy: number; r: number; angle: number
  name: string; dominantTime: number; inferiorTime: number; totalTime: number
  isTop: boolean
}) {
  const domPct = totalTime > 0 ? dominantTime / totalTime : 0
  const infPct = totalTime > 0 ? inferiorTime / totalTime : 0
  const color = domPct >= 0.5 ? '#3b82f6' : infPct >= 0.4 ? '#ef4444' : '#71717a'
  const fill  = domPct >= 0.5 ? '#3b82f618' : infPct >= 0.4 ? '#ef444418' : '#3f3f4680'
  const lines = splitLabel(name)
  const { anchor, baseX, baseY } = labelProps(angle)

  // Vertical offset so two-line labels don't collide (top half: lines go down from base, bottom half: go up)
  const lineHeight = 10
  const goesDown = Math.sin(angle) >= -0.2  // top of circle: lines go up from base
  const firstY = goesDown
    ? baseY + 2
    : baseY - lineHeight * (lines.length - 1) - 2

  return (
    <g>
      {isTop && (
        <circle cx={cx} cy={cy} r={r + 7} fill={color} opacity={0.11} className="pulse-ring" />
      )}
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={color} strokeWidth={1.8} />
      {lines.map((line, i) => (
        <text
          key={i}
          x={baseX}
          y={firstY + i * lineHeight}
          textAnchor={anchor}
          dominantBaseline="auto"
          fontSize={8.5}
          fontWeight="600"
          fill="#52525b"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

// ─── Edge ──────────────────────────────────────────────────────────────────────

function EdgeArrow({
  from, to, count, maxCount, yourAction, curved,
}: {
  from: [number, number]; to: [number, number]
  count: number; maxCount: number; yourAction: boolean; curved: boolean
}) {
  const [x1, y1] = from
  const [x2, y2] = to
  const dx = x2 - x1, dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 2) return null

  const ux = dx / dist, uy = dy / dist
  const px = -uy, py = ux         // perpendicular (left of direction)
  const off = curved ? 24 : 10    // bidir pairs curve more
  const sideOff = off * 0.2

  const sx = x1 + ux * NODE_R + px * sideOff
  const sy = y1 + uy * NODE_R + py * sideOff
  const ex = x2 - ux * (NODE_R + 6) + px * sideOff
  const ey = y2 - uy * (NODE_R + 6) + py * sideOff

  const cx = (sx + ex) / 2 + px * off
  const cy = (sy + ey) / 2 + py * off

  // midpoint on bezier at t=0.5
  const bx = (sx + 2 * cx + ex) / 4
  const by = (sy + 2 * cy + ey) / 4

  const sw = 1.4 + (count / maxCount) * 3.2
  const color = yourAction ? '#3b82f6' : '#ef4444'
  const markerId = yourAction ? 'arr-g' : 'arr-r'

  return (
    <g>
      <path
        d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeOpacity={0.6}
        markerEnd={`url(#${markerId})`}
      />
      <g transform={`translate(${bx},${by})`}>
        <rect x={-9} y={-7} width={18} height={13} rx={3} fill="#e4e4e7" opacity={0.95} />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={8}
          fontWeight="700"
          fill="#3f3f46"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          ×{count}
        </text>
      </g>
    </g>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function TransitionDiagram({ data }: { data: TransitionData }) {
  if (data.nodes.length < 3) return null

  // Cap at 6 nodes for a clean circle
  const nodes = data.nodes.slice(0, 6)
  const visibleIds = new Set(nodes.map(n => n.id))

  const edges = data.edges
    .filter(e => visibleIds.has(e.fromId) && visibleIds.has(e.toId) && e.fromId !== e.toId)
    .sort((a, b) => b.count - a.count)
    .slice(0, 9)

  const maxCount = edges[0]?.count ?? 1

  const layout = buildLayout(nodes)

  const edgeSet = new Set(edges.map(e => `${e.fromId}→${e.toId}`))
  const isBidir = (e: { fromId: string; toId: string }) => edgeSet.has(`${e.toId}→${e.fromId}`)

  const topNodeId = nodes[0]?.id
  const n = nodes.length

  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }}
    >
      <defs>
        <style>{`
          @keyframes pulseGlow { 0%,100%{opacity:.09}50%{opacity:.24} }
          .pulse-ring{animation:pulseGlow 2.6s ease-in-out infinite}
        `}</style>
        {(['g', 'r'] as const).map(k => (
          <marker key={k} id={`arr-${k}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0.5 L0,6.5 L6.5,3.5 z" fill={k === 'g' ? '#3b82f6' : '#ef4444'} opacity="0.8" />
          </marker>
        ))}
      </defs>

      {/* Edges */}
      {edges.map((e, i) => {
        const from = layout.get(e.fromId)
        const to = layout.get(e.toId)
        if (!from || !to) return null
        return (
          <EdgeArrow
            key={i}
            from={from} to={to}
            count={e.count} maxCount={maxCount}
            yourAction={e.yourAction}
            curved={isBidir(e)}
          />
        )
      })}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const pos = layout.get(node.id)
        if (!pos) return null
        const angle = -Math.PI / 2 + (2 * Math.PI * i / n)
        return (
          <NodeCircle
            key={node.id}
            cx={pos[0]} cy={pos[1]} r={NODE_R}
            angle={angle}
            name={node.name}
            dominantTime={node.dominantTime}
            inferiorTime={node.inferiorTime}
            totalTime={node.totalTime}
            isTop={node.id === topNodeId}
          />
        )
      })}
    </svg>
  )
}
