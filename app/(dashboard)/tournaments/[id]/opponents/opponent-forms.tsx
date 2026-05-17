'use client'

import { useState } from 'react'
import { addOpponent, submitScoutUrls } from './actions'

export function AddOpponentForm({ tournamentId }: { tournamentId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-4 py-2 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
      >
        + Add Opponent
      </button>
    )
  }

  return (
    <form
      action={async (fd) => {
        setPending(true)
        await addOpponent(tournamentId, fd)
        setOpen(false)
        setPending(false)
      }}
      className="rounded-lg border p-4 space-y-3 max-w-md"
    >
      <h3 className="font-semibold text-sm">Add Opponent</h3>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Name *</label>
        <input
          name="name"
          required
          placeholder="e.g. João Silva"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Seeding notes</label>
        <input
          name="notes"
          placeholder="e.g. #3 seed, black belt 5 years"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm px-3 py-1.5 rounded-full border font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="text-sm px-3 py-1.5 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  )
}

export function ScoutForm({
  tournamentId,
  opponentId,
  opponentName,
}: {
  tournamentId: string
  opponentId: string
  opponentName: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  if (done) {
    return <span className="text-xs text-green-700 font-medium">Scanning queued ✓</span>
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 rounded-full border font-medium hover:bg-muted transition-colors"
      >
        Scout footage
      </button>
    )
  }

  return (
    <form
      action={async (fd) => {
        setPending(true)
        await submitScoutUrls(tournamentId, opponentId, fd)
        setOpen(false)
        setDone(true)
      }}
      className="mt-3 space-y-3 rounded-lg border p-4 bg-muted/30"
    >
      <p className="text-xs font-medium">
        Submit footage URLs for <span className="font-semibold">{opponentName}</span>
      </p>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Format</label>
        <select
          name="format"
          defaultValue="gi"
          className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        >
          <option value="gi">Gi</option>
          <option value="no_gi">No-Gi</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Video URLs (one per line, max 10)</label>
        <textarea
          name="urls"
          required
          rows={4}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 rounded-full border font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {pending ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  )
}
