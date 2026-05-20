'use client'

import { useState } from 'react'
import { rateGameplan } from './actions'

export function GameplanRatingWidget({
  gameplanId,
  initialRating,
}: {
  gameplanId: string
  initialRating: number | null
}) {
  const [rating, setRating] = useState<number | null>(initialRating)
  const [pending, setPending] = useState(false)

  async function handleRate(value: 1 | -1) {
    const next = rating === value ? null : value
    setPending(true)
    setRating(next)
    await rateGameplan(gameplanId, next)
    setPending(false)
  }

  return (
    <div className="flex items-center gap-1" title="Was this gameplan helpful?">
      <button
        onClick={() => handleRate(1)}
        disabled={pending}
        aria-label="Helpful"
        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
          rating === 1
            ? 'text-emerald-400 bg-emerald-950/40'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={rating === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 10v12"/><path d="M15 5.88L14 10h5.83a2 2 0 011.92 2.56l-2.33 8A2 2 0 0117.5 22H4a2 2 0 01-2-2v-8a2 2 0 012-2h2.76a2 2 0 001.79-1.11L12 2h0a3.13 3.13 0 013 3.88z"/>
        </svg>
      </button>
      <button
        onClick={() => handleRate(-1)}
        disabled={pending}
        aria-label="Not helpful"
        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
          rating === -1
            ? 'text-rose-400 bg-rose-950/40'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={rating === -1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 14V2"/><path d="M9 18.12L10 14H4.17a2 2 0 01-1.92-2.56l2.33-8A2 2 0 016.5 2H20a2 2 0 012 2v8a2 2 0 01-2 2h-2.76a2 2 0 00-1.79 1.11L12 22h0a3.13 3.13 0 01-3-3.88z"/>
        </svg>
      </button>
    </div>
  )
}
