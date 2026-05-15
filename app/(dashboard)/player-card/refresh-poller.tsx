'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function RefreshPoller() {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(id)
  }, [router])

  return (
    <div className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      Analysis in progress — this page will update automatically.
    </div>
  )
}
