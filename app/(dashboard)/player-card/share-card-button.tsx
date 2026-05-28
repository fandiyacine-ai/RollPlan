'use client'

import { useRef, useState, useEffect } from 'react'
import { ShareCard, type ShareCardData } from './share-card'

export function ShareCardButton({ data }: { data: ShareCardData }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function download() {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        width: 540,
        height: 540,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${data.name.replace(/\s+/g, '-').toLowerCase()}-rollplan.png`
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors font-medium"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        Share Card
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-background border border-border rounded-2xl shadow-2xl p-6 space-y-5 z-10 max-w-2xl w-full">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Your Player Card</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Card preview — uses overflow-x-auto for narrow screens */}
            <div className="overflow-x-auto rounded-xl">
              <ShareCard data={data} innerRef={cardRef} />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={download}
                disabled={downloading}
                className="flex-1 flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-foreground text-background font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {downloading ? (
                  'Generating…'
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download PNG
                  </>
                )}
              </button>
              <p className="text-xs text-muted-foreground">2× retina quality</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
