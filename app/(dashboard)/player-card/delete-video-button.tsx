'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { deleteVideo } from './actions'
import { Button } from '@/components/ui/button'

export function DeleteVideoButton({ videoId }: { videoId: string }) {
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-destructive"
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
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </Button>
  )
}
