import { db } from '../../../../../lib/db'
import { tournaments, tournamentOpponents, matches, positionSegments, matchEvents, gameplans, videos, users } from '../../../../../lib/db/schema'
import { eq, inArray, isNull, and, notLike, like, sql } from 'drizzle-orm'
import { AddOpponentForm } from './opponent-forms'
import { ImportBracketDialog } from './import-bracket-dialog'
import { AutoRefresh } from './auto-refresh'
import { PostEventBanner } from './post-event-banner'
import { TournamentFightView, type OpponentRow, type UserCardData } from './fight-view'
import type { GameplanOutput } from '../../../../../lib/ai/schemas/gameplan'
import { getOrCreateDbUserId } from '../../../../../lib/db/get-user'
import { getCommunityMatchCounts } from './actions'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

function DbError({ label, err }: { label: string; err: unknown }) {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    <div className="rounded-lg border border-rose-800/50 bg-rose-950/20 p-4 text-sm text-rose-400">
      <p className="font-semibold mb-1">DB error ({label})</p>
      <pre className="text-xs whitespace-pre-wrap break-all">{msg}</pre>
    </div>
  )
}

export default async function OpponentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params

  const [userId, clerkUser] = await Promise.all([
    getOrCreateDbUserId().catch(() => null),
    currentUser(),
  ])

  const userName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || 'You'

  const userSmootcompAthleteId = userId
    ? await db.select({ smoothcompAthleteId: users.smoothcompAthleteId })
        .from(users).where(eq(users.id, userId)).limit(1)
        .then(r => r[0]?.smoothcompAthleteId ?? null)
        .catch(() => null)
    : null

  const tournamentRow = await db
    .select({ name: tournaments.name, smoothcompUrl: tournaments.smoothcompUrl, eventDate: tournaments.eventDate, outcome: tournaments.outcome })
    .from(tournaments)
    .where(and(eq(tournaments.id, tournamentId), ...(userId ? [eq(tournaments.userId, userId)] : [])))
    .limit(1)
    .then(r => r[0] ?? null)
    .catch(() => null)

  if (!tournamentRow) {
    return <div className="p-6 text-muted-foreground text-sm">Tournament not found.</div>
  }

  const eventDatePassed = tournamentRow.eventDate ? new Date(tournamentRow.eventDate) < new Date() : false
  const showPostEventBanner = eventDatePassed && !tournamentRow.outcome

  // ── Opponents ──────────────────────────────────────────────────────────────
  let opponents: {
    id: string; opponentLabel: string; profilePhotoUrl: string | null
    ajpWins: number | null; ajpLosses: number | null; ajpProfileUrl: string | null
    smoothcompWins: number | null; smoothcompLosses: number | null; smoothcompProfileUrl: string | null
    ibjjfBestResult: string | null; footageStatus: string; intelStatus: string | null
    smoothcompAthleteId: string | null
  }[]

  try {
    opponents = await db.select({
      id: tournamentOpponents.id,
      opponentLabel: tournamentOpponents.opponentLabel,
      profilePhotoUrl: tournamentOpponents.profilePhotoUrl,
      ajpWins: tournamentOpponents.ajpWins,
      ajpLosses: tournamentOpponents.ajpLosses,
      ajpProfileUrl: tournamentOpponents.ajpProfileUrl,
      smoothcompWins: tournamentOpponents.smoothcompWins,
      smoothcompLosses: tournamentOpponents.smoothcompLosses,
      smoothcompProfileUrl: tournamentOpponents.smoothcompProfileUrl,
      ibjjfBestResult: tournamentOpponents.ibjjfBestResult,
      footageStatus: tournamentOpponents.footageStatus,
      intelStatus: tournamentOpponents.intelStatus,
      smoothcompAthleteId: tournamentOpponents.smoothcompAthleteId,
    })
    .from(tournamentOpponents)
    .where(eq(tournamentOpponents.tournamentId, tournamentId))
    .orderBy(tournamentOpponents.createdAt)
  } catch (err) {
    return <DbError label="opponents query" err={err} />
  }

  const opponentIds = opponents.map(o => o.id)

  // ── User own match stats (for the user card) ───────────────────────────────
  let ownTotal = 0, ownWins = 0, userTopSecs = 0, userTotalSecs = 0
  let userTopPositions: { positionId: string; secs: number }[] = []
  let userAttacks: { label: string; count: number }[] = []

  if (userId) {
    try {
      const ownMatchRows = await db
        .select({ id: matches.id, resultWinner: matches.resultWinner })
        .from(matches)
        .innerJoin(videos, eq(videos.id, matches.videoId))
        .where(and(
          eq(matches.userId, userId),
          eq(matches.status, 'analysed'),
          inArray(videos.sourceType, ['own_competition', 'own_sparring']),
        ))

      ownTotal = ownMatchRows.length
      ownWins = ownMatchRows.filter(m => m.resultWinner === 'user').length
      const ownMatchIds = ownMatchRows.map(m => m.id)

      if (ownMatchIds.length > 0) {
        const posRows = await db
          .select({
            positionId: positionSegments.positionId,
            userRole: positionSegments.userRole,
            totalSecs: sql<number>`sum(${positionSegments.endSeconds} - ${positionSegments.startSeconds})`,
          })
          .from(positionSegments)
          .where(inArray(positionSegments.matchId, ownMatchIds))
          .groupBy(positionSegments.positionId, positionSegments.userRole)

        for (const row of posRows) {
          const secs = Number(row.totalSecs)
          userTotalSecs += secs
          if (row.userRole === 'top') {
            userTopSecs += secs
            userTopPositions.push({ positionId: row.positionId, secs })
          }
        }
        userTopPositions.sort((a, b) => b.secs - a.secs)

        const evRows = await db
          .select({ techniqueLabel: matchEvents.techniqueLabel, count: sql<number>`count(*)` })
          .from(matchEvents)
          .where(and(
            inArray(matchEvents.matchId, ownMatchIds),
            eq(matchEvents.actor, 'user'),
            inArray(matchEvents.outcome, ['successful', 'failed']),
          ))
          .groupBy(matchEvents.techniqueLabel)

        userAttacks = evRows
          .filter(r => r.techniqueLabel)
          .map(r => ({ label: r.techniqueLabel!, count: Number(r.count) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)
      }
    } catch { /* user card shows empty state */ }
  }

  // ── Per-opponent fight card data (batched) ─────────────────────────────────
  const scoutedMatchesByOpp: Record<string, { id: string; label: string | null }[]> = {}

  if (opponentIds.length > 0) {
    try {
      const scoutedRows = await db
        .select({ id: matches.id, tournamentOpponentId: matches.tournamentOpponentId, opponentLabel: matches.opponentLabel })
        .from(matches)
        .where(and(inArray(matches.tournamentOpponentId, opponentIds), eq(matches.status, 'analysed')))
        .orderBy(matches.createdAt)

      for (const m of scoutedRows) {
        if (!m.tournamentOpponentId) continue
        scoutedMatchesByOpp[m.tournamentOpponentId] ??= []
        scoutedMatchesByOpp[m.tournamentOpponentId].push({ id: m.id, label: m.opponentLabel ?? null })
      }
    } catch { /* skip */ }
  }

  const allScoutedMatchIds = Object.values(scoutedMatchesByOpp).flat().map(m => m.id)

  // Opponent positions — batched with JOIN
  const oppTopSecsByOpp: Record<string, number> = {}
  const oppTotalSecsByOpp: Record<string, number> = {}
  const oppPositionsByOpp: Record<string, { positionId: string; secs: number }[]> = {}

  if (allScoutedMatchIds.length > 0) {
    try {
      const posRows = await db
        .select({
          positionId: positionSegments.positionId,
          userRole: positionSegments.userRole,
          oppId: matches.tournamentOpponentId,
          totalSecs: sql<number>`sum(${positionSegments.endSeconds} - ${positionSegments.startSeconds})`,
        })
        .from(positionSegments)
        .innerJoin(matches, eq(positionSegments.matchId, matches.id))
        .where(inArray(positionSegments.matchId, allScoutedMatchIds))
        .groupBy(positionSegments.positionId, positionSegments.userRole, matches.tournamentOpponentId)

      for (const row of posRows) {
        const oppId = row.oppId
        if (!oppId) continue
        const secs = Number(row.totalSecs)
        oppTotalSecsByOpp[oppId] = (oppTotalSecsByOpp[oppId] ?? 0) + secs
        // opponent's "top" time = when user_role is 'bottom' (opponent is on top)
        if (row.userRole === 'bottom') {
          oppTopSecsByOpp[oppId] = (oppTopSecsByOpp[oppId] ?? 0) + secs
          oppPositionsByOpp[oppId] ??= []
          oppPositionsByOpp[oppId].push({ positionId: row.positionId, secs })
        }
      }
      for (const oppId of Object.keys(oppPositionsByOpp)) {
        oppPositionsByOpp[oppId].sort((a, b) => b.secs - a.secs)
      }
    } catch { /* skip */ }
  }

  // Opponent attacks — batched
  const oppAttacksByOpp: Record<string, { label: string; count: number }[]> = {}

  if (allScoutedMatchIds.length > 0) {
    try {
      const evRows = await db
        .select({
          techniqueLabel: matchEvents.techniqueLabel,
          oppId: matches.tournamentOpponentId,
          count: sql<number>`count(*)`,
        })
        .from(matchEvents)
        .innerJoin(matches, eq(matchEvents.matchId, matches.id))
        .where(and(
          inArray(matchEvents.matchId, allScoutedMatchIds),
          eq(matchEvents.actor, 'opponent'),
          inArray(matchEvents.outcome, ['successful', 'failed']),
        ))
        .groupBy(matchEvents.techniqueLabel, matches.tournamentOpponentId)

      const rawByOpp: Record<string, { label: string; count: number }[]> = {}
      for (const row of evRows) {
        const oppId = row.oppId
        if (!oppId || !row.techniqueLabel) continue
        rawByOpp[oppId] ??= []
        rawByOpp[oppId].push({ label: row.techniqueLabel, count: Number(row.count) })
      }
      for (const oppId of Object.keys(rawByOpp)) {
        oppAttacksByOpp[oppId] = rawByOpp[oppId].sort((a, b) => b.count - a.count).slice(0, 4)
      }
    } catch { /* skip */ }
  }

  // Gameplans — batched
  type GameplanRow = { opponentId: string | null; structuredPlan: unknown; prediction: unknown; status: string | null }
  const gameplanByOpp: Record<string, GameplanRow> = {}

  if (opponentIds.length > 0) {
    try {
      const gps = await db
        .select({ opponentId: gameplans.opponentId, structuredPlan: gameplans.structuredPlan, prediction: gameplans.prediction, status: gameplans.status })
        .from(gameplans)
        .where(eq(gameplans.tournamentId, tournamentId))

      for (const g of gps) {
        if (!g.opponentId) continue
        // keep latest (already ordered by pk desc implicitly via default order)
        gameplanByOpp[g.opponentId] ??= g
      }
    } catch { /* skip */ }
  }

  // Videos for active scan check
  let hasActiveScans = false
  if (opponentIds.length > 0) {
    try {
      const pendingVids = await db
        .select({ status: videos.status })
        .from(videos)
        .leftJoin(matches, eq(matches.videoId, videos.id))
        .where(and(
          inArray(videos.tournamentOpponentId, opponentIds),
          isNull(matches.id),
          notLike(videos.r2Key, 'chunk/%'),
        ))
        .limit(5)

      const matchStatuses = await db
        .select({ status: matches.status })
        .from(matches)
        .where(inArray(matches.tournamentOpponentId, opponentIds))
        .limit(20)

      hasActiveScans =
        matchStatuses.some(m => m.status === 'processing' || m.status === 'pending') ||
        pendingVids.some(v => v.status === 'processing' || v.status === 'uploaded') ||
        opponents.some(o => o.footageStatus === 'pending' || o.footageStatus === 'auto_queued') ||
        opponents.some(o => o.intelStatus === null || o.intelStatus === 'running')
    } catch { /* skip */ }
  }

  // Community footage counts
  const smoothcompIds = opponents.map(o => o.smoothcompAthleteId).filter(Boolean) as string[]
  const communityCountByAthleteId: Record<string, number> = userId && smoothcompIds.length > 0
    ? await getCommunityMatchCounts(smoothcompIds, userId, opponentIds).catch(() => ({}))
    : {}
  const communityCountByOpponentId: Record<string, number> = Object.fromEntries(
    opponents
      .filter(o => o.smoothcompAthleteId && communityCountByAthleteId[o.smoothcompAthleteId!])
      .map(o => [o.id, communityCountByAthleteId[o.smoothcompAthleteId!]])
  )

  // ── Build per-opponent data ────────────────────────────────────────────────
  const opponentData: OpponentRow[] = opponents.map(opp => {
    const scoutedMatches = scoutedMatchesByOpp[opp.id] ?? []
    const gp = gameplanByOpp[opp.id]
    const plan = gp && gp.status !== 'generating' && gp.structuredPlan && Object.keys(gp.structuredPlan as object).length > 0
      ? gp.structuredPlan as GameplanOutput
      : null
    const prediction = gp?.prediction as { verdict?: string; win_probability?: number } | null | undefined
    const topSecs = oppTopSecsByOpp[opp.id] ?? 0
    const totalSecs = oppTotalSecsByOpp[opp.id] ?? 0

    return {
      id: opp.id,
      opponentLabel: opp.opponentLabel,
      profilePhotoUrl: opp.profilePhotoUrl ?? null,
      ajpWins: opp.ajpWins,
      ajpLosses: opp.ajpLosses,
      ajpProfileUrl: opp.ajpProfileUrl,
      smoothcompWins: opp.smoothcompWins,
      smoothcompLosses: opp.smoothcompLosses,
      smoothcompProfileUrl: opp.smoothcompProfileUrl,
      ibjjfBestResult: opp.ibjjfBestResult,
      footageStatus: opp.footageStatus ?? 'manual',
      intelStatus: opp.intelStatus,
      scoutedMatchCount: scoutedMatches.length,
      scoutedMatches,
      topPositions: (oppPositionsByOpp[opp.id] ?? []).slice(0, 3),
      attacks: oppAttacksByOpp[opp.id] ?? [],
      topPct: totalSecs > 0 ? Math.round((topSecs / totalSecs) * 100) : null,
      gameplanVerdict: prediction?.verdict ?? null,
      winProbability: prediction?.win_probability ?? null,
      card: plan?.match_card ?? null,
      gameplanStatus: gp?.status ?? null,
      hasGameplan: !!plan,
      communityMatchCount: communityCountByOpponentId[opp.id] ?? 0,
      hasFootage: scoutedMatches.length > 0 || (opp.footageStatus !== 'manual'),
    }
  })

  const userData: UserCardData = {
    ownTotal,
    ownWins,
    userTopPct: userTotalSecs > 0 ? Math.round((userTopSecs / userTotalSecs) * 100) : null,
    topPositions: userTopPositions.slice(0, 3),
    attacks: userAttacks,
  }

  return (
    <div className="space-y-5">
      {hasActiveScans && <AutoRefresh />}
      {showPostEventBanner && tournamentRow && (
        <PostEventBanner tournamentId={tournamentId} tournamentName={tournamentRow.name} />
      )}

      {opponents.length === 0 ? (
        /* Empty state — unchanged */
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <span className="text-primary text-sm font-semibold">Step 2 of 3</span>
            <div className="flex items-center gap-1">
              <span className="text-primary text-lg">●</span>
              <span className="text-primary text-lg">●</span>
              <span className="text-muted-foreground/40 text-lg">●</span>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1">Who are you facing?</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add the athletes you might meet in your bracket — the AI will scout their footage and build you a gameplan for each.
            </p>
          </div>
          <div className="flex items-center gap-3 justify-center flex-wrap">
            <ImportBracketDialog
              tournamentId={tournamentId}
              hasBracketUrl={!!tournamentRow.smoothcompUrl?.includes('/bracket/')}
            />
            <span className="text-xs text-muted-foreground">or</span>
            <AddOpponentForm tournamentId={tournamentId} />
          </div>
        </div>
      ) : (
        <TournamentFightView
          userName={userName}
          tournamentId={tournamentId}
          userData={userData}
          opponents={opponentData}
          smoothcompUrl={tournamentRow.smoothcompUrl ?? null}
          userSmootcompAthleteId={userSmootcompAthleteId}
        />
      )}
    </div>
  )
}
