'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { syncBracketResults } from './actions'

export function SyncBracketButton({ tournamentId }: { tournamentId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setState('loading')
    setMessage(null)
    const result = await syncBracketResults(tournamentId)
    if (result.error) {
      setState('error')
      setMessage(result.error)
    } else {
      setState('done')
      setMessage(result.updated === 0 ? 'No new results found in bracket.' : `${result.updated} result${result.updated !== 1 ? 's' : ''} synced from bracket.`)
      router.refresh()
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={state === 'loading'}
        className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        {state === 'loading' ? (
          <>
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Syncing…
          </>
        ) : 'Sync results from bracket'}
      </button>
      {message && (
        <span className={`text-xs ${state === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
