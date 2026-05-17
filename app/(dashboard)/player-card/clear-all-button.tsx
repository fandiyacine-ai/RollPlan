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
      className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-500 font-medium hover:border-rose-800/60 hover:text-rose-400 transition-colors disabled:opacity-40"
    >
      {pending ? 'Clearing…' : 'Clear all data'}
    </button>
  )
}
