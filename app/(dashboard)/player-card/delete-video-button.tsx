'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { deleteVideo } from './actions'

export function DeleteVideoButton({ videoId }: { videoId: string }) {
  const [pending, setPending] = useState(false)

  return (
    <button
      onClick={async () => {
        if (!confirm('Remove this failed entry?')) return
        setPending(true)
        const result = await deleteVideo(videoId)
        if (result.error) {
          toast.error(`Failed: ${result.error}`)
          setPending(false)
        }
      }}
      disabled={pending}
      aria-label="Delete"
      className="text-xs px-2.5 py-1 rounded-full border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      {pending ? '…' : 'Remove'}
    </button>
  )
}
