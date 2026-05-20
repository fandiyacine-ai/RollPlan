'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Polls router.refresh() every `intervalMs` while mounted.
// The parent server component only renders this when scans are in progress,
// so polling automatically stops once the page re-renders with no pending work.
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
