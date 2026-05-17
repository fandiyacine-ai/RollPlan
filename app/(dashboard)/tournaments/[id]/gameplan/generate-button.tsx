'use client'

import { useState } from 'react'

export function GenerateGameplanButton({
  tournamentId,
  opponentId,
}: {
  tournamentId: string
  opponentId: string
}) {
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function handleGenerate() {
    setPending(true)
    const res = await fetch('/api/gameplans/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId, opponentId }),
    })
    setPending(false)
    if (res.ok) setDone(true)
  }

  if (done) {
    return (
      <p className="text-sm text-green-700 font-medium">
        Gameplan generation queued — refresh in ~30 seconds.
      </p>
    )
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={pending}
      className="text-sm px-4 py-2 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {pending ? 'Queuing…' : 'Generate Gameplan'}
    </button>
  )
}
