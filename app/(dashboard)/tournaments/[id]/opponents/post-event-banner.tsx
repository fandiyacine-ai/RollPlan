'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveTournamentOutcome } from '../../actions'

const OUTCOMES = [
  { value: 'gold',       label: '🥇 Gold' },
  { value: 'silver',     label: '🥈 Silver' },
  { value: 'bronze',     label: '🥉 Bronze' },
  { value: 'eliminated', label: 'Lost' },
  { value: 'dns',        label: 'Didn\'t compete' },
]

export function PostEventBanner({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string
  tournamentName: string
}) {
  const [dismissed, setDismissed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (dismissed) return null

  async function submit() {
    if (!selected) return
    setPending(true)
    setError(null)
    const result = await saveTournamentOutcome(tournamentId, selected, notes)
    if (result.error) {
      setError(result.error)
      setPending(false)
    } else {
      router.refresh()
    }
  }

  return (
    <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">How did {tournamentName} go?</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your event date has passed — close the loop.</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map(o => (
          <button
            key={o.value}
            onClick={() => setSelected(o.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              selected === o.value
                ? 'border-amber-600 bg-amber-900/40 text-amber-300 font-medium'
                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="What surprised you most? (optional)"
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={pending}
              className="text-xs px-4 py-1.5 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
