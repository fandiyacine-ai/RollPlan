import { db } from '../../../../../lib/db'
import { tournamentOpponents, matches } from '../../../../../lib/db/schema'
import { eq, count } from 'drizzle-orm'
import { AddOpponentForm, ScoutForm, DeleteOpponentButton } from './opponent-forms'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OpponentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params

  const opponents = await db
    .select()
    .from(tournamentOpponents)
    .where(eq(tournamentOpponents.tournamentId, tournamentId))
    .orderBy(tournamentOpponents.createdAt)

  // Count scouted matches per opponent
  const scoutedCounts = await db
    .select({ opponentId: matches.tournamentOpponentId, count: count() })
    .from(matches)
    .where(eq(matches.status, 'analysed'))
    .groupBy(matches.tournamentOpponentId)

  const scoutedMap = Object.fromEntries(
    scoutedCounts
      .filter(r => r.opponentId !== null)
      .map(r => [r.opponentId!, r.count])
  )

  // Count in-progress scans
  const pendingCounts = await db
    .select({ opponentId: matches.tournamentOpponentId, count: count() })
    .from(matches)
    .where(eq(matches.status, 'processing'))
    .groupBy(matches.tournamentOpponentId)

  const pendingMap = Object.fromEntries(
    pendingCounts
      .filter(r => r.opponentId !== null)
      .map(r => [r.opponentId!, r.count])
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Opponents ({opponents.length})
        </h2>
        <AddOpponentForm tournamentId={tournamentId} />
      </div>

      {/* Smoothcomp teaser */}
      <div className="rounded-xl border border-border/50 bg-card p-4 flex gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <span className="inline-flex w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-800/40 items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold">Smoothcomp stream analysis — coming soon</p>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/40">In development</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Soon you'll be able to drop a Smoothcomp event link and we'll automatically pull every match your opponent competed in — no manual uploads needed. For now, paste YouTube links in the Scout dialog.
          </p>
        </div>
      </div>

      {opponents.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-primary text-sm font-semibold">Step 2 of 3</span>
            <div className="flex items-center gap-1">
              <span className="text-primary text-lg">●</span>
              <span className="text-primary text-lg">●</span>
              <span className="text-muted-foreground/40 text-lg">●</span>
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">Who are you facing?</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Add the athletes you might meet in your bracket. Once you add them, scout their footage and the AI will build you a gameplan for each.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {opponents.map((opp) => {
            const analysed = scoutedMap[opp.id] ?? 0
            const pending = pendingMap[opp.id] ?? 0
            const total = analysed + pending

            return (
              <div key={opp.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{opp.opponentLabel}</p>
                    {opp.seedingNotes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{opp.seedingNotes}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {analysed > 0
                        ? `${analysed} match${analysed !== 1 ? 'es' : ''} analysed`
                        : 'Not scouted yet'}
                      {pending > 0 && ` · ${pending} scanning…`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {analysed > 0 && (
                      <Link
                        href={`/tournaments/${tournamentId}/gameplan?opponent=${opp.id}`}
                        className="text-xs px-3 py-1 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
                      >
                        Gameplan
                      </Link>
                    )}
                    <ScoutForm
                      tournamentId={tournamentId}
                      opponentId={opp.id}
                      opponentName={opp.opponentLabel}
                    />
                    <DeleteOpponentButton opponentId={opp.id} tournamentId={tournamentId} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
