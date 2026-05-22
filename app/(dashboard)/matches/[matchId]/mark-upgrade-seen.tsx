'use client'

import { useEffect } from 'react'

export function MarkUpgradeSeen({ matchId }: { matchId: string }) {
  useEffect(() => {
    fetch(`/api/matches/${matchId}/seen-upgrade`, { method: 'POST' }).catch(() => {})
  }, [matchId])
  return null
}
