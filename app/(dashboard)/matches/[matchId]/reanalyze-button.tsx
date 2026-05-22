'use client'

import { useState } from 'react'

export function ReanalyzeButton({ matchId }: { matchId: string }) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick() {
    if (!confirm('This will wipe all position segments, events, and insights for this match and re-run the full analysis pipeline. Continue?')) return
    setRunning(true)
    try {
      const res = await fetch('/api/admin/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      })
      if (res.ok) {
        setDone(true)
        setTimeout(() => window.location.reload(), 1500)
      }
    } finally {
      if (!done) setRunning(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={running || done}
      className="text-[10px] text-amber-500/70 hover:text-amber-400 underline disabled:opacity-40 disabled:cursor-wait"
    >
      {done ? 'Queued — reloading…' : running ? 'Queueing…' : 'Re-analyse with KB'}
    </button>
  )
}
