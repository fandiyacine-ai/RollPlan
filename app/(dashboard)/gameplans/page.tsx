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
  if (!level) {
    return (
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 border border-border/40 px-1.5 py-0.5 rounded">
        No data
      </span>
    )
  }
  const map = {
    high:   { label: 'High', color: 'text-emerald-400 border-emerald-800/40' },
    medium: { label: 'Med',  color: 'text-amber-400 border-amber-800/40' },
    low:    { label: 'Low',  color: 'text-zinc-500 border-zinc-700/40' },
  }
  const { label, color } = map[level]
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${color}`} title={`${level} confidence`}>
      {label}
    </span>
  )
}

function WinBar({ probability, verdict }: { probability: number; verdict: string }) {
  const barColor = verdict === 'favourable' ? 'bg-emerald-500' : verdict === 'tough' ? 'bg-rose-500' : 'bg-amber-500'
  const numColor = verdict === 'favourable' ? 'text-emerald-400' : verdict === 'tough' ? 'text-rose-400' : 'text-amber-400'
  const verdictLabel = verdict === 'favourable' ? 'Favourable' : verdict === 'tough' ? 'Tough' : 'Even'
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <span className={`text-3xl font-black tabular-nums leading-none ${numColor}`}>{probability}%</span>
        <span className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${numColor}`}>{verdictLabel}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${probability}%` }} />
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
}: {
  opponent: { id: string; opponentLabel: string }
  tournamentId: string
  plan: GameplanOutput | null
  prediction: MatchupPrediction | null
  matchCount: number
  matchSources: string[]
}) {
  const confidence: 'low' | 'medium' | 'high' | null = prediction?.confidence
    ?? (matchCount >= 3 ? 'high' : matchCount >= 1 ? 'medium' : null)

  return (
    <Link
      href={`/tournaments/${tournamentId}/gameplan?opponent=${opponent.id}`}
      className="block bg-card border border-border/60 rounded-xl overflow-hidden hover:border-border transition-colors group"
    >
      {/* Header bar */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40 flex items-start justify-between gap-2">
        <p className="font-black text-base leading-tight tracking-tight">{opponent.opponentLabel}</p>
        <ConfidenceDots level={confidence} />
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
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">Attack</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {plan.primary_chain.steps.map((step, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-muted-foreground/30 tabular-nums">{i + 1}</span>
                    <span className="text-xs font-semibold bg-foreground/[0.06] border border-border/40 px-2 py-0.5 rounded-md max-w-[9rem] truncate">{step}</span>
                    {i < plan.primary_chain.steps.length - 1 && (
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/25 flex-shrink-0">
                        <path d="M2 6h8M7 3l3 3-3 3"/>
                      </svg>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* DANGER */}
            {plan.defensive_priorities[0] && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-rose-500/60 mb-1">Danger</p>
                <p className="text-xs font-semibold text-rose-400/90 line-clamp-1">{plan.defensive_priorities[0].threat}</p>
              </div>
            )}

            {/* MINDSET */}
            {plan.mental_cues[0] && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Mindset</p>
                <p className="text-xs font-medium leading-snug line-clamp-1">{plan.mental_cues[0]}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Source footage footnote */}
      <div className="px-4 pb-3 border-t border-border/30">
        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-widest mt-2.5 mb-0.5">Scout data</p>
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
        <h1 className="text-xl font-black tracking-tight uppercase">Gameplans</h1>
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
            .select({ eventName: matches.eventName, status: matches.status })
            .from(matches)
            .where(eq(matches.tournamentOpponentId, opp.id))

          const plan = (gp?.status !== 'generating' && gp?.structuredPlan && Object.keys(gp.structuredPlan as object).length > 0)
            ? gp.structuredPlan as GameplanOutput
            : null

          const matchSources = scoutedMatches
            .filter(m => m.status === 'analysed')
            .map(m => m.eventName ?? 'Competition footage')

          return {
            opponent: opp,
            plan,
            prediction: (gp?.prediction ?? null) as MatchupPrediction | null,
            matchCount: scoutedMatches.length,
            matchSources,
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
    <div className="max-w-6xl space-y-8">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">FrameMatters</p>
          <h1 className="text-2xl font-black tracking-tight uppercase leading-none">Gameplans</h1>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {upcomingCount} upcoming tournament{upcomingCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Next-match shortcut — fight card style */}
      {nextEntry && (() => {
        const { tournament: t, opponents } = nextEntry
        const days = daysUntil(t.eventDate)
        if (opponents.length === 0) return null
        return (
          <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 overflow-hidden">
            <div className="px-4 py-2.5 bg-rose-950/40 border-b border-rose-900/40 flex items-center justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400/80 flex items-center gap-1.5">
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,1 11,6 2,11"/></svg>
                Up next
              </p>
              {days !== null && (
                <span className={`text-xs font-black tabular-nums ${
                  days <= 3 ? 'text-rose-400' : days <= 14 ? 'text-amber-400' : 'text-muted-foreground'
                }`}>
                  {days === 0 ? 'TODAY' : days < 0 ? `${Math.abs(days)}D AGO` : `${days}D AWAY`}
                </span>
              )}
            </div>
            <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <p className="font-black text-base tracking-tight">{t.name}</p>
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
                          className="text-xs px-3 py-1.5 rounded-lg border border-rose-700/50 bg-rose-950/40 text-rose-300 hover:bg-rose-950/70 font-bold transition-colors"
                        >
                          {opponent.opponentLabel} →
                        </Link>
                      ))}
                      {noPlanCount > 0 && (
                        <Link
                          href={`/tournaments/${t.id}/opponents`}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border/40 bg-background hover:bg-muted text-muted-foreground font-medium transition-colors"
                        >
                          +{noPlanCount} to scout →
                        </Link>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )
      })()}

      {tournamentData.map(({ tournament, opponents }) => {
        const days = daysUntil(tournament.eventDate)
        const dateLabel = tournament.eventDate
          ? new Date(tournament.eventDate + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
          : null

        const isPast = tournament.status === 'upcoming' && days !== null && days < 0
        return (
          <div key={tournament.id} className={`space-y-4 ${isPast ? 'opacity-40' : ''}`}>
            {/* Tournament header */}
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/40">
              <div className="min-w-0 flex items-center gap-3 flex-wrap">
                <h2 className="font-black text-base tracking-tight uppercase">{tournament.name}</h2>
                {dateLabel && (
                  <span className="text-xs text-muted-foreground font-medium">{dateLabel}</span>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {tournament.status === 'upcoming' && days !== null && (
                  <span className={`text-xs font-black tabular-nums ${
                    days <= 3 ? 'text-rose-400' : days <= 14 ? 'text-amber-400' : 'text-muted-foreground'
                  }`}>
                    {days === 0 ? 'TODAY' : days < 0 ? `${Math.abs(days)}D AGO` : `${days}D`}
                  </span>
                )}
                {tournament.status === 'completed' && (
                  <span className="text-[9px] px-2 py-0.5 rounded border border-emerald-800/40 text-emerald-400 font-black uppercase tracking-widest">Done</span>
                )}
              </div>
            </div>

            {/* Opponent game cards */}
            {(() => {
              if (opponents.length === 0) return (
                <p className="text-xs text-muted-foreground">
                  No opponents added.{' '}
                  <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Add opponents →</Link>
                </p>
              )
              const withData = opponents.filter(o => o.plan || o.matchCount > 0)
              const noDataCount = opponents.length - withData.length
              if (withData.length === 0) return (
                <p className="text-xs text-muted-foreground">
                  {opponents.length} opponent{opponents.length !== 1 ? 's' : ''} added — no footage scouted yet.{' '}
                  <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Start scouting →</Link>
                </p>
              )
              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {withData.map(({ opponent, plan, prediction, matchCount, matchSources }) => (
                      <GameCard
                        key={opponent.id}
                        opponent={opponent}
                        tournamentId={tournament.id}
                        plan={plan}
                        prediction={prediction}
                        matchCount={matchCount}
                        matchSources={matchSources}
                      />
                    ))}
                  </div>
                  {noDataCount > 0 && (
                    <p className="text-xs text-muted-foreground">
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
