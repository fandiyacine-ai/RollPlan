'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteAllPlayerData } from './actions'

export function ClearAllButton() {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  return (
    <button
      onClick={async () => {
        if (!confirm('Delete ALL matches, videos, segments, events, and insights? This cannot be undone.')) return
        setPending(true)
        const id = toast.loading('Deleting all data…')
        const result = await deleteAllPlayerData()
        if (result.error) {
          toast.error(`Failed: ${result.error}`, { id })
          setPending(false)
        } else {
          toast.success('All data deleted', { id })
          router.refresh()
          setPending(false)
        }
      }}
      disabled={pending}
      className="text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      {pending ? 'Clearing…' : 'Clear all data'}
    </button>
  )
}
