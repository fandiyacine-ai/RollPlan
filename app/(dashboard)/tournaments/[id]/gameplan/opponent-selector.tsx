'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MatchupPrediction } from '../../../../../lib/ai/schemas/prediction'

type Opponent = { id: string; opponentLabel: string }

export function OpponentSelector({
  opponents,
  activeId,
  tournamentId,
  predictionByOpponent,
}: {
  opponents: Opponent[]
  activeId: string
  tournamentId: string
  predictionByOpponent: Record<string, MatchupPrediction>
}) {
  const router = useRouter()

  return (
    <>
      {/* Mobile: select dropdown */}
      <div className="sm:hidden">
        <select
          value={activeId}
          onChange={e => router.push(`/tournaments/${tournamentId}/gameplan?opponent=${e.target.value}`)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {opponents.map(opp => {
            const pred = predictionByOpponent[opp.id]
            return (
              <option key={opp.id} value={opp.id}>
                {opp.opponentLabel}{pred ? ` — ${pred.win_probability}% win` : ''}
              </option>
            )
          })}
        </select>
      </div>

      {/* Desktop: pill tabs */}
      <div className="hidden sm:flex gap-2 flex-wrap">
        {opponents.map(opp => {
          const oppPred = predictionByOpponent[opp.id]
          return (
            <Link
              key={opp.id}
              href={`/tournaments/${tournamentId}/gameplan?opponent=${opp.id}`}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                opp.id === activeId
                  ? 'bg-foreground text-background border-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              {opp.opponentLabel}
              {oppPred && (
                <span
                  title="Estimated win probability"
                  className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                  opp.id === activeId
                    ? 'bg-background/20 text-background'
                    : oppPred.verdict === 'favourable' ? 'text-emerald-400'
                    : oppPred.verdict === 'tough' ? 'text-rose-400'
                    : 'text-zinc-400'
                }`}>
                  {oppPred.win_probability}% win
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </>
  )
}
