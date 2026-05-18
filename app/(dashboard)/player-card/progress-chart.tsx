'use client'

const VB_W = 600
const VB_H = 140
const PAD = { top: 18, right: 24, bottom: 28, left: 36 }
const CHART_W = VB_W - PAD.left - PAD.right
const CHART_H = VB_H - PAD.top - PAD.bottom

export type TrendPoint = {
  controlRate: number
  pressureRate: number
  createdAt: string // ISO string
}

export function ControlTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
        Add {2 - data.length} more match{data.length === 1 ? '' : 'es'} to unlock your trend
      </div>
    )
  }

  const rates = data.map(d => d.controlRate)
  const rawMin = Math.min(...rates)
  const rawMax = Math.max(...rates)
  const yMin = Math.max(0, Math.floor((rawMin - 10) / 10) * 10)
  const yMax = Math.min(100, Math.ceil((rawMax + 10) / 10) * 10)
  const yRange = yMax - yMin || 20

  const xAt = (i: number) => PAD.left + (i / (data.length - 1)) * CHART_W
  const yAt = (v: number) => PAD.top + (1 - (v - yMin) / yRange) * CHART_H

  const ctrlPts = data.map((d, i) => `${xAt(i)},${yAt(d.controlRate)}`).join(' ')
  const pressPts = data.map((d, i) => `${xAt(i)},${yAt(d.pressureRate)}`).join(' ')

  const [firstCtrl, ...restCtrl] = ctrlPts.split(' ')
  const lastX = xAt(data.length - 1)
  const baseY = yAt(yMin)
  const ctrlArea = `M ${firstCtrl} L ${restCtrl.join(' L ')} L ${lastX},${baseY} L ${PAD.left},${baseY} Z`

  const gridVals = [25, 50, 75].filter(v => v > yMin && v < yMax)

  const xLabelIdxs: number[] = [0]
  if (data.length > 4) xLabelIdxs.push(Math.floor((data.length - 1) / 2))
  xLabelIdxs.push(data.length - 1)

  const lastCtrl = data[data.length - 1].controlRate
  const lastCx = xAt(data.length - 1)
  const lastCy = yAt(lastCtrl)

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" aria-hidden="true">
      {/* grid lines */}
      {gridVals.map(v => (
        <g key={v}>
          <line
            x1={PAD.left} y1={yAt(v)} x2={PAD.left + CHART_W} y2={yAt(v)}
            stroke="currentColor" strokeWidth="1" strokeOpacity="0.07"
          />
          <text x={PAD.left - 5} y={yAt(v) + 3.5} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.3">
            {v}%
          </text>
        </g>
      ))}

      {/* area under control rate */}
      <path d={ctrlArea} fill="rgba(52,211,153,0.07)" />

      {/* under-pressure dashed line */}
      <polyline
        points={pressPts}
        fill="none"
        stroke="rgba(244,63,94,0.45)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* control rate solid line */}
      <polyline
        points={ctrlPts}
        fill="none"
        stroke="rgb(52,211,153)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* dots */}
      {data.map((d, i) => {
        const isLast = i === data.length - 1
        return (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(d.controlRate)}
            r={isLast ? 4.5 : 2.5}
            fill="rgb(52,211,153)"
            fillOpacity={isLast ? 1 : 0.55}
          />
        )
      })}

      {/* last value callout */}
      <text
        x={lastCx}
        y={lastCy - 10}
        textAnchor={lastCx > PAD.left + CHART_W * 0.85 ? 'end' : 'middle'}
        fontSize="10"
        fill="rgb(52,211,153)"
        fontWeight="700"
      >
        {lastCtrl}%
      </text>

      {/* x-axis date labels */}
      {xLabelIdxs.map(i => {
        const d = new Date(data[i].createdAt)
        const label = d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
        return (
          <text
            key={i}
            x={xAt(i)}
            y={PAD.top + CHART_H + 17}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
            opacity="0.35"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}
