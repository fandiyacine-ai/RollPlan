'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { correctMatchResult } from './actions'

const RESULT_OPTIONS = [
  { winner: 'user' as const,     method: 'submission', label: 'W — Submission' },
  { winner: 'user' as const,     method: 'points',     label: 'W — Points' },
  { winner: 'user' as const,     method: 'dq',         label: 'W — DQ' },
  { winner: 'user' as const,     method: null,         label: 'W — Other' },
  { winner: 'opponent' as const, method: 'submission', label: 'L — Submission' },
  { winner: 'opponent' as const, method: 'points',     label: 'L — Points' },
  { winner: 'opponent' as const, method: 'dq',         label: 'L — DQ' },
  { winner: 'opponent' as const, method: null,         label: 'L — Other' },
]

export function CorrectResultButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function apply(winner: 'user' | 'opponent' | null, method: string | null) {
    setPending(true)
    setOpen(false)
    await correctMatchResult(matchId, winner, method)
    setPending(false)
    router.refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        title="Correct result"
      >
        Wrong result?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
            {RESULT_OPTIONS.map(opt => (
              <button
                key={`${opt.winner}-${opt.method}`}
                onClick={() => apply(opt.winner, opt.method)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                {opt.label}
              </button>
            ))}
            <div className="border-t border-border/50 mt-1 pt-1">
              <button
                onClick={() => apply(null, null)}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                Clear result
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
