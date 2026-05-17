'use client'

import { useState } from 'react'
import { deleteMatch } from './actions'

export function DeleteMatchButton({ matchId, videoId }: { matchId: string; videoId: string }) {
  const [pending, setPending] = useState(false)

  return (
    <button
      onClick={async () => {
        if (!confirm('Delete this match record? Segments, events, and insights will be removed. This cannot be undone.')) return
        setPending(true)
        await deleteMatch(matchId, videoId)
      }}
      disabled={pending}
      aria-label="Delete match"
      className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>
  )
}
