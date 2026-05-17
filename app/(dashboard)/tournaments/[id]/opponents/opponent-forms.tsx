'use client'

import { useState } from 'react'
import { addOpponent, submitScoutUrls, deleteOpponent } from './actions'

type AppearanceColor = 'blue_gi' | 'white_gi' | 'black_gi' | 'dark_rash' | 'light_rash' | 'other'
type StartingSide = 'left' | 'right'

const COLOR_OPTIONS: { value: AppearanceColor; label: string; bg: string }[] = [
  { value: 'blue_gi',    label: 'Blue Gi',    bg: 'bg-blue-600' },
  { value: 'white_gi',   label: 'White Gi',   bg: 'bg-white border border-gray-300' },
  { value: 'black_gi',   label: 'Black Gi',   bg: 'bg-neutral-900' },
  { value: 'dark_rash',  label: 'Dark Rash',  bg: 'bg-gray-800' },
  { value: 'light_rash', label: 'Light Rash', bg: 'bg-gray-200 border border-gray-300' },
  { value: 'other',      label: 'Other',      bg: 'bg-gradient-to-br from-purple-400 to-pink-400' },
]

const COLOR_HINT: Record<AppearanceColor, string> = {
  blue_gi: 'blue gi', white_gi: 'white gi', black_gi: 'black gi',
  dark_rash: 'dark rashguard', light_rash: 'light rashguard', other: 'other-coloured kit',
}

function buildAppearanceHint(color: AppearanceColor | null, side: StartingSide | null): string {
  const parts: string[] = []
  if (color) parts.push(COLOR_HINT[color])
  if (side) parts.push(`starts on the ${side} side of the mat`)
  return parts.join(', ')
}

export function DeleteOpponentButton({ opponentId, tournamentId }: { opponentId: string; tournamentId: string }) {
  const [pending, setPending] = useState(false)

  return (
    <button
      onClick={async () => {
        if (!confirm('Delete this opponent and all their scouted footage? This cannot be undone.')) return
        setPending(true)
        await deleteOpponent(opponentId, tournamentId)
      }}
      disabled={pending}
      aria-label="Delete opponent"
      className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>
  )
}

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
  const [appearanceColor, setAppearanceColor] = useState<AppearanceColor | null>(null)
  const [startingSide, setStartingSide] = useState<StartingSide | null>(null)

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
        fd.set('appearanceHint', buildAppearanceHint(appearanceColor, startingSide))
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
      <div className="space-y-1.5">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Opponent&apos;s appearance in video</p>
          <p className="text-xs text-muted-foreground">Helps the AI identify which athlete is {opponentName}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAppearanceColor(appearanceColor === opt.value ? null : opt.value)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all ${
                appearanceColor === opt.value
                  ? 'border-foreground bg-foreground text-background font-medium'
                  : 'border-border hover:border-foreground/40'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.bg}`} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(['left', 'right'] as StartingSide[]).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setStartingSide(startingSide === side ? null : side)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition-all ${
                startingSide === side
                  ? 'border-foreground bg-foreground text-background font-medium'
                  : 'border-border hover:border-foreground/40'
              }`}
            >
              {side === 'left' ? '← ' : '→ '}Starts {side}
            </button>
          ))}
        </div>
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
