'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTournament, deleteTournament } from './actions'

export function DeleteTournamentButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  return (
    <button
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Delete this tournament and all its opponents? This cannot be undone.')) return
        setPending(true)
        await deleteTournament(id)
        router.refresh()
      }}
      disabled={pending}
      aria-label="Delete tournament"
      className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>
  )
}

const RULESET_OPTIONS = [
  { value: 'ibjjf', label: 'IBJJF' },
  { value: 'ajp', label: 'AJP' },
  { value: 'adcc', label: 'ADCC' },
  { value: 'ebi', label: 'EBI' },
  { value: 'other', label: 'Other' },
]

export function CreateTournamentForm() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-4 py-2 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
      >
        + New Tournament
      </button>
    )
  }

  return (
    <form
      action={async (fd) => {
        setPending(true)
        setError(null)
        const result = await createTournament(fd)
        if (result.error) {
          setError(result.error)
          setPending(false)
        } else if (result.tournamentId) {
          router.push(`/tournaments/${result.tournamentId}/opponents`)
        }
      }}
      className="rounded-lg border p-5 space-y-4 max-w-lg"
    >
      <h2 className="font-semibold">New Tournament</h2>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Name *</label>
        <input
          name="name"
          required
          placeholder="e.g. AJP Grand Slam Abu Dhabi"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Event Date</label>
          <input
            name="eventDate"
            type="date"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Ruleset</label>
          <select
            name="ruleset"
            defaultValue="ibjjf"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {RULESET_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Division</label>
        <input
          name="division"
          placeholder="e.g. Adult Male Black Belt –85 kg"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Notes</label>
        <textarea
          name="notes"
          rows={2}
          placeholder="Any context about this tournament"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm px-4 py-2 rounded-full border font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="text-sm px-4 py-2 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}
