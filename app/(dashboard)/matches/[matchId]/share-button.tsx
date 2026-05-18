'use client'

import { useState, useEffect, useRef } from 'react'

export function ShareButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [includesVideo, setIncludesVideo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const shareUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/match/${token}`
    : ''

  async function openModal() {
    setOpen(true)
    if (token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/matches/${matchId}/share`, { method: 'POST' })
      const data = await res.json()
      setToken(data.shareToken)
      setIncludesVideo(data.shareIncludesVideo ?? false)
    } finally {
      setLoading(false)
    }
  }

  async function toggleVideo(val: boolean) {
    setIncludesVideo(val)
    await fetch(`/api/matches/${matchId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includesVideo: val }),
    })
  }

  async function revoke() {
    setRevoking(true)
    try {
      const res = await fetch(`/api/matches/${matchId}/share`, { method: 'DELETE' })
      const data = await res.json()
      setToken(data.shareToken)
      setIncludesVideo(data.shareIncludesVideo ?? false)
      setCopied(false)
    } finally {
      setRevoking(false)
    }
  }

  function copy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Close on backdrop click or Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors font-medium"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Modal */}
          <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 z-10 sm:mx-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Share this match analysis</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="h-10 flex items-center justify-center text-sm text-muted-foreground">Generating link…</div>
            ) : (
              <>
                {/* URL row */}
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    readOnly
                    value={shareUrl}
                    onClick={() => inputRef.current?.select()}
                    className="flex-1 text-xs bg-muted border border-border rounded-lg px-3 py-2 font-mono text-muted-foreground select-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring truncate"
                  />
                  <button
                    onClick={copy}
                    className={`flex-shrink-0 text-xs px-3 py-2 rounded-lg font-medium transition-all ${
                      copied
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-foreground text-background hover:opacity-90'
                    }`}
                  >
                    {copied ? 'Copied ✓' : 'Copy link'}
                  </button>
                </div>

                {/* Include video toggle */}
                <div className="flex items-center justify-between py-3 border-t border-border/60">
                  <div>
                    <p className="text-sm font-medium">Include video</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Show the video player to people with this link</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={includesVideo}
                    onClick={() => toggleVideo(!includesVideo)}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${includesVideo ? 'bg-foreground' : 'bg-muted border border-border'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-background shadow transition-all ${includesVideo ? 'left-5' : 'left-1'}`} />
                  </button>
                </div>

                {/* Revoke */}
                <div className="border-t border-border/60 pt-3">
                  <button
                    onClick={revoke}
                    disabled={revoking}
                    className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-40"
                  >
                    {revoking ? 'Revoking…' : 'Revoke link and generate a new one'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
