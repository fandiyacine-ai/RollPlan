import { db } from '../../../../../lib/db'
import { tournamentOpponents, matches } from '../../../../../lib/db/schema'
import { eq, count } from 'drizzle-orm'
import { AddOpponentForm, ScoutForm } from './opponent-forms'
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

      {opponents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p className="font-medium">No opponents yet</p>
          <p className="text-sm mt-1">Add an opponent and submit their footage to start scouting.</p>
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
