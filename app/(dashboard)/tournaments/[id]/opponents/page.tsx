import { db } from '../../../../../lib/db'
import { tournamentOpponents, matches } from '../../../../../lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { AddOpponentForm } from './opponent-forms'
import { OpponentAccordion } from './opponent-accordion'

export const dynamic = 'force-dynamic'

export default async function OpponentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params

  const opponents = await db
    .select()
    .from(tournamentOpponents)
    .where(eq(tournamentOpponents.tournamentId, tournamentId))
    .orderBy(tournamentOpponents.createdAt)

  const opponentIds = opponents.map(o => o.id)

  const allMatches = opponentIds.length > 0
    ? await db
        .select({
          id: matches.id,
          status: matches.status,
          format: matches.format,
          context: matches.context,
          eventName: matches.eventName,
          createdAt: matches.createdAt,
          tournamentOpponentId: matches.tournamentOpponentId,
        })
        .from(matches)
        .where(inArray(matches.tournamentOpponentId, opponentIds))
        .orderBy(matches.createdAt)
    : []

  const matchesByOpponent = allMatches.reduce<Record<string, typeof allMatches>>((acc, m) => {
    if (!m.tournamentOpponentId) return acc
    acc[m.tournamentOpponentId] ??= []
    acc[m.tournamentOpponentId].push(m)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Opponents ({opponents.length})
        </h2>
        <AddOpponentForm tournamentId={tournamentId} />
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
          {opponents.map((opp) => (
            <OpponentAccordion
              key={opp.id}
              opponent={opp}
              matches={matchesByOpponent[opp.id] ?? []}
              tournamentId={tournamentId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
