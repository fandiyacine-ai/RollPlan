'use client'

import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { condenseMedals } from '@/lib/tournament-utils'
import { LogoMark } from '@/components/logo-mark'

export type ShareCardData = {
  userName: string
  opponentName: string
  tournamentName: string
  eventDate?: string | null
  ruleset?: string | null
  division?: string | null
  weightClass?: string | null
  ownAjpRecord?: string | null
  ownScRecord?: string | null
  ownIbjjfBest?: string | null
  oppAjpRecord?: string | null
  oppScRecord?: string | null
  oppIbjjfBest?: string | null
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

function detectFedTags(name: string): string[] {
  const n = name.toUpperCase()
  const tags: string[] = []
  if (n.includes('AJP') || n.includes('ABU DHABI') || n.includes('ADCC')) tags.push('AJP')
  if (n.includes('IBJJF') || n.includes('WORLD') || n.includes('EUROPEAN') || n.includes('COPA') || n.includes('PANS')) tags.push('IBJJF')
  if (n.includes('NAGA')) tags.push('NAGA')
  return tags
}

export function ShareButton({ data }: { data: ShareCardData }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  function triggerDownload(dataUrl: string, filename: string) {
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
  }

  async function handleShare() {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: '#f4f4f5',
      })
      const filename = `rollplan-${data.userName.replace(/\s+/g, '-').toLowerCase()}-vs-${data.opponentName.replace(/\s+/g, '-').toLowerCase()}.png`

      if (canNativeShare) {
        try {
          const blob = await (await fetch(dataUrl)).blob()
          const file = new File([blob], filename, { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('share-timeout')), 15000))
            await Promise.race([navigator.share({
              files: [file],
              title: `${data.userName} vs ${data.opponentName}`,
              text: `Fight card for ${data.tournamentName} — powered by RollPlan.AI`,
            }), timeout])
            return
          }
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return
          // share failed, hung, or timed out — fall through to download below
        }
      }

      triggerDownload(dataUrl, filename)
    } finally {
      setDownloading(false)
    }
  }

  const fedTags = detectFedTags(data.tournamentName)
  const oppBestRecord = data.oppAjpRecord ?? data.oppScRecord ?? null
  const oppRecordSource = data.oppAjpRecord ? 'AJP' : data.oppScRecord ? 'SC' : null
  const ownBestRecord = data.ownAjpRecord ?? data.ownScRecord ?? null
  const ownRecordSource = data.ownAjpRecord ? 'AJP' : data.ownScRecord ? 'SC' : null

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

            {/* Exportable card — 400×500 portrait poster */}
            <div
              ref={cardRef}
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

              {/* Tournament header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase' }}>Fight Card</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {fedTags.map(tag => (
                      <span key={tag} style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, padding: '2px 7px', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase' }}>{tag}</span>
                    ))}
                    {data.ruleset && !fedTags.includes(data.ruleset.toUpperCase()) && (
                      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, padding: '2px 7px', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase' }}>{data.ruleset}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.75)', lineHeight: 1.3 }}>{data.tournamentName}</div>
                {(data.eventDate || data.division || data.weightClass) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    {data.eventDate && <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>{fmtDate(data.eventDate)}</span>}
                    {data.division && <><span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 10 }}>·</span><span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>{data.division}</span></>}
                    {data.weightClass && <><span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 10 }}>·</span><span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>{data.weightClass}</span></>}
                  </div>
                )}
              </div>

              {/* You */}
              <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: '#1D4FA8', textTransform: 'uppercase', marginBottom: 8 }}>You</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#18181b', lineHeight: 0.88, textTransform: 'uppercase', letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
                  {data.userName}
                </div>
                {ownBestRecord && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    {ownRecordSource && <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{ownRecordSource}</span>}
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#1D4FA8' }}>{ownBestRecord.split(' ')[0]}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(0,0,0,0.3)' }}>{ownBestRecord.split(' ')[1]}</span>
                  </div>
                )}
                {data.ownIbjjfBest && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>IBJJF · {condenseMedals(data.ownIbjjfBest) ?? data.ownIbjjfBest}</span>
                  </div>
                )}
              </div>

              {/* VS divider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 24px' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.07)' }} />
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1.5px solid rgba(225,29,72,0.3)', background: 'rgba(225,29,72,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 12px', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#e11d48', letterSpacing: '0.08em', textTransform: 'uppercase' }}>VS</span>
                </div>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.07)' }} />
              </div>

              {/* Opponent */}
              <div style={{ padding: '20px 24px 24px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.3em', color: '#e11d48', textTransform: 'uppercase', marginBottom: 8 }}>Opponent</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#18181b', lineHeight: 0.88, textTransform: 'uppercase', letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
                  {data.opponentName}
                </div>
                {oppBestRecord && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    {oppRecordSource && <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{oppRecordSource}</span>}
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#e11d48' }}>{oppBestRecord.split(' ')[0]}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(0,0,0,0.3)' }}>{oppBestRecord.split(' ')[1]}</span>
                  </div>
                )}
                {data.oppIbjjfBest && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>IBJJF · {condenseMedals(data.oppIbjjfBest) ?? data.oppIbjjfBest}</span>
                  </div>
                )}
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

            {/* Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleShare}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-zinc-900 text-sm font-bold rounded-xl hover:bg-zinc-100 disabled:opacity-50 transition-colors"
              >
                {downloading ? 'Preparing…' : canNativeShare ? '↑ Share card' : '↓ Download PNG'}
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
