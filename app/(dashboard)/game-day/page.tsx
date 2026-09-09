import { db } from '@/lib/db'
import { tournaments, tournamentOpponents, gameplans, matches } from '@/lib/db/schema'
import { eq, and, or, gte, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import type { GameplanOutput } from '@/lib/ai/schemas/gameplan'
import type { MatchupPrediction } from '@/lib/ai/schemas/prediction'
import { SampleGameDayPreview } from '@/components/sample-preview'

export const dynamic = 'force-dynamic'

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T12:00:00').getTime() - Date.now()) / 86400000)
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ConfidenceDots({ matchCount }: { matchCount: number }) {
  const filled = matchCount >= 3 ? 3 : matchCount
  return (
    <span className="inline-flex items-center gap-0.5" title={`Based on ${matchCount} scouted match${matchCount !== 1 ? 'es' : ''}`}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < filled ? 'bg-foreground/70' : 'bg-muted-foreground/20'}`}
        />
      ))}
    </span>
  )
}

const VERDICT_COLOR: Record<string, string> = {
  favourable: 'text-blue-400',
  neutral:    'text-amber-400',
  tough:      'text-rose-400',
}
const VERDICT_LABEL: Record<string, string> = {
  favourable: 'Favourable',
  neutral:    'Even',
  tough:      'Tough',
}

function OpponentGameCard({
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
  const card = plan?.match_card ?? null
  const href = `/tournaments/${tournamentId}/gameplan?opponent=${opponent.id}&back=/game-day`

  return (
    <Link
      href={href}
      className="block rounded-xl border border-border/60 bg-card overflow-hidden hover:border-border transition-colors"
    >
      {/* Header: name + win probability */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ConfidenceDots matchCount={matchCount} />
          <p className="font-semibold text-sm truncate">{opponent.opponentLabel}</p>
        </div>
        {prediction ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-lg font-bold tabular-nums leading-none">{prediction.win_probability}%</span>
            <span className={`text-[10px] font-semibold ${VERDICT_COLOR[prediction.verdict] ?? 'text-muted-foreground'}`}>
              {VERDICT_LABEL[prediction.verdict] ?? prediction.verdict}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">
            {matchCount === 0 ? 'No footage' : 'No gameplan'}
          </span>
        )}
      </div>

      {card ? (
        <div className="px-4 py-3 space-y-2.5">
          {/* Open with + Watch out */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg border-l-2 border-blue-500 bg-blue-500/[0.06] px-2.5 py-2 space-y-0.5">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-500">Open with</p>
              <p className="text-xs font-bold leading-snug">{card.open_with}</p>
            </div>
            <div className="rounded-lg border-l-2 border-rose-500 bg-rose-500/[0.06] px-2.5 py-2 space-y-0.5">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">Watch out</p>
              <p className="text-xs font-bold leading-snug text-rose-700 dark:text-rose-300">{card.watch_out}</p>
            </div>
          </div>

          {/* Attack chain */}
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40 mr-1">Attack</p>
            {card.attack_chain.slice(0, 3).map((step, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-xs font-semibold bg-foreground/[0.06] border border-border/40 px-2 py-0.5 rounded-md leading-normal">
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <svg className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
                )}
              </span>
            ))}
          </div>

          {/* If losing — shown when data exists */}
          {card.if_losing_points && (
            <div className="flex gap-2 items-start border-t border-border/30 pt-2">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-500/70 whitespace-nowrap flex-shrink-0 pt-px">If losing</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug line-clamp-1">{card.if_losing_points}</p>
            </div>
          )}
        </div>
      ) : matchCount > 0 ? (
        <div className="px-4 py-3">
          <p className="text-xs text-amber-400 font-medium">Footage ready — tap to generate gameplan</p>
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground/50">No footage scouted yet — tap to add</p>
        </div>
      )}
    </Link>
  )
}

export default async function GameDayPage() {
  const userId = await getOrCreateDbUserId().catch(() => null)
  if (!userId) {
    return <div className="p-6 text-sm text-muted-foreground">Sign in to see your game day plan.</div>
  }

  // Today at midnight for date comparison
  const todayStr = new Date().toISOString().slice(0, 10)

  // Upcoming tournaments only
  const upcomingTournaments = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      eventDate: tournaments.eventDate,
      ruleset: tournaments.ruleset,
    })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.userId, userId),
        eq(tournaments.status, 'upcoming'),
        or(isNull(tournaments.eventDate), gte(tournaments.eventDate, todayStr))
      )
    )
    .orderBy(tournaments.eventDate)

  if (upcomingTournaments.length === 0) {
    return (
      <div className="max-w-xl space-y-5">
        <h1 className="text-2xl font-bold">Match Day</h1>
        <div className="rounded-xl border border-dashed p-12 text-center space-y-2">
          <p className="font-semibold">Nothing on the books yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            <Link href="/tournaments" className="underline underline-offset-2 hover:text-foreground transition-colors">Add your next tournament</Link>{' '}
            and this is where your fight-day plan comes together — opponents, gameplans, and the countdown, all in one place.
          </p>
        </div>
        <SampleGameDayPreview />
      </div>
    )
  }

  // Load opponents + gameplans for each tournament
  const tournamentData = await Promise.all(
    upcomingTournaments.map(async (t) => {
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

          const scoutedCount = await db
            .select({ id: matches.id })
            .from(matches)
            .where(and(eq(matches.tournamentOpponentId, opp.id), eq(matches.status, 'analysed')))
            .then(r => r.length)

          const plan = (gp?.status !== 'generating' && gp?.structuredPlan && Object.keys(gp.structuredPlan as object).length > 0)
            ? gp.structuredPlan as GameplanOutput
            : null

          return {
            opponent: opp,
            plan,
            prediction: (gp?.prediction ?? null) as MatchupPrediction | null,
            matchCount: scoutedCount,
          }
        })
      )

      return { tournament: t, opponents: oppData }
    })
  )

  // First upcoming tournament is the "next" one
  const nextTournament = tournamentData[0]

  return (
    <div className="max-w-2xl space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold mb-0.5">Match Day</h1>
        <p className="text-sm text-muted-foreground">Your match-day briefings</p>
      </div>

      {tournamentData.map(({ tournament, opponents }, tIdx) => {
        const days = daysUntil(tournament.eventDate)
        const isNext = tIdx === 0
        const isToday = days === 0

        return (
          <div key={tournament.id} className="space-y-3">
            {/* Tournament header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {isNext && !isToday && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Next up</p>
                )}
                <h2 className="font-bold text-base leading-snug line-clamp-2">{tournament.name}</h2>
                {tournament.eventDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(tournament.eventDate)}</p>
                )}
              </div>
              {days !== null && (
                <div className={`flex-shrink-0 text-right ${isToday ? 'text-rose-400' : days <= 3 ? 'text-rose-400' : days <= 30 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                  <p className={`font-bold tabular-nums ${isToday ? 'text-2xl' : 'text-xl'}`}>
                    {isToday ? 'Today!' : `${days}d`}
                  </p>
                  {!isToday && <p className="text-[10px] font-medium opacity-60">to go</p>}
                </div>
              )}
            </div>

            {/* Opponent cards */}
            {opponents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No opponents added.{' '}
                <Link href={`/tournaments/${tournament.id}/opponents`} className="underline hover:no-underline">Add opponents →</Link>
              </p>
            ) : (
              <div className="space-y-2.5">
                {opponents.map(({ opponent, plan, prediction, matchCount }) => (
                  <OpponentGameCard
                    key={opponent.id}
                    opponent={opponent}
                    tournamentId={tournament.id}
                    plan={plan}
                    prediction={prediction}
                    matchCount={matchCount}
                  />
                ))}
              </div>
            )}

            {/* Quick link to full gameplan view */}
            <div className="flex justify-end">
              <Link
                href={`/tournaments/${tournament.id}/gameplan`}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Full gameplans →
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
