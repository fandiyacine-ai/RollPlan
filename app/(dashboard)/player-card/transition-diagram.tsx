// Server component — pure SVG, no client JS needed

const SVG_W = 640
const SVG_H = 340
const NODE_RX = 66  // half-width of pill
const NODE_RY = 18  // half-height of pill
const MAX_NODES = 9
const MAX_EDGES = 10

// Position tier: 0 = neutral/standing, 1 = guard/bottom, 2 = top control
const TIER: Record<string, number> = {
  standing: 0, takedown_scramble: 0, scrambling: 0, transition: 0,
  closed_guard: 1, open_guard: 1, half_guard: 1, deep_half: 1,
  butterfly_guard: 1, x_guard: 1, single_leg_x: 1, de_la_riva: 1,
  reverse_de_la_riva: 1, spider_guard: 1, lasso_guard: 1,
  fifty_fifty: 1, ashi_garami: 1, leg_entanglement_other: 1, turtle: 1,
  mount: 2, side_control: 2, knee_on_belly: 2, back_control: 2,
  north_south: 2, on_top_attempting_pass: 2,
}

const TIER_Y = [55, 170, 285]
const H_PAD = 70  // horizontal margin

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
  const tiers: NodeDatum[][] = [[], [], []]

  for (const node of nodes.slice(0, MAX_NODES)) {
    const tier = TIER[node.id] ?? 1
    tiers[tier].push({
      id: node.id,
      name: node.name,
      x: 0,
      y: TIER_Y[tier],
      dominantPct: node.totalTime > 0 ? node.dominantTime / node.totalTime : 0,
    })
  }

  const result: NodeDatum[] = []
  for (const tierNodes of tiers) {
    const k = tierNodes.length
    if (k === 0) continue
    const usableW = SVG_W - 2 * H_PAD - 2 * NODE_RX
    tierNodes.forEach((n, i) => {
      n.x = k === 1
        ? SVG_W / 2
        : H_PAD + NODE_RX + (usableW * i) / (k - 1)
      result.push(n)
    })
  }
  return result
}

function Arrow({
  from, to, count, maxCount, curved,
}: {
  from: NodeDatum; to: NodeDatum; count: number; maxCount: number; curved: boolean
}) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return null
  const ux = dx / dist
  const uy = dy / dist

  // Perpendicular offset for curved/bidirectional edges
  const px = -uy
  const py = ux
  const off = curved ? 18 : 0

  const sx = from.x + ux * NODE_RX + px * off
  const sy = from.y + uy * NODE_RY + py * off
  const ex = to.x - ux * (NODE_RX + 8) + px * off
  const ey = to.y - uy * (NODE_RY + 8) + py * off

  const weight = count / maxCount
  const sw = 1.2 + weight * 2.8
  const opacity = 0.3 + weight * 0.5

  let d: string
  if (curved) {
    const mx = (sx + ex) / 2 + px * 28
    const my = (sy + ey) / 2 + py * 28
    d = `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`
  } else {
    d = `M ${sx} ${sy} L ${ex} ${ey}`
  }

  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeOpacity={opacity}
      markerEnd="url(#arr)"
    />
  )
}

function Node({ node }: { node: NodeDatum }) {
  const isStrong = node.dominantPct >= 0.5
  const isWeak = node.dominantPct < 0.3
  const stroke = isStrong ? '#4ade80' : isWeak ? '#f87171' : '#71717a'
  const fill = isStrong ? '#4ade8022' : isWeak ? '#f8717122' : 'transparent'
  const textColor = isStrong ? '#4ade80' : isWeak ? '#f87171' : 'currentColor'
  const name = node.name.length > 18 ? node.name.slice(0, 17) + '…' : node.name

  return (
    <g transform={`translate(${node.x},${node.y})`}>
      <rect
        x={-NODE_RX} y={-NODE_RY}
        width={NODE_RX * 2} height={NODE_RY * 2}
        rx={NODE_RY}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        strokeOpacity={0.8}
      />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fontWeight="600"
        fill={textColor}
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        {name}
      </text>
    </g>
  )
}

function TierLabel({ y, label }: { y: number; label: string }) {
  return (
    <text
      x={8} y={y}
      dominantBaseline="middle"
      fontSize={8}
      fontWeight="700"
      fill="currentColor"
      opacity={0.25}
      textAnchor="start"
      style={{ fontFamily: 'system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}
    >
      {label}
    </text>
  )
}

export function TransitionDiagram({ data }: { data: TransitionData }) {
  if (data.nodes.length < 3) return null

  const layoutNodes = computeLayout(data.nodes)
  const nodeMap = new Map(layoutNodes.map(n => [n.id, n]))
  const visibleIds = new Set(layoutNodes.map(n => n.id))

  const edges = data.edges
    .filter(e => visibleIds.has(e.fromId) && visibleIds.has(e.toId) && e.fromId !== e.toId)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_EDGES)

  const maxCount = edges[0]?.count ?? 1

  // Detect bidirectional pairs
  const edgeSet = new Set(edges.map(e => `${e.fromId}→${e.toId}`))
  const isBidir = (e: EdgeDatum) => edgeSet.has(`${e.toId}→${e.fromId}`)

  // Detect which tiers have nodes
  const tiersPresent = new Set(layoutNodes.map(n => TIER[n.id] ?? 1))

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W}
      height={SVG_H}
      className="w-full h-auto text-foreground/70"
    >
      <defs>
        <marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto">
          <path d="M0,0 L0,5 L7,2.5 z" fill="currentColor" opacity="0.5" />
        </marker>
      </defs>

      {/* Tier divider lines */}
      {tiersPresent.has(0) && tiersPresent.has(1) && (
        <line x1={20} y1={112} x2={SVG_W - 20} y2={112} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
      )}
      {tiersPresent.has(1) && tiersPresent.has(2) && (
        <line x1={20} y1={227} x2={SVG_W - 20} y2={227} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
      )}

      {/* Tier labels */}
      {tiersPresent.has(0) && <TierLabel y={TIER_Y[0]} label="Neutral" />}
      {tiersPresent.has(1) && <TierLabel y={TIER_Y[1]} label="Guard" />}
      {tiersPresent.has(2) && <TierLabel y={TIER_Y[2]} label="Top" />}

      {/* Edges (drawn first, under nodes) */}
      {edges.map((e, i) => {
        const from = nodeMap.get(e.fromId)
        const to = nodeMap.get(e.toId)
        if (!from || !to) return null
        return (
          <Arrow
            key={i}
            from={from}
            to={to}
            count={e.count}
            maxCount={maxCount}
            curved={isBidir(e)}
          />
        )
      })}

      {/* Nodes (drawn on top) */}
      {layoutNodes.map(n => <Node key={n.id} node={n} />)}
    </svg>
  )
}
