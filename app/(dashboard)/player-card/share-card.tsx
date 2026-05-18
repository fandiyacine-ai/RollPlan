import React from 'react'

export type ShareCardData = {
  name: string
  belt: string | null
  gym: string | null
  controlPct: number
  matchCount: number
  totalMatSeconds: number
  topPositions: { name: string; dominantPct: number }[]
}

function fmt(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  const sec = Math.round(s % 60)
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

const BELT_COLOR: Record<string, string> = {
  white: '#e4e4e7',
  blue: '#2563eb',
  purple: '#9333ea',
  brown: '#92400e',
  black: '#18181b',
}

export function ShareCard({ data, innerRef }: { data: ShareCardData; innerRef?: React.RefObject<HTMLDivElement | null> }) {
  const beltColor = data.belt ? (BELT_COLOR[data.belt] ?? '#4b5563') : null

  return (
    <div
      ref={innerRef}
      style={{
        width: 600,
        height: 315,
        background: 'linear-gradient(135deg, #0d0d1a 0%, #111827 100%)',
        borderRadius: 16,
        padding: '28px 32px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#f4f4f5',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Background accent */}
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 240, height: 240,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(99,102,241,0.2)',
              border: '1.5px solid rgba(99,102,241,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#a5b4fc',
              flexShrink: 0,
            }}>
              {data.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px' }}>{data.name}</div>
              {(data.belt || data.gym) && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {beltColor && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: beltColor, display: 'inline-block' }} />
                      {data.belt!.charAt(0).toUpperCase() + data.belt!.slice(1)} Belt
                    </span>
                  )}
                  {data.gym && <span style={{ color: '#6b7280' }}>· {data.gym}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase' }}>
            Frame<span style={{ color: '#4b5563' }}>Matters</span>
          </div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>BJJ Analytics</div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        {[
          { label: 'Control Rate', value: `${data.controlPct}%`, accent: data.controlPct >= 55 ? '#4ade80' : data.controlPct < 35 ? '#f87171' : '#f4f4f5' },
          { label: 'Matches', value: String(data.matchCount), accent: '#f4f4f5' },
          { label: 'Mat Time', value: fmt(data.totalMatSeconds), accent: '#f4f4f5' },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{stat.label}</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-1px', color: stat.accent, marginTop: 4, lineHeight: 1 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Top positions */}
      {data.topPositions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>
            Top Positions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.topPositions.slice(0, 3).map(pos => {
              const pct = Math.round(pos.dominantPct * 100)
              const barColor = pct >= 50 ? '#4ade80' : pct >= 30 ? '#facc15' : '#f87171'
              return (
                <div key={pos.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 130, fontSize: 11, color: '#d1d5db', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pos.name}</div>
                  <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3 }} />
                  </div>
                  <div style={{ width: 28, fontSize: 10, color: '#9ca3af', textAlign: 'right', fontWeight: 600 }}>{pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
