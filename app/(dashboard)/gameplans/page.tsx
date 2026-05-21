import { db } from '@/lib/db'
import { tournaments, tournamentOpponents, gameplans, matches } from '@/lib/db/schema'
import { eq, desc, count } from 'drizzle-orm'
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
  if (!level) {
    return (
      <span className="text-[10px] text-muted-foreground/50 font-medium" title="No match data">
        N/A
      </span>
    )
  }
  const map = {
    high:   { dots: '●●●', color: 'text-emerald-400' },
    medium: { dots: '●●○', color: 'text-amber-400' },
    low:    { dots: '●○○', color: 'text-zinc-500' },
  }
  const { dots, color } = map[level]
  return (
    <span className={`text-[11px] font-mono font-bold ${color}`} title={`${level} confidence`}>
      {dots}
    </span>
  )
}

function WinBar({ probability, verdict }: { probability: number; verdict: string }) {
  const color = verdict === 'favourable' ? 'bg-emerald-500' : verdict === 'tough' ? 'bg-rose-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${probability}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground shrink-0">{probability}% win</span>
    </div>
  )
}

function GameCard({
  opponent,
  tournamentId,
  plan,
  prediction,
  matchCount,
}: {
  opponent: { id: string; opponentLabel: string }
  tournamentId: string
  plan: GameplanOutput | null
  prediction: MatchupPrediction | null
  matchCount: number
}) {
  const confidence: 'low' | 'medium' | 'high' | null = prediction?.confidence
    ?? (matchCount >= 3 ? 'high' : matchCount >= 1 ? 'medium' : null)

  return (
    <Link
      href={`/tournaments/${tournamentId}/gameplan?opponent=${opponent.id}`}
      className="block bg-card border border-border/60 rounded-xl p-4 space-y-3 hover:border-border transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm leading-tight">{opponent.opponentLabel}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <ConfidenceDots level={confidence} />
          <span className="text-[10px] text-muted-foreground capitalize">
            {confidence ? `${confidence} data` : 'No data'}
          </span>
        </div>
      </div>

      {/* Win probability bar */}
      {prediction && (
        <WinBar probability={prediction.win_probability} verdict={prediction.verdict} />
      )}

      {/* No data states */}
      {!plan && matchCount === 0 && (
        <p className="text-xs text-muted-foreground">No footage scouted — gameplan not available.</p>
      )}
      {!plan && matchCount > 0 && (
        <p className="text-xs text-amber-400">Footage analysed — tap to generate gameplan.</p>
      )}

      {/* Condensed game plan */}
      {plan && (
        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            <span className="shrink-0 w-4">⚔</span>
            <div>
              <span className="text-muted-foreground">Attack  </span>
              <span className="font-medium">{plan.primary_chain.label}</span>
            </div>
          </div>

          {plan.defensive_priorities[0] && (
            <div className="flex gap-2">
              <span className="shrink-0 w-4">⚠</span>
              <div>
                <span className="text-muted-foreground">Danger  </span>
                <span className="font-medium">{plan.defensive_priorities[0].threat}</span>
              </div>
            </div>
          )}

          {plan.mental_cues[0] && (
            <div className="flex gap-2">
              <span className="shrink-0 w-4">🧠</span>
              <div>
                <span className="text-muted-foreground">Cue  </span>
                <span className="font-medium">{plan.mental_cues[0]}</span>
              </div>
            </div>
          )}

          {plan.format_notes && (
            <div className="flex gap-2">
              <span className="shrink-0 w-4">📋</span>
              <div>
                <span className="text-muted-foreground">Rules  </span>
                <span className="font-medium">{plan.format_notes}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data confidence footnote */}
      <p className="text-[10px] text-muted-foreground/60 pt-0.5 border-t border-border/40">
        {matchCount === 0
          ? 'No footage — prediction based on style, not match data'
          : matchCount === 1
          ? '1 match analysed — limited data, may not be accurate'
          : `${matchCount} matches analysed`}
      </p>
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
      <div className="max-w-2xl space-y-4">
        <h1 className="text-lg font-semibold">Gameplans</h1>
        <div className="rounded-xl border border-dashed p-10 text-center space-y-2">
          <p className="font-medium">No tournaments yet</p>
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

          const [mc] = await db
            .select({ total: count() })
            .from(matches)
            .where(eq(matches.tournamentOpponentId, opp.id))

          const plan = (gp?.status !== 'generating' && gp?.structuredPlan && Object.keys(gp.structuredPlan as object).length > 0)
            ? gp.structuredPlan as GameplanOutput
            : null

          return {
            opponent: opp,
            plan,
            prediction: (gp?.prediction ?? null) as MatchupPrediction | null,
            matchCount: Number(mc?.total ?? 0),
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
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Gameplans</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {upcomingCount} upcoming tournament{upcomingCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Next-match shortcut */}
      {nextEntry && (() => {
        const { tournament: t, opponents } = nextEntry
        const days = daysUntil(t.eventDate)
        if (opponents.length === 0) return null
        return (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Up next</p>
              {days !== null && (
                <span className={`text-xs font-bold tabular-nums ${
                  days <= 3 ? 'text-rose-400' : days <= 14 ? 'text-amber-400' : 'text-primary/70'
                }`}>
                  {days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d away`}
                </span>
              )}
            </div>
            <p className="font-semibold text-sm">{t.name}</p>
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const withPlan = opponents.filter(o => o.plan)
                const noPlanCount = opponents.length - withPlan.length
                return (
                  <>
                    {withPlan.map(({ opponent }) => (
                      <Link
                        key={opponent.id}
                        href={`/tournaments/${t.id}/gameplan?opponent=${opponent.id}`}
                        className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-background hover:bg-muted font-medium transition-colors"
                      >
                        {opponent.opponentLabel} →
                      </Link>
                    ))}
                    {noPlanCount > 0 && (
                      <Link
                        href={`/tournaments/${t.id}/opponents`}
                        className="text-xs px-3 py-1.5 rounded-full border border-border/40 bg-background hover:bg-muted text-muted-foreground transition-colors"
                      >
                        +{noPlanCount} to scout →
                      </Link>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {tournamentData.map(({ tournament, opponents }) => {
        const days = daysUntil(tournament.eventDate)
        const dateLabel = tournament.eventDate
          ? new Date(tournament.eventDate + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
          : null

        return (
          <div key={tournament.id} className="space-y-3">
            {/* Tournament header */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold">{tournament.name}</h2>
                  {dateLabel && (
                    <span className="text-sm text-muted-foreground">{dateLabel}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {tournament.status === 'upcoming' && days !== null && (
                  <span className={`text-sm font-bold tabular-nums ${
                    days <= 3 ? 'text-rose-400' : days <= 14 ? 'text-amber-400' : 'text-muted-foreground'
                  }`}>
                    {days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                  </span>
                )}
                {tournament.status === 'completed' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-bold uppercase">Done</span>
                )}
              </div>
            </div>

            {/* Opponent game cards */}
            {(() => {
              if (opponents.length === 0) return (
                <p className="text-xs text-muted-foreground pl-1">
                  No opponents added.{' '}
                  <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Add opponents →</Link>
                </p>
              )
              const withData = opponents.filter(o => o.plan || o.matchCount > 0)
              const noDataCount = opponents.length - withData.length
              if (withData.length === 0) return (
                <p className="text-xs text-muted-foreground pl-1">
                  {opponents.length} opponent{opponents.length !== 1 ? 's' : ''} added — no footage scouted yet.{' '}
                  <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Start scouting →</Link>
                </p>
              )
              return (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    {withData.map(({ opponent, plan, prediction, matchCount }) => (
                      <GameCard
                        key={opponent.id}
                        opponent={opponent}
                        tournamentId={tournament.id}
                        plan={plan}
                        prediction={prediction}
                        matchCount={matchCount}
                      />
                    ))}
                  </div>
                  {noDataCount > 0 && (
                    <p className="text-xs text-muted-foreground pl-1">
                      +{noDataCount} opponent{noDataCount !== 1 ? 's' : ''} without footage.{' '}
                      <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Scout →</Link>
                    </p>
                  )}
                </>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
