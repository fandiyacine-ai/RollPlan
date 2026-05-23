import { db } from '@/lib/db'
import { tournaments, tournamentOpponents, gameplans, matches } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import Link from 'next/link'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import type { GameplanOutput } from '@/lib/ai/schemas/gameplan'
import type { MatchupPrediction } from '@/lib/ai/schemas/prediction'

export const dynamic = 'force-dynamic'

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T12:00:00').getTime() - Date.now()) / 86400000)
}

function ConfidenceDots({ level }: { level: 'low' | 'medium' | 'high' | null }) {
  if (!level) return <span className="text-[10px] text-muted-foreground/30">—</span>
  const map = { high: 'High', medium: 'Med', low: 'Low' }
  return <span className="text-[10px] text-muted-foreground/50">{map[level]}</span>
}

function WinBar({ probability, verdict }: { probability: number; verdict: string }) {
  const verdictLabel = verdict === 'favourable' ? 'Favourable' : verdict === 'tough' ? 'Tough' : 'Even'
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums leading-none">{probability}%</span>
        <span className="text-xs text-muted-foreground mb-0.5">{verdictLabel}</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${probability >= 50 ? 'bg-zinc-500' : 'bg-zinc-400'}`} style={{ width: `${probability}%` }} />
      </div>
    </div>
  )
}

function GameCard({
  opponent,
  tournamentId,
  plan,
  prediction,
  matchCount,
  matchSources,
  hasUpgrade,
  lastUpgradedAt,
}: {
  opponent: { id: string; opponentLabel: string }
  tournamentId: string
  plan: GameplanOutput | null
  prediction: MatchupPrediction | null
  matchCount: number
  matchSources: string[]
  hasUpgrade?: boolean
  lastUpgradedAt?: Date | null
}) {
  const confidence: 'low' | 'medium' | 'high' | null = prediction?.confidence
    ?? (matchCount >= 3 ? 'high' : matchCount >= 1 ? 'medium' : null)

  return (
    <Link
      href={`/tournaments/${tournamentId}/gameplan?opponent=${opponent.id}&back=/gameplans`}
      className="block bg-card border border-border/60 rounded-xl overflow-hidden hover:border-border transition-colors group"
    >
      {/* Header bar */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight">{opponent.opponentLabel}</p>
          {hasUpgrade && lastUpgradedAt && (
            <p className="text-[10px] text-amber-500 mt-0.5">
              Analysis upgraded · {lastUpgradedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasUpgrade && (
            <span className="text-[9px] font-bold tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/20">
              NEW
            </span>
          )}
          <ConfidenceDots level={confidence} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Win probability — hero stat */}
        {prediction && (
          <WinBar probability={prediction.win_probability} verdict={prediction.verdict} />
        )}

        {/* No data states */}
        {!plan && matchCount === 0 && (
          <p className="text-xs text-muted-foreground/60 italic">No footage scouted — tap to get started.</p>
        )}
        {!plan && matchCount > 0 && (
          <p className="text-xs text-amber-400 font-medium">Footage ready — tap to generate gameplan.</p>
        )}

        {/* Condensed game plan */}
        {plan && (
          <div className="space-y-3">
            {/* ATTACK chain */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Attack</p>
              <ol className="space-y-0.5">
                {plan.primary_chain.steps.slice(0, 3).map((step, i) => (
                  <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
                    <span className="text-muted-foreground/30 tabular-nums flex-shrink-0">{i + 1}.</span>
                    <span className="line-clamp-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* DANGER */}
            {plan.defensive_priorities[0] && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Danger</p>
                <p className="text-xs text-rose-500 line-clamp-1">{plan.defensive_priorities[0].threat}</p>
              </div>
            )}

            {/* MINDSET */}
            {plan.mental_cues[0] && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Mindset</p>
                <p className="text-xs text-foreground/70 leading-snug line-clamp-1">{plan.mental_cues[0]}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Source footage footnote */}
      <div className="px-4 pb-3 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground/40 mt-2.5 mb-0.5">Scout data</p>
        {matchSources.length > 0 ? (
          <p className="text-[10px] text-muted-foreground/60 truncate">
            {matchSources[0]}{matchSources.length > 1 ? ` +${matchSources.length - 1} more` : ''}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground/50">
            {matchCount === 0
              ? 'No footage — AI prediction only'
              : matchCount === 1
              ? '1 match analysed'
              : `${matchCount} matches analysed`}
          </p>
        )}
      </div>
    </Link>
  )
}

export default async function GameplansPage() {
  const userId = await getOrCreateDbUserId()

  // All tournaments for this user
  const allTournaments = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      eventDate: tournaments.eventDate,
      status: tournaments.status,
      ruleset: tournaments.ruleset,
    })
    .from(tournaments)
    .where(eq(tournaments.userId, userId))
    .orderBy(desc(tournaments.createdAt))

  if (allTournaments.length === 0) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">Gameplans</h1>
        <div className="rounded-xl border border-dashed p-10 text-center space-y-2">
          <p className="font-semibold">No tournaments yet</p>
          <p className="text-sm text-muted-foreground">
            <Link href="/tournaments" className="underline hover:no-underline">Create a tournament</Link>{' '}
            and add opponents to generate gameplans.
          </p>
        </div>
      </div>
    )
  }

  // Sort: upcoming soonest first, then completed, then cancelled
  const sorted = [...allTournaments].sort((a, b) => {
    if (a.status === 'upcoming' && b.status !== 'upcoming') return -1
    if (a.status !== 'upcoming' && b.status === 'upcoming') return 1
    if (!a.eventDate && !b.eventDate) return 0
    if (!a.eventDate) return 1
    if (!b.eventDate) return -1
    return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  })

  // Fetch opponents + gameplans + match counts for all tournaments
  const tournamentData = await Promise.all(
    sorted.map(async (t) => {
      const opps = await db
        .select({ id: tournamentOpponents.id, opponentLabel: tournamentOpponents.opponentLabel })
        .from(tournamentOpponents)
        .where(eq(tournamentOpponents.tournamentId, t.id))

      const oppData = await Promise.all(
        opps.map(async (opp) => {
          const [gp] = await db
            .select({ structuredPlan: gameplans.structuredPlan, prediction: gameplans.prediction, status: gameplans.status })
            .from(gameplans)
            .where(eq(gameplans.opponentId, opp.id))
            .limit(1)

          const scoutedMatches = await db
            .select({ eventName: matches.eventName, status: matches.status, kbUpgradedAt: matches.kbUpgradedAt, kbUpgradeSeenAt: matches.kbUpgradeSeenAt })
            .from(matches)
            .where(eq(matches.tournamentOpponentId, opp.id))

          const plan = (gp?.status !== 'generating' && gp?.structuredPlan && Object.keys(gp.structuredPlan as object).length > 0)
            ? gp.structuredPlan as GameplanOutput
            : null

          const matchSources = scoutedMatches
            .filter(m => m.status === 'analysed')
            .map(m => m.eventName ?? 'Competition footage')

          const hasUpgrade = scoutedMatches.some(m =>
            m.kbUpgradedAt && (!m.kbUpgradeSeenAt || m.kbUpgradedAt > m.kbUpgradeSeenAt)
          )
          const lastUpgradedAt = scoutedMatches
            .map(m => m.kbUpgradedAt)
            .filter(Boolean)
            .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null

          return {
            opponent: opp,
            plan,
            prediction: (gp?.prediction ?? null) as MatchupPrediction | null,
            matchCount: scoutedMatches.length,
            matchSources,
            hasUpgrade,
            lastUpgradedAt,
          }
        })
      )

      return { tournament: t, opponents: oppData }
    })
  )

  const upcomingCount = sorted.filter(t => t.status === 'upcoming').length
  // Find nearest FUTURE upcoming tournament (skip past-dated ones still marked upcoming)
  const nextEntry = tournamentData.find(({ tournament: t }) => {
    const days = daysUntil(t.eventDate)
    return t.status === 'upcoming' && days !== null && days >= 0
  })

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 mb-10">
        <h1 className="text-2xl font-semibold">Gameplans</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {upcomingCount} upcoming
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical rail — hidden on mobile */}
        <div className="absolute left-[5px] top-2 bottom-0 w-px bg-border/40 hidden sm:block" />

        <div className="space-y-12">
          {tournamentData.map(({ tournament, opponents }) => {
            const days = daysUntil(tournament.eventDate)
            const dateLabel = tournament.eventDate
              ? new Date(tournament.eventDate + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
              : null
            const isPast = tournament.status === 'upcoming' && days !== null && days < 0
            const isNext = nextEntry?.tournament.id === tournament.id
            const isCompleted = tournament.status === 'completed'

            return (
              <div key={tournament.id} className={`relative sm:pl-8 ${isPast ? 'opacity-40' : ''}`}>
                {/* Timeline node dot */}
                <div className={`
                  hidden sm:block absolute left-0 top-[7px] w-[11px] h-[11px] rounded-full border-2 transition-colors
                  ${isNext
                    ? 'border-foreground bg-foreground'
                    : isCompleted
                    ? 'border-border/50 bg-muted'
                    : 'border-border bg-background'
                  }
                `} />

                {/* Tournament anchor row */}
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {isNext && (
                        <span className="text-[10px] font-medium text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded-full leading-none">
                          Up next
                        </span>
                      )}
                      <h2 className="font-semibold text-base leading-snug">{tournament.name}</h2>
                    </div>
                    {dateLabel && (
                      <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                    {tournament.status === 'upcoming' && days !== null && (
                      <span className={`text-xs font-medium tabular-nums ${
                        days <= 3 ? 'text-rose-500' : days <= 14 ? 'text-amber-500' : 'text-muted-foreground'
                      }`}>
                        {days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground font-medium">
                        Done
                      </span>
                    )}
                  </div>
                </div>

                {/* Opponent cards — left border brackets them under this tournament */}
                <div className="border-l border-border/40 pl-4 ml-0.5">
                  {(() => {
                    if (opponents.length === 0) return (
                      <p className="text-xs text-muted-foreground py-1">
                        No opponents added.{' '}
                        <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Add opponents →</Link>
                      </p>
                    )
                    const withData = opponents.filter(o => o.plan || o.matchCount > 0)
                    const noDataCount = opponents.length - withData.length
                    if (withData.length === 0) return (
                      <p className="text-xs text-muted-foreground py-1">
                        {opponents.length} opponent{opponents.length !== 1 ? 's' : ''} added — no footage scouted yet.{' '}
                        <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Start scouting →</Link>
                      </p>
                    )
                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                          {withData.map(({ opponent, plan, prediction, matchCount, matchSources, hasUpgrade, lastUpgradedAt }) => (
                            <GameCard
                              key={opponent.id}
                              opponent={opponent}
                              tournamentId={tournament.id}
                              plan={plan}
                              prediction={prediction}
                              matchCount={matchCount}
                              matchSources={matchSources}
                              hasUpgrade={hasUpgrade}
                              lastUpgradedAt={lastUpgradedAt}
                            />
                          ))}
                        </div>
                        {noDataCount > 0 && (
                          <p className="text-xs text-muted-foreground mt-3">
                            +{noDataCount} opponent{noDataCount !== 1 ? 's' : ''} without footage.{' '}
                            <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Scout →</Link>
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
