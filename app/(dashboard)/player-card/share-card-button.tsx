'use client'

import { useEffect, useRef, useState } from 'react'
import { ShareCard, type ShareCardData } from './share-card'

export function ShareCardButton({ data }: { data: ShareCardData }) {
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
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: '#f4f4f5',
      })
      const filename = `rollplan-${data.name.replace(/\s+/g, '-').toLowerCase()}-player-card.png`

      if (canNativeShare) {
        try {
          const blob = await (await fetch(dataUrl)).blob()
          const file = new File([blob], filename, { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('share-timeout')), 15000))
            await Promise.race([navigator.share({
              files: [file],
              title: `${data.name} — Player Card`,
              text: `My player card — powered by RollPlan.AI`,
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

            <div style={{ flexShrink: 0 }}>
              <ShareCard data={data} innerRef={cardRef} />
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
