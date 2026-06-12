import { ImageResponse } from 'next/og'

export const alt = 'RollPlan — AI BJJ Match Analysis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 110,
            fontWeight: 700,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          Roll<span style={{ color: '#4ade80' }}>Plan</span>
        </div>
        <div style={{ fontSize: 34, marginTop: 28, color: '#a1a1aa', display: 'flex' }}>
          AI BJJ Match Analysis &amp; Opponent Scouting
        </div>
        <div
          style={{
            fontSize: 22,
            marginTop: 40,
            color: '#4ade80',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4ade80' }} />
          Every frame tells the truth
        </div>
      </div>
    ),
    { ...size }
  )
}
