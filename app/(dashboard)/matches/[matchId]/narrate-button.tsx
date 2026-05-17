'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function NarrateButton({ matchId, hasNarration }: { matchId: string; hasNarration: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${matchId}/narrate`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Generation failed')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={generate}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Writing report…
          </>
        ) : (
          <>
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-foreground text-background leading-none tracking-wide">AI</span>
            {hasNarration ? 'Regenerate' : 'Generate Match Report'}
          </>
        )}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
