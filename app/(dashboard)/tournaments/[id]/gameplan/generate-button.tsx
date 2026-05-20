'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateGameplanButton({
  tournamentId,
  opponentId,
  label = 'Generate Gameplan',
}: {
  tournamentId: string
  opponentId: string
  label?: string
}) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleGenerate() {
    setPending(true)
    await fetch('/api/gameplans/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId, opponentId }),
    })
    router.refresh()
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={pending}
      className="text-sm px-4 py-2 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {pending ? 'Starting…' : label}
    </button>
  )
}
