// Server component — pure SVG, no client JS needed

const SVG_W = 560
const SVG_H = 400
const NODE_RX = 52  // half-width of node rect
const NODE_RY = 18  // half-height of node rect
const MAX_NODES = 8

type NodeDatum = {
  id: string
  name: string
  x: number
  y: number
  dominantPct: number
}

type EdgeDatum = {
  fromId: string
  toId: string
  count: number
}

export type TransitionData = {
  nodes: { id: string; name: string; totalTime: number; dominantTime: number }[]
  edges: EdgeDatum[]
}

function computeLayout(nodes: TransitionData['nodes']): NodeDatum[] {
  const n = nodes.length
  const cx = SVG_W / 2
  const cy = SVG_H / 2
  const rx = (SVG_W / 2) - NODE_RX - 20
  const ry = (SVG_H / 2) - NODE_RY - 24

  return nodes.slice(0, MAX_NODES).map((node, i) => {
    const angle = (i / Math.min(n, MAX_NODES)) * 2 * Math.PI - Math.PI / 2
    return {
      id: node.id,
      name: node.name,
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      dominantPct: node.totalTime > 0 ? node.dominantTime / node.totalTime : 0,
    }
  })
}

function EdgePath({
  from,
  to,
  count,
  maxCount,
  hasBidirectional,
}: {
  from: NodeDatum
  to: NodeDatum
  count: number
  maxCount: number
  hasBidirectional: boolean
}) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / dist
  const uy = dy / dist

  // Perpendicular unit vector for curve offset
  const px = -uy
  const py = ux
  const offset = hasBidirectional ? 22 : 0

  // Start/end points on node rect boundary (approximate with circle at NODE_RX)
  const startX = from.x + ux * NODE_RX + px * offset
  const startY = from.y + uy * NODE_RX + py * offset
  const endX = to.x - ux * (NODE_RX + 10) + px * offset
  const endY = to.y - uy * (NODE_RX + 10) + py * offset

  // Control point
  const midX = (startX + endX) / 2 + px * (hasBidirectional ? 30 : 20)
  const midY = (startY + endY) / 2 + py * (hasBidirectional ? 30 : 20)

  const weight = count / maxCount
  const strokeWidth = 1 + weight * 3.5
  const opacity = 0.35 + weight * 0.5

  const d = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`

  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeOpacity={opacity}
      markerEnd="url(#arrow)"
    />
  )
}

function NodeShape({ node }: { node: NodeDatum }) {
  const isGood = node.dominantPct >= 0.5
  const isBad = node.dominantPct < 0.3
  const stroke = isGood ? '#4ade80' : isBad ? '#f87171' : '#71717a'
  const textColor = isGood ? '#4ade80' : isBad ? '#f87171' : 'currentColor'

  // Truncate long names
  const name = node.name.length > 14 ? node.name.slice(0, 13) + '…' : node.name

  return (
    <g transform={`translate(${node.x}, ${node.y})`}>
      <rect
        x={-NODE_RX}
        y={-NODE_RY}
        width={NODE_RX * 2}
        height={NODE_RY * 2}
        rx={NODE_RY}
        fill="var(--card, #1c1c2e)"
        stroke={stroke}
        strokeWidth={1.5}
        strokeOpacity={0.7}
      />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10.5}
        fontWeight="600"
        fill={textColor}
        style={{ fontFamily: 'inherit' }}
      >
        {name}
      </text>
    </g>
  )
}

export function TransitionDiagram({ data }: { data: TransitionData }) {
  if (data.nodes.length < 3) return null

  const nodeMap = new Map<string, NodeDatum>()
  const layoutNodes = computeLayout(data.nodes)
  for (const n of layoutNodes) nodeMap.set(n.id, n)

  const visibleNodeIds = new Set(layoutNodes.map(n => n.id))
  const visibleEdges = data.edges
    .filter(e => visibleNodeIds.has(e.fromId) && visibleNodeIds.has(e.toId) && e.fromId !== e.toId)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  const maxCount = visibleEdges[0]?.count ?? 1

  const bidirSet = new Set<string>()
  for (const e of visibleEdges) {
    const rev = `${e.toId}→${e.fromId}`
    if (visibleEdges.some(x => x.fromId === e.toId && x.toId === e.fromId)) {
      bidirSet.add(`${e.fromId}→${e.toId}`)
      bidirSet.add(rev)
    }
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W}
      height={SVG_H}
      className="w-full h-auto max-h-80 text-foreground/60"
    >
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6" />
        </marker>
      </defs>

      {visibleEdges.map((e, i) => {
        const from = nodeMap.get(e.fromId)
        const to = nodeMap.get(e.toId)
        if (!from || !to) return null
        return (
          <EdgePath
            key={i}
            from={from}
            to={to}
            count={e.count}
            maxCount={maxCount}
            hasBidirectional={bidirSet.has(`${e.fromId}→${e.toId}`)}
          />
        )
      })}

      {layoutNodes.map(node => (
        <NodeShape key={node.id} node={node} />
      ))}
    </svg>
  )
}
