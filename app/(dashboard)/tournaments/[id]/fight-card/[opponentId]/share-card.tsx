'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

export type ShareCardData = {
  userName: string
  opponentName: string
  opponentPhotoUrl?: string | null
  tournamentName: string
  eventDate?: string | null
  ruleset?: string | null
  division?: string | null
  weightClass?: string | null
  // user record
  ownTotal: number
  ownWins: number
  ownRecord?: string | null        // AJP / SC / IBJJF composite
  // opponent record
  scoutedMatches: number
  oppAjpRecord?: string | null
  oppScRecord?: string | null
  oppIbjjfBest?: string | null
  // gameplan card
  openWith?: string | null
  watchOut?: string | null
  attackChain?: string[]
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

function detectFederation(name: string): string[] {
  const n = name.toUpperCase()
  const tags: string[] = []
  if (n.includes('AJP') || n.includes('ADCC') || n.includes('ABU DHABI')) tags.push('AJP')
  if (n.includes('IBJJF') || n.includes('WORLD') || n.includes('EUROPEAN') || n.includes('COPA') || n.includes('PANS')) tags.push('IBJJF')
  if (n.includes('NAGA') || n.includes('GRAPPLERS')) tags.push('NAGA')
  if (n.includes('UFC') || n.includes('EBI')) tags.push('EBI')
  return tags
}

export function ShareButton({ data }: { data: ShareCardData }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  async function handleDownload() {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: '#0f1117',
      })
      const link = document.createElement('a')
      link.download = `rollplan-fight-card-${data.opponentName.replace(/\s+/g, '-').toLowerCase()}.png`
      link.href = dataUrl
      link.click()
    } finally {
      setDownloading(false)
    }
  }

  const fedTags = detectFederation(data.tournamentName)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors border border-border/40 hover:border-border rounded-lg px-3 py-1.5"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4.5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v8a1 1 0 001 1h1.5" />
          <rect x="5" y="6" width="9" height="8" rx="1" />
        </svg>
        Share card
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="flex flex-col items-center gap-4 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* The exportable card — fixed 400×533 (3:4) */}
            <div
              ref={cardRef}
              style={{
                width: 400,
                minHeight: 533,
                fontFamily: 'system-ui, sans-serif',
                background: 'linear-gradient(160deg, #0c0e14 0%, #111827 50%, #0c0e14 100%)',
                borderRadius: 16,
                overflow: 'hidden',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {/* Side accent strips */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, background: 'linear-gradient(to bottom, #34d399, #059669)' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 4, background: 'linear-gradient(to bottom, #fb7185, #e11d48)' }} />

              {/* Header */}
              <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase' }}>Fight Card</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {fedTags.map(tag => (
                      <span key={tag} style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{tag}</span>
                    ))}
                    {data.ruleset && (
                      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{data.ruleset}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>{data.tournamentName}</div>
                {(data.eventDate || data.division || data.weightClass) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    {data.eventDate && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{fmtDate(data.eventDate)}</span>}
                    {data.division && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>·</span>}
                    {data.division && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{data.division}</span>}
                    {data.weightClass && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>·</span>}
                    {data.weightClass && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{data.weightClass}</span>}
                  </div>
                )}
              </div>

              {/* Athletes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, padding: '28px 22px 24px' }}>
                {/* User */}
                <div>
                  <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: 'rgba(52,211,153,0.65)', textTransform: 'uppercase', marginBottom: 6 }}>You</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 0.9, letterSpacing: '-0.01em', textTransform: 'uppercase', marginBottom: 8 }}>{data.userName}</div>
                  {data.ownTotal > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#34d399' }}>{data.ownWins}W</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>{data.ownTotal - data.ownWins}L</span>
                      </div>
                      {data.ownRecord && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>{data.ownRecord}</span>}
                    </div>
                  )}
                </div>

                {/* VS */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 8, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>vs</span>
                  </div>
                </div>

                {/* Opponent */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: 'rgba(251,113,133,0.65)', textTransform: 'uppercase', marginBottom: 6 }}>Opponent</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 0.9, letterSpacing: '-0.01em', textTransform: 'uppercase', marginBottom: 8 }}>{data.opponentName}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    {(data.oppAjpRecord || data.oppScRecord) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {(data.oppAjpRecord || data.oppScRecord)?.split(' ').filter(p => p.includes('W') || p.includes('L')).map((part, i) => (
                          <span key={i} style={{ fontSize: 13, fontWeight: 800, color: part.includes('W') ? '#fb7185' : 'rgba(255,255,255,0.3)' }}>{part}</span>
                        ))}
                      </div>
                    )}
                    {data.oppAjpRecord && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>AJP {data.oppAjpRecord}</span>}
                    {data.oppScRecord && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>SC {data.oppScRecord}</span>}
                    {data.oppIbjjfBest && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>IBJJF {data.oppIbjjfBest}</span>}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 22px' }} />

              {/* Gameplan strip */}
              {(data.openWith || data.watchOut || (data.attackChain && data.attackChain.length > 0)) && (
                <div style={{ padding: '16px 22px' }}>
                  {(data.openWith || data.watchOut) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: data.attackChain?.length ? 12 : 0 }}>
                      {data.openWith && (
                        <div style={{ background: 'rgba(52,211,153,0.07)', borderLeft: '2px solid #34d399', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: '0.2em', color: '#34d399', textTransform: 'uppercase', marginBottom: 4 }}>Open with</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', lineHeight: 1.35 }}>{data.openWith}</div>
                        </div>
                      )}
                      {data.watchOut && (
                        <div style={{ background: 'rgba(251,113,133,0.07)', borderLeft: '2px solid #fb7185', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: '0.2em', color: '#fb7185', textTransform: 'uppercase', marginBottom: 4 }}>Watch out</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(251,113,133,0.75)', lineHeight: 1.35 }}>{data.watchOut}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {data.attackChain && data.attackChain.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginRight: 2 }}>Chain</span>
                      {data.attackChain.slice(0, 4).map((step, i, arr) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 8px', color: 'rgba(255,255,255,0.7)' }}>{step}</span>
                          {i < arr.length - 1 && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>→</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Powered by footer */}
              <div style={{ padding: '12px 22px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>Powered by</span>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.5)', marginLeft: 5, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Roll</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>plan.ai</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-zinc-900 text-sm font-bold rounded-xl hover:bg-zinc-100 disabled:opacity-50 transition-colors"
              >
                {downloading ? 'Saving…' : '↓ Download PNG'}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
