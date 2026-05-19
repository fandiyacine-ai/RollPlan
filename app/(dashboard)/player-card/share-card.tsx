import React from 'react'

export type ShareCardData = {
  name: string
  belt: string | null
  gym: string | null
  controlPct: number
  underPressurePct: number
  matchCount: number
  totalMatSeconds: number
  strongPositions: { name: string; dominantPct: number }[]
  exposedPositions: { name: string; inferiorPct: number }[]
}

function fmt(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  const sec = Math.round(s % 60)
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const BELT_COLOR: Record<string, string> = {
  white: '#e4e4e7', blue: '#2563eb', purple: '#9333ea',
  brown: '#92400e', black: '#27272a',
  grey: '#9ca3af', yellow: '#facc15', orange: '#fb923c', green: '#16a34a',
}

function archetype(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 62) return { label: 'Dominator', color: '#4ade80', bg: 'rgba(74,222,128,0.10)' }
  if (pct >= 48) return { label: 'Balanced Fighter', color: '#818cf8', bg: 'rgba(129,140,248,0.10)' }
  return { label: 'Guard Specialist', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' }
}

// SVG arc gauge
function ArcGauge({ pct, pressurePct }: { pct: number; pressurePct: number }) {
  const cx = 100, cy = 100
  const R = 80, r2 = 62
  const C1 = 2 * Math.PI * R
  const C2 = 2 * Math.PI * r2

  const fill1 = (C1 * pct / 100).toFixed(2)
  const gap1 = (C1 * (1 - pct / 100)).toFixed(2)
  const fill2 = (C2 * pressurePct / 100).toFixed(2)
  const gap2 = (C2 * (1 - pressurePct / 100)).toFixed(2)

  const gaugeColor = pct >= 55 ? '#4ade80' : pct < 38 ? '#f87171' : '#818cf8'

  return (
    <svg width={200} height={200} viewBox="0 0 200 200" style={{ flexShrink: 0 }}>
      {/* Outer glow halo */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={gaugeColor} strokeWidth={28} opacity={0.04} />
      {/* Track */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} />
      {/* Control arc */}
      <circle
        cx={cx} cy={cy} r={R} fill="none"
        stroke={gaugeColor} strokeWidth={12}
        strokeDasharray={`${fill1} ${gap1}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Inner track */}
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={7} />
      {/* Pressure arc */}
      <circle
        cx={cx} cy={cy} r={r2} fill="none"
        stroke="#f87171" strokeWidth={7}
        strokeDasharray={`${fill2} ${gap2}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Center labels */}
      <text x={cx} y={90} textAnchor="middle" fontSize={34} fontWeight={900} fill={gaugeColor}
        style={{ fontFamily: 'system-ui, sans-serif' }}>{pct}%</text>
      <text x={cx} y={107} textAnchor="middle" fontSize={9.5} fill="rgba(255,255,255,0.28)"
        style={{ fontFamily: 'system-ui, sans-serif' }}>control rate</text>
      {pressurePct > 0 && (
        <text x={cx} y={122} textAnchor="middle" fontSize={8.5} fill="rgba(248,113,113,0.55)"
          style={{ fontFamily: 'system-ui, sans-serif' }}>{pressurePct}% under pressure</text>
      )}
    </svg>
  )
}

export function ShareCard({ data, innerRef }: { data: ShareCardData; innerRef?: React.RefObject<HTMLDivElement | null> }) {
  const beltColor = data.belt ? (BELT_COLOR[data.belt] ?? '#4b5563') : null
  const arch = archetype(data.controlPct)

  return (
    <div
      ref={innerRef}
      style={{
        width: 540,
        height: 540,
        background: '#09090d',
        borderRadius: 20,
        padding: '26px 30px 22px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#f4f4f5',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Background glow blobs */}
      <div style={{
        position: 'absolute', top: -100, right: -100,
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(74,222,128,0.055) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -80,
        width: 240, height: 240, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(129,140,248,0.055) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Top bar: brand + archetype */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#27272a', textTransform: 'uppercase' }}>
          RollPlan
        </div>
        <div style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase',
          color: arch.color, background: arch.bg,
          padding: '4px 11px', borderRadius: 20,
          border: `1px solid ${arch.color}28`,
        }}>
          {arch.label}
        </div>
      </div>

      {/* Profile row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'rgba(99,102,241,0.14)',
          border: '1.5px solid rgba(99,102,241,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#a5b4fc', flexShrink: 0,
        }}>
          {initials(data.name)}
        </div>
        <div>
          <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{data.name}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            {beltColor && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: beltColor, display: 'inline-block' }} />
                {data.belt!.charAt(0).toUpperCase() + data.belt!.slice(1)} Belt
              </span>
            )}
            {data.gym && <span>· {data.gym}</span>}
          </div>
        </div>
      </div>

      {/* Gauge + side stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
        <ArcGauge pct={data.controlPct} pressurePct={data.underPressurePct} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {([
            { label: 'Matches', value: String(data.matchCount) },
            { label: 'Mat Time', value: fmt(data.totalMatSeconds) },
          ] as const).map(stat => (
            <div key={stat.label} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '10px 16px',
            }}>
              <div style={{ fontSize: 9, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>{stat.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#e4e4e7', lineHeight: 1.2, marginTop: 2 }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Arsenal + Exposed */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{
          flex: 1, background: 'rgba(16,185,129,0.04)',
          border: '1px solid rgba(16,185,129,0.12)', borderRadius: 14, padding: '11px 14px',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2.2, textTransform: 'uppercase', color: '#10b981', marginBottom: 9 }}>
            Arsenal
          </div>
          {data.strongPositions.slice(0, 3).length > 0 ? data.strongPositions.slice(0, 3).map(pos => {
            const pct = Math.round(pos.dominantPct * 100)
            return (
              <div key={pos.name} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: '#d4d4d8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{pos.name}</span>
                  <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: '#10b981', borderRadius: 2 }} />
                </div>
              </div>
            )
          }) : <div style={{ fontSize: 10, color: '#27272a', marginTop: 4 }}>Not enough data yet</div>}
        </div>

        <div style={{
          flex: 1, background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.12)', borderRadius: 14, padding: '11px 14px',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 2.2, textTransform: 'uppercase', color: '#ef4444', marginBottom: 9 }}>
            Exposed
          </div>
          {data.exposedPositions.slice(0, 3).length > 0 ? data.exposedPositions.slice(0, 3).map(pos => {
            const pct = Math.round(pos.inferiorPct * 100)
            return (
              <div key={pos.name} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: '#d4d4d8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{pos.name}</span>
                  <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: '#ef4444', borderRadius: 2 }} />
                </div>
              </div>
            )
          }) : <div style={{ fontSize: 10, color: '#27272a', marginTop: 4 }}>Not enough data yet</div>}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ fontSize: 9, color: '#27272a' }}>
          {data.matchCount} match{data.matchCount !== 1 ? 'es' : ''} · {fmt(data.totalMatSeconds)} mat time
        </div>
        <div style={{ fontSize: 8.5, color: '#1c1c22', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          rollplan.app
        </div>
      </div>
    </div>
  )
}
