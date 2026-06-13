import React from 'react'
import { LogoMark } from '../../../components/logo-mark'

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

const BELT_COLOR: Record<string, string> = {
  white: '#a1a1aa', blue: '#2563eb', purple: '#9333ea',
  brown: '#92400e', black: '#27272a',
  grey: '#71717a', yellow: '#ca8a04', orange: '#ea580c', green: '#16a34a',
}

function archetype(pct: number): { label: string } {
  if (pct >= 62) return { label: 'Dominator' }
  if (pct >= 48) return { label: 'Balanced Fighter' }
  return { label: 'Guard Specialist' }
}

export function ShareCard({ data, innerRef }: { data: ShareCardData; innerRef?: React.RefObject<HTMLDivElement | null> }) {
  const beltColor = data.belt ? (BELT_COLOR[data.belt] ?? '#71717a') : null
  const arch = archetype(data.controlPct)
  const arsenal = data.strongPositions.slice(0, 3)
  const exposed = data.exposedPositions.slice(0, 3)

  return (
    <div
      ref={innerRef}
      style={{
        width: 400,
        background: '#f4f4f5',
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Left accent strip */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, background: 'linear-gradient(to bottom, #60a5fa, #1D4FA8)' }} />
      {/* Right accent strip */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 4, background: 'linear-gradient(to bottom, #fb7185, #e11d48)' }} />

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase' }}>Player Card</span>
          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, padding: '2px 7px', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase' }}>{arch.label}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.75)', lineHeight: 1.3 }}>
          {data.name}
        </div>
        {(data.belt || data.gym) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {data.belt && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: beltColor ?? undefined, display: 'inline-block' }} />
                {data.belt.charAt(0).toUpperCase() + data.belt.slice(1)} Belt
              </span>
            )}
            {data.gym && <><span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 10 }}>·</span><span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>{data.gym}</span></>}
          </div>
        )}
      </div>

      {/* Control / record */}
      <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: '#1D4FA8', textTransform: 'uppercase', marginBottom: 8 }}>Control rate</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: '#18181b', lineHeight: 0.88, letterSpacing: '-0.01em' }}>
          {data.controlPct}<span style={{ fontSize: 22 }}>%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#18181b' }}>{data.matchCount}</span>
            <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginLeft: 5 }}>match{data.matchCount !== 1 ? 'es' : ''}</span>
          </div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#18181b' }}>{fmt(data.totalMatSeconds)}</span>
            <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginLeft: 5 }}>mat time</span>
          </div>
          {data.underPressurePct > 0 && (
            <div>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#e11d48' }}>{data.underPressurePct}%</span>
              <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginLeft: 5 }}>under pressure</span>
            </div>
          )}
        </div>
      </div>

      {/* Arsenal */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: '#1D4FA8', textTransform: 'uppercase', marginBottom: 10 }}>Arsenal</div>
        {arsenal.length > 0 ? arsenal.map(pos => {
          const pct = Math.round(pos.dominantPct * 100)
          return (
            <div key={pos.name} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{pos.name}</span>
                <span style={{ fontSize: 11, color: '#1D4FA8', fontWeight: 800 }}>{pct}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#1D4FA8', borderRadius: 2 }} />
              </div>
            </div>
          )
        }) : <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>Not enough data yet</div>}
      </div>

      {/* Exposed */}
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: '#e11d48', textTransform: 'uppercase', marginBottom: 10 }}>Exposed</div>
        {exposed.length > 0 ? exposed.map(pos => {
          const pct = Math.round(pos.inferiorPct * 100)
          return (
            <div key={pos.name} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{pos.name}</span>
                <span style={{ fontSize: 11, color: '#e11d48', fontWeight: 800 }}>{pct}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#e11d48', borderRadius: 2 }} />
              </div>
            </div>
          )
        }) : <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>Not enough data yet</div>}
      </div>

      {/* Powered by footer */}
      <div style={{ padding: '12px 24px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0,0,0,0.25)', textTransform: 'uppercase' }}>Powered by</span>
        <span style={{ color: 'rgba(0,0,0,0.55)', display: 'inline-flex', width: 16, height: 16, marginLeft: 2 }}>
          <LogoMark />
        </span>
        <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>ROLL</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#1D4FA8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>PLAN</span>
        <span style={{ fontSize: 8, fontWeight: 600, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.08em' }}>.AI</span>
      </div>
    </div>
  )
}
