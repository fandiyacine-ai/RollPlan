'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteAllPlayerData } from './actions'
import { Button } from '@/components/ui/button'

export function ClearAllButton() {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive"
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
    >
      {pending ? 'Clearing…' : 'Clear all data'}
    </Button>
  )
}
