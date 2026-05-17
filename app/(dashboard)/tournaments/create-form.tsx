'use client'

import { useState } from 'react'
import { createTournament } from './actions'

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
        await createTournament(fd)
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
