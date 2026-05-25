'use client'

import { useEffect } from 'react'

export default function OpponentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[opponents page error]', error)
  }, [error])

  return (
    <div className="rounded-lg border border-rose-800/50 bg-rose-950/20 p-6 text-center space-y-3">
      <p className="text-sm font-semibold text-rose-400">Failed to load opponents.</p>
      {error.digest && (
        <p className="text-xs text-muted-foreground font-mono">ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="text-xs px-3 py-1.5 rounded border border-rose-800/50 text-rose-400 hover:bg-rose-950/30 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
