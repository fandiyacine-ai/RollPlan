import React, { Suspense } from 'react'
import { db } from '../../../lib/db'
import { matches, insights, videos, positionSegments, matchEvents, users, tournaments, tournamentOpponents, gameplans, playerCards } from '../../../lib/db/schema'
import { desc, eq, inArray, isNull, and, ne, or, sql } from 'drizzle-orm'
import Link from 'next/link'
import { buttonVariants } from '../../../components/ui/button'
import RefreshPoller from './refresh-poller'
import { DeleteVideoButton } from './delete-video-button'
import { ClearAllButton } from './clear-all-button'
import { POSITIONS } from '../../../lib/taxonomy/positions'
import { auth, currentUser } from '@clerk/nextjs/server'
import { ControlTrendChart, type TrendPoint } from './progress-chart'
import { TransitionDiagram, type TransitionData } from './transition-diagram'
import { ShareCardButton } from './share-card-button'
import type { ShareCardData } from './share-card'
import { RulesetBadge } from '@/components/ruleset-badge'
import { TrainingPlanSection } from './training-plan-section'
import type { TrainingPlan } from '../../../lib/ai/schemas/training-plan'
import { checkMonthlyLimit } from '../../../lib/db/usage'
import { UpgradeConversion } from './upgrade-conversion'
import { SignupConversion } from './signup-conversion'

export const dynamic = 'force-dynamic'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))

const POSITION_DRILL_HINTS: Record<string, string> = {
  'guard_bottom':       'Hip escapes, guard recovery, sweeps from bottom',
  'side_control_bottom':'Frames + bridge-and-roll, sit-out to turtle',
  'mount_bottom':       'Upa escape, elbow-knee escape, create frames early',
  'back_defending':     'Chin-to-chest defence, seat-belt strip, escape to guard',
  'half_guard_bottom':  'Knee-shield, deep half entry, underhook battle',
  'turtle':             'Granby roll, guard recovery, standing up safely',
  'knee_on_belly':      'Elbow-knee escape, bridge into guard',
  'north_south':        'Hip escape, swim to guard, underhook to half',
  'closed_guard_bottom':'Break posture, sweep setups, submission entries',
}

function drillHint(posId: string): string | null {
  return POSITION_DRILL_HINTS[posId] ?? null
}

function controlVerdict(pct: number): { label: string; colour: string; tip: string } {
  if (pct >= 66) return { label: 'Dominant', colour: 'text-blue-400', tip: 'You control the pace — maintain and attack.' }
  if (pct >= 40) return { label: 'Solid', colour: 'text-amber-400', tip: 'Good base — work on converting control to finishes.' }
  return { label: 'Developing', colour: 'text-amber-400', tip: 'Focus on holding top position longer before attacking.' }
}

const BELT_STYLE: Record<string, { bg: string; text: string }> = {
  white:  { bg: 'bg-zinc-200',    text: 'text-zinc-900' },
  blue:   { bg: 'bg-blue-600',    text: 'text-white' },
  purple: { bg: 'bg-purple-600',  text: 'text-white' },
  brown:  { bg: 'bg-amber-800',   text: 'text-white' },
  black:  { bg: 'bg-zinc-950 ring-1 ring-zinc-600', text: 'text-white' },
  grey:   { bg: 'bg-gray-400',    text: 'text-white' },
  yellow: { bg: 'bg-yellow-400',  text: 'text-black' },
  orange: { bg: 'bg-orange-500',  text: 'text-white' },
  green:  { bg: 'bg-green-600',   text: 'text-white' },
}


function fmt(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(d: string | null): number | null {
  if (!d) return null
  const target = new Date(d + 'T12:00:00')
  return Math.ceil((target.getTime() - Date.now()) / 86400000)
}

export default async function PlayerCardPage() {
  const { userId: clerkId } = await auth()
  const clerkUser = clerkId ? await currentUser() : null

  let dbUser: typeof users.$inferSelect | null = null
  if (clerkId) {
    dbUser = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }) ?? null
  }

  const canGenerate = dbUser ? (await checkMonthlyLimit(dbUser.id)).allowed : true

  const displayName = clerkUser
    ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.emailAddresses?.[0]?.emailAddress || 'Athlete'
    : 'Athlete'

  const matchFilter = dbUser
    ? or(eq(matches.userId, dbUser.id), isNull(matches.userId))
    : isNull(matches.userId)

  const recentMatches = await db
    .select({
      id: matches.id,
      status: matches.status,
      format: matches.format,
      context: matches.context,
      createdAt: matches.createdAt,
      sourceType: videos.sourceType,
      resultWinner: matches.resultWinner,
      resultMethod: matches.resultMethod,
    })
    .from(matches)
    .leftJoin(videos, eq(matches.videoId, videos.id))
    .where(and(matchFilter, or(isNull(videos.sourceType), ne(videos.sourceType, 'opponent'))))
    .orderBy(desc(matches.createdAt))
    .limit(50)

  const videoFilter = dbUser
    ? or(eq(videos.userId, dbUser.id), isNull(videos.userId))
    : isNull(videos.userId)

  const videosWithNoMatches = await db
    .select({ id: videos.id, originalFilename: videos.originalFilename, sourceType: videos.sourceType, status: videos.status })
    .from(videos)
    .leftJoin(matches, eq(matches.videoId, videos.id))
    .where(and(isNull(matches.id), ne(videos.status, 'analysed'), ne(videos.sourceType, 'opponent'), videoFilter))
    .limit(10)

  const scanningVideos = videosWithNoMatches.filter(v => v.status !== 'failed')
  const failedVideos = videosWithNoMatches.filter(v => v.status === 'failed')

  const ownAnalysedIds = recentMatches.filter(m => m.status === 'analysed').map(m => m.id)
  const pendingCount = recentMatches.filter(m => m.status === 'pending' || m.status === 'processing').length + scanningVideos.length

  const [allInsights, allSegments, allEvents] = await Promise.all([
    ownAnalysedIds.length > 0
      ? db.select().from(insights).where(inArray(insights.matchId, ownAnalysedIds))
      : Promise.resolve([]),
    ownAnalysedIds.length > 0
      ? db.select().from(positionSegments).where(inArray(positionSegments.matchId, ownAnalysedIds))
      : Promise.resolve([]),
    ownAnalysedIds.length > 0
      ? db.select().from(matchEvents).where(inArray(matchEvents.matchId, ownAnalysedIds))
      : Promise.resolve([]),
  ])

  // ── Get-started checklist DB checks ──
  const hasAnyOpponent = dbUser ? (await db
    .select({ id: tournamentOpponents.id })
    .from(tournamentOpponents)
    .innerJoin(tournaments, eq(tournamentOpponents.tournamentId, tournaments.id))
    .where(eq(tournaments.userId, dbUser.id))
    .limit(1)).length > 0 : false

  const hasAnyFootage = dbUser ? (await db
    .select({ id: videos.id })
    .from(videos)
    .innerJoin(tournamentOpponents, eq(videos.tournamentOpponentId, tournamentOpponents.id))
    .innerJoin(tournaments, eq(tournamentOpponents.tournamentId, tournaments.id))
    .where(and(eq(tournaments.userId, dbUser.id), eq(videos.sourceType, 'opponent')))
    .limit(1)).length > 0 : false

  const hasAnyGameplan = dbUser ? (await db
    .select({ id: gameplans.id })
    .from(gameplans)
    .innerJoin(tournaments, eq(gameplans.tournamentId, tournaments.id))
    .where(eq(tournaments.userId, dbUser.id))
    .limit(1)).length > 0 : false

  // ── Upcoming tournaments for sidebar ──
  const upcomingTournaments = dbUser ? await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      eventDate: tournaments.eventDate,
      ruleset: tournaments.ruleset,
      opponentCount: sql<number>`count(distinct ${tournamentOpponents.id})::int`,
      gameplanCount: sql<number>`count(distinct ${gameplans.id})::int`,
    })
    .from(tournaments)
    .leftJoin(tournamentOpponents, eq(tournamentOpponents.tournamentId, tournaments.id))
    .leftJoin(gameplans, eq(gameplans.tournamentId, tournaments.id))
    .where(and(
      eq(tournaments.userId, dbUser.id),
      or(eq(tournaments.status, 'upcoming'), isNull(tournaments.status)),
    ))
    .groupBy(tournaments.id)
    .orderBy(sql`CASE WHEN ${tournaments.eventDate} IS NULL THEN 1 ELSE 0 END, ${tournaments.eventDate} ASC`)
    .limit(5)
    .catch(() => [] as { id: string; name: string; eventDate: string | null; ruleset: string | null; opponentCount: number; gameplanCount: number }[])
    : []

  // ── Training plan ──
  const trainingPlanRow = dbUser ? await db
    .select({ trainingPlan: playerCards.trainingPlan, trainingPlanGeneratedAt: playerCards.trainingPlanGeneratedAt, trainingPlanStatus: playerCards.trainingPlanStatus })
    .from(playerCards)
    .where(and(eq(playerCards.ownerId, dbUser.id), eq(playerCards.ownerType, 'user')))
    .limit(1)
    .then(rows => rows[0] ?? null)
    .catch(() => null)
    : null

  // ── Stats ──
  const totalAnalyzedTime = allSegments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalDominantTime = allSegments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalInferiorTime = allSegments.filter(s => s.dominance === 'inferior').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const controlPct = totalAnalyzedTime > 0 ? Math.round((totalDominantTime / totalAnalyzedTime) * 100) : 0
  const underPressurePct = totalAnalyzedTime > 0 ? Math.round((totalInferiorTime / totalAnalyzedTime) * 100) : 0
  const avgMatchDuration = ownAnalysedIds.length > 0 ? Math.round(totalAnalyzedTime / ownAnalysedIds.length) : 0
  const subAttempts = allEvents.filter(e => e.actor === 'user' && e.eventTypeId.includes('submission')).length

  // ── Record ──
  const wins = recentMatches.filter(m => m.status === 'analysed' && m.resultWinner === 'user').length
  const losses = recentMatches.filter(m => m.status === 'analysed' && m.resultWinner === 'opponent').length
  const subWins = recentMatches.filter(m => m.resultWinner === 'user' && m.resultMethod === 'submission').length
  const hasRecord = wins > 0 || losses > 0

  // ── Per-match trend (chronological) ──
  const perMatchTrend: TrendPoint[] = ownAnalysedIds
    .map(id => {
      const segs = allSegments.filter(s => s.matchId === id)
      const total = segs.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
      const dominant = segs.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
      const inferior = segs.filter(s => s.dominance === 'inferior').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
      const match = recentMatches.find(m => m.id === id)
      return {
        controlRate: total > 0 ? Math.round((dominant / total) * 100) : 0,
        pressureRate: total > 0 ? Math.round((inferior / total) * 100) : 0,
        createdAt: (match?.createdAt ?? new Date()).toISOString(),
      }
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-20)

  const trendDelta = (() => {
    if (perMatchTrend.length < 4) return null
    const recent = perMatchTrend.slice(-3)
    const older = perMatchTrend.slice(-6, -3)
    if (older.length === 0) return null
    const recentAvg = recent.reduce((a, b) => a + b.controlRate, 0) / recent.length
    const olderAvg = older.reduce((a, b) => a + b.controlRate, 0) / older.length
    return Math.round(recentAvg - olderAvg)
  })()

  // ── Position breakdown ──
  const positionStats: Record<string, { total: number; dominant: number; neutral: number; inferior: number }> = {}
  for (const seg of allSegments) {
    const dur = seg.endSeconds - seg.startSeconds
    if (!positionStats[seg.positionId]) positionStats[seg.positionId] = { total: 0, dominant: 0, neutral: 0, inferior: 0 }
    positionStats[seg.positionId].total += dur
    positionStats[seg.positionId][seg.dominance as 'dominant' | 'neutral' | 'inferior'] += dur
  }

  const sortedPositions = Object.entries(positionStats).sort((a, b) => b[1].total - a[1].total)
  const maxPositionTime = sortedPositions[0]?.[1].total ?? 1

  const sharpPositions = sortedPositions
    .filter(([, s]) => s.total > 30 && (s.dominant / s.total) >= 0.5)
    .sort(([, a], [, b]) => (b.dominant / b.total) - (a.dominant / a.total))
    .slice(0, 5)

  const exposedPositions = sortedPositions
    .filter(([, s]) => s.total > 30 && (s.inferior / s.total) >= 0.3)
    .sort(([, a], [, b]) => (b.inferior / b.total) - (a.inferior / a.total))
    .slice(0, 5)

  // ── Position transitions ──
  const transitionCounts: Record<string, Record<string, { count: number; yourActionCount: number }>> = {}
  type SegItem = { matchId: string; positionId: string; startSeconds: number; endSeconds: number; dominance: string }
  const matchGroups: Record<string, SegItem[]> = {}
  for (const seg of allSegments) {
    if (!matchGroups[seg.matchId]) matchGroups[seg.matchId] = []
    matchGroups[seg.matchId].push(seg)
  }
  for (const segs of Object.values(matchGroups)) {
    const sorted = [...segs].sort((a, b) => a.startSeconds - b.startSeconds)
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i].positionId
      const to = sorted[i + 1].positionId
      if (from === to) continue
      if (!transitionCounts[from]) transitionCounts[from] = {}
      if (!transitionCounts[from][to]) transitionCounts[from][to] = { count: 0, yourActionCount: 0 }
      transitionCounts[from][to].count += 1
      if (sorted[i].dominance === 'dominant') transitionCounts[from][to].yourActionCount += 1
    }
  }
  const transitionEdges = Object.entries(transitionCounts).flatMap(([fromId, tos]) =>
    Object.entries(tos).map(([toId, { count, yourActionCount }]) => ({
      fromId, toId, count,
      yourAction: yourActionCount >= count / 2,
    }))
  ).sort((a, b) => b.count - a.count)

  const transitionData: TransitionData = {
    nodes: sortedPositions.slice(0, 6).map(([id, s]) => ({
      id, name: POSITION_MAP[id] ?? id,
      totalTime: s.total, dominantTime: s.dominant, inferiorTime: s.inferior,
    })),
    edges: transitionEdges,
  }

  // ── Signature techniques ──
  const myTechniques: Record<string, number> = {}
  const theirTechniques: Record<string, number> = {}
  for (const e of allEvents) {
    if (!e.techniqueLabel) continue
    if (e.actor === 'user') myTechniques[e.techniqueLabel] = (myTechniques[e.techniqueLabel] ?? 0) + 1
    else if (e.actor === 'opponent') theirTechniques[e.techniqueLabel] = (theirTechniques[e.techniqueLabel] ?? 0) + 1
  }
  const topMyTech = Object.entries(myTechniques).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topTheirTech = Object.entries(theirTechniques).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxMyTech = topMyTech[0]?.[1] ?? 1
  const maxTheirTech = topTheirTech[0]?.[1] ?? 1

  const isProcessing = scanningVideos.length > 0 || recentMatches.some(m => m.status === 'pending' || m.status === 'processing')
  const isEmpty = recentMatches.length === 0 && scanningVideos.length === 0 && failedVideos.length === 0

  const matchesSub = pendingCount > 0 ? `${pendingCount} analysing…` : undefined

  const shareCardData: ShareCardData = {
    name: displayName,
    belt: dbUser?.belt ?? null,
    gym: dbUser?.gym ?? null,
    controlPct,
    underPressurePct,
    matchCount: ownAnalysedIds.length,
    totalMatSeconds: totalAnalyzedTime,
    strongPositions: sharpPositions.slice(0, 3).map(([id, s]) => ({
      name: POSITION_MAP[id] ?? id,
      dominantPct: s.total > 0 ? s.dominant / s.total : 0,
    })),
    exposedPositions: exposedPositions.slice(0, 3).map(([id, s]) => ({
      name: POSITION_MAP[id] ?? id,
      inferiorPct: s.total > 0 ? s.inferior / s.total : 0,
    })),
  }

  return (
    <div className="w-full max-w-7xl">
      <Suspense fallback={null}>
        <UpgradeConversion />
      </Suspense>
      <Suspense fallback={null}>
        <SignupConversion />
      </Suspense>
      {isProcessing && <RefreshPoller />}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-start">

        {/* ── Left: Analytics ── */}
        <div className="space-y-5 min-w-0">
          <ProfileHeader name={displayName} dbUser={dbUser} />

          {isEmpty && hasAnyOpponent ? (
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold">Upload your first match</p>
                <p className="text-xs text-muted-foreground mt-0.5">You&apos;ve got opponents set up — upload footage and your player card will populate automatically.</p>
              </div>
              <Link href="/upload" className={buttonVariants()}>
                + Analyse a match
              </Link>
            </div>
          ) : isEmpty ? (
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-5">
              <div>
                <p className="text-sm font-semibold">Get started</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your player card builds from match footage — follow these steps.</p>
              </div>
              <div className="space-y-3">
                {[
                  { step: '1', label: 'Create a tournament', sub: 'Name, date, and ruleset', href: '/tournaments', done: upcomingTournaments.length > 0 },
                  { step: '2', label: 'Add your opponent', sub: 'Name and division', href: '/tournaments', done: hasAnyOpponent },
                  { step: '3', label: 'Upload footage', sub: 'YouTube link or video file', href: '/upload', done: hasAnyFootage },
                  { step: '4', label: 'Generate gameplan', sub: 'AI analyses the footage', href: '/gameplans', done: hasAnyGameplan },
                ].map(item => (
                  <Link key={item.step} href={item.href} className="flex items-center gap-3 group hover:text-foreground transition-colors">
                    <span className={`w-6 h-6 rounded-full border text-[10px] font-bold flex items-center justify-center flex-shrink-0 transition-colors ${item.done ? 'border-blue-500/40 bg-blue-500/10 text-blue-500' : 'border-border/60 bg-muted/40 text-muted-foreground group-hover:border-foreground/30'}`}>
                      {item.done ? '✓' : item.step}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${item.done ? 'line-through text-muted-foreground' : ''}`}>{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.sub}</p>
                    </div>
                    {!item.done && <svg className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors ml-auto flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>}
                  </Link>
                ))}
              </div>
            </div>
          ) : isProcessing && ownAnalysedIds.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
                <p className="text-sm font-semibold">Analysis in progress</p>
              </div>
              <p className="text-sm text-muted-foreground">Your footage is being analysed — your player card will appear here shortly. This usually takes 1–3 minutes.</p>
              <Link href="/matches" className="text-xs text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">View match status →</Link>
            </div>
          ) : (
            <>
              {/* Hero stats strip */}
              {ownAnalysedIds.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Control rate — most important, gets special treatment */}
                  {(() => {
                    const v = controlVerdict(controlPct)
                    return (
                      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2 col-span-2 sm:col-span-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">Control Rate</p>
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${v.colour}`}>{v.label}</span>
                        </div>
                        <div className="flex items-end gap-2">
                          <span className="text-3xl font-bold tabular-nums leading-none">{controlPct}%</span>
                          {trendDelta != null && trendDelta !== 0 && (
                            <span className={`text-xs font-medium mb-1 ${trendDelta > 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                              {trendDelta > 0 ? '↑' : '↓'}{Math.abs(trendDelta)}
                            </span>
                          )}
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-foreground/40 transition-all" style={{ width: `${controlPct}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 leading-snug">{v.tip}</p>
                      </div>
                    )
                  })()}
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium">Matches</p>
                      {matchesSub ? <p className="text-[10px] text-muted-foreground">{matchesSub}</p> : null}
                    </div>
                    <p className="text-3xl font-bold tabular-nums leading-none">{ownAnalysedIds.length}</p>
                    <div className="border-t border-border/60 pt-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground font-medium">Mat Time</p>
                        {avgMatchDuration > 0 ? <p className="text-[10px] text-muted-foreground">avg {fmt(avgMatchDuration)}</p> : null}
                      </div>
                      <p className="text-3xl font-bold tabular-nums leading-none">{fmt(totalAnalyzedTime)}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">Attacks</p>
                    <p className="text-3xl font-bold tabular-nums leading-none">{subAttempts}</p>
                    <p className="text-xs text-muted-foreground">sub attempts</p>
                  </div>
                </div>
              )}

              {/* Top gap callout — above the fold */}
              {exposedPositions.length > 0 && (() => {
                const [posId, stats] = exposedPositions[0]
                const pct = Math.round((stats.inferior / stats.total) * 100)
                const posName = POSITION_MAP[posId] ?? posId
                const hint = drillHint(posId)
                return (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide">Priority gap</p>
                    <p className="text-sm font-semibold leading-snug">
                      You get put in trouble in <span className="text-rose-400">{posName}</span> — {pct}% of the time there you&apos;re under pressure.
                    </p>
                    {hint && <p className="text-xs text-muted-foreground leading-snug">Drill: {hint}</p>}
                  </div>
                )
              })()}

              {/* Progress over time */}
              {ownAnalysedIds.length >= 2 && (
                <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                  <div className="px-5 py-2.5 border-b border-border/60 flex items-center justify-between">
                    <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 9l3-3 2 2 5-5.5"/></svg>
                      Progress over time
                    </h2>
                    {trendDelta !== null && trendDelta !== 0 && (
                      <span className={`text-xs font-semibold ${trendDelta > 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                        {trendDelta > 0 ? '↑' : '↓'} {Math.abs(trendDelta)}% vs prev 3
                      </span>
                    )}
                  </div>
                  <div className="px-5 pt-3 pb-1">
                    <div className="flex items-center gap-5 text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-0.5 bg-blue-400 rounded-full" />Control Rate
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-0.5 bg-rose-500/50 rounded-full" />Under Pressure
                      </span>
                    </div>
                    <ControlTrendChart data={perMatchTrend} />
                  </div>
                </div>
              )}

              {/* Processing banner */}
              {pendingCount > 0 && (
                <div className="rounded-xl border border-border/60 bg-card px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse" />
                    <p className="text-sm text-muted-foreground">
                      {pendingCount} match{pendingCount !== 1 ? 'es' : ''} being analysed
                    </p>
                  </div>
                  <Link href="/matches" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    View →
                  </Link>
                </div>
              )}

              {/* Game DNA */}
              {(sharpPositions.length > 0 || exposedPositions.length > 0) && (
                <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                  <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
                    <div>
                      <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2c3.5 0 5.5 2 5.5 4s2 4 5.5 4"/><path d="M10 2c-3.5 0-5.5 2-5.5 4s-2 4-5.5 4"/></svg>
                        Game DNA
                      </h2>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">% of time in that position in control / under pressure</p>
                    </div>
                    <span className="text-xs text-muted-foreground/50 shrink-0 ml-3 tabular-nums">{ownAnalysedIds.length} matches</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border/60">
                    <div className="p-4 space-y-3.5">
                      <p className="text-xs font-medium text-blue-500">Strongest</p>
                      {sharpPositions.length > 0 ? sharpPositions.map(([id, s]) => {
                        const pct = Math.round((s.dominant / s.total) * 100)
                        return (
                          <div key={id}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium">{POSITION_MAP[id] ?? id}</span>
                              <span className="text-sm font-semibold text-blue-500 tabular-nums">{pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      }) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
                    </div>
                    <div className="p-4 space-y-3.5">
                      <p className="text-xs font-medium text-rose-500">Exposed</p>
                      {exposedPositions.length > 0 ? exposedPositions.map(([id, s]) => {
                        const pct = Math.round((s.inferior / s.total) * 100)
                        const hint = drillHint(id)
                        return (
                          <div key={id}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium">{POSITION_MAP[id] ?? id}</span>
                              <span className="text-sm font-semibold text-rose-500 tabular-nums">{pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            {hint && <p className="text-[10px] text-muted-foreground/50 mt-1 leading-snug">Drill: {hint}</p>}
                          </div>
                        )
                      }) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Top attacks — compact & actionable */}
              {topMyTech.length >= 1 && (
                <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-border/60">
                    <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4.5"/><circle cx="6" cy="6" r="1.5"/></svg>
                      Top attacks
                    </h2>
                  </div>
                  <div className="px-5 py-3 space-y-2.5">
                    {topMyTech.slice(0, 3).map(([tech, count]) => (
                      <div key={tech} className="flex items-center justify-between">
                        <span className="text-sm capitalize font-medium">{tech}</span>
                        <span className="text-xs font-semibold text-blue-400 tabular-nums">{count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Position breakdown — compact top 5 */}
              {sortedPositions.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4.5"/><path d="M6 3.5v2.5l1.5 1"/></svg>
                    Position breakdown
                  </h2>
                  <div className="rounded-xl border bg-card px-4 py-2.5 space-y-2">
                    {sortedPositions.slice(0, 5).map(([posId, stats]) => {
                      const domPct = (stats.dominant / stats.total) * 100
                      const infPct = (stats.inferior / stats.total) * 100
                      const neuPct = Math.max(0, 100 - domPct - infPct)
                      return (
                        <div key={posId}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium">{POSITION_MAP[posId] ?? posId}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{fmt(stats.total)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full flex rounded-full overflow-hidden">
                              <div className="bg-blue-500" style={{ width: `${domPct}%` }} />
                              <div className="bg-zinc-500/50" style={{ width: `${neuPct}%` }} />
                              <div className="bg-rose-500" style={{ width: `${infPct}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" /> Control</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" /> Pressure</span>
                  </div>
                </div>
              )}

              {/* Position Transition Flow */}
              {transitionData.nodes.length >= 3 && transitionEdges.length >= 3 && (
                <div className="rounded-xl overflow-hidden border border-border/60 bg-card">
                  <div className="px-5 py-2.5 border-b border-border/60 flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="2" cy="6" r="1.5"/><circle cx="10" cy="2.5" r="1.5"/><circle cx="10" cy="9.5" r="1.5"/><path d="M3.5 5.5l5-2.5M3.5 6.5l5 2.5"/></svg>
                      Position flow
                    </h2>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-blue-500 inline-block rounded-full" />Your move</span>
                      <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-rose-500 inline-block rounded-full" />Opponent move</span>
                    </div>
                  </div>
                  <div className="py-1">
                    <TransitionDiagram data={transitionData} />
                  </div>
                  <p className="px-5 pb-3 text-[10px] text-muted-foreground/30">Arrow weight = transition frequency · {ownAnalysedIds.length} matches</p>
                </div>
              )}

              {/* Failed videos */}
              {failedVideos.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-xs font-medium text-muted-foreground">Failed</h2>
                  {failedVideos.map((v) => (
                    <div key={v.id} className="rounded-xl border border-border/60 bg-card p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{v.originalFilename}</p>
                        <p className="text-xs text-rose-400 mt-0.5">Analysis failed — remove or resubmit</p>
                      </div>
                      <DeleteVideoButton videoId={v.id} />
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <p className="text-xs text-muted-foreground">
                  Stats from {ownAnalysedIds.length} analysed match{ownAnalysedIds.length !== 1 ? 'es' : ''}
                </p>
                <div className="flex items-center gap-2">
                  {ownAnalysedIds.length > 0 && <ShareCardButton data={shareCardData} />}
                  <ClearAllButton />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right: Sidebar ── */}
        <aside className="space-y-4 lg:sticky lg:top-20">

          {/* My Record — only shown once results are logged */}
          {hasRecord && (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/60">
                <h2 className="text-xs font-medium text-muted-foreground">My record</h2>
              </div>
              <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-400 tabular-nums">{wins}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Wins</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-rose-400 tabular-nums">{losses}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Losses</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{ownAnalysedIds.length - wins - losses}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">N/R</p>
                </div>
              </div>
              {wins > 0 && (
                <div className="px-4 pb-3 border-t border-border/40 pt-2.5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Finish rate</p>
                  <p className="text-xs font-semibold tabular-nums">
                    {wins > 0 ? `${Math.round((subWins / wins) * 100)}%` : '—'}
                    <span className="text-muted-foreground font-normal"> by sub</span>
                  </p>
                </div>
              )}
            </div>
          )}



          {/* Upcoming Tournaments */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-xs font-medium text-muted-foreground">Upcoming</h2>
              <Link href="/tournaments" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                All →
              </Link>
            </div>
            {upcomingTournaments.length === 0 ? (
              <div className="px-4 py-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No upcoming tournaments</p>
                <Link href="/tournaments" className="text-xs font-medium text-primary hover:underline">
                  + Add tournament
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {upcomingTournaments.map(t => {
                  const days = daysUntil(t.eventDate)
                  return (
                    <div key={t.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug line-clamp-2">{t.name}</p>
                        {days !== null && days >= 0 && (
                          <span className={`text-[10px] font-bold tabular-nums flex-shrink-0 mt-0.5 ${
                            days === 0 ? 'text-rose-400' : days <= 3 ? 'text-rose-400' : days <= 30 ? 'text-amber-400' : 'text-muted-foreground'
                          }`}>
                            {days === 0 ? 'Today!' : `${days}d`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.eventDate && (
                          <p className="text-xs text-muted-foreground">{fmtDate(t.eventDate)}</p>
                        )}
                        {t.ruleset && <RulesetBadge ruleset={t.ruleset} />}
                      </div>
                      <div className="flex items-center gap-3 pt-0.5">
                        {t.gameplanCount > 0 ? (
                          <>
                            <Link href={`/tournaments/${t.id}/gameplan`} className="text-xs font-medium text-primary hover:underline">
                              Gameplan →
                            </Link>
                            <Link href={`/tournaments/${t.id}/opponents`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                              {t.opponentCount} opponent{t.opponentCount !== 1 ? 's' : ''}
                            </Link>
                          </>
                        ) : (
                          <Link href={`/tournaments/${t.id}/opponents`} className="text-xs font-medium text-primary hover:underline">
                            {t.opponentCount > 0 ? `${t.opponentCount} opponents — scout →` : 'Add opponents →'}
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Training Plan */}
          <TrainingPlanSection
            initialPlan={trainingPlanRow?.trainingPlan as TrainingPlan | null ?? null}
            generatedAt={trainingPlanRow?.trainingPlanGeneratedAt ?? null}
            isGenerating={trainingPlanRow?.trainingPlanStatus === 'generating'}
            canGenerate={canGenerate}
          />

          {/* Settings shortcut */}
          <Link
            href="/settings"
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 bg-card text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors group"
          >
            <span>Profile &amp; training goals</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 group-hover:opacity-80 transition-opacity">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>

        </aside>
      </div>
    </div>
  )
}

// ── Sub-components ──

function ProfileHeader({ name, dbUser }: { name: string; dbUser: typeof users.$inferSelect | null }) {
  const belt = dbUser?.belt
  const gym = dbUser?.gym
  const style = dbUser?.primaryStyle

  return (
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-foreground/[0.06] border border-border/60 text-foreground flex items-center justify-center text-base font-semibold flex-shrink-0">
        {initials(name)}
      </div>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-snug">{name}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {belt && (
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${BELT_STYLE[belt]?.bg ?? 'bg-muted'} ${BELT_STYLE[belt]?.text ?? 'text-foreground'}`}>
              {belt} belt
            </span>
          )}
          {gym ? (
            <span className="text-xs text-muted-foreground">{gym}{style ? ` · ${style === 'no_gi' ? 'No-Gi' : style === 'both' ? 'Gi & No-Gi' : 'Gi'}` : ''}</span>
          ) : (
            <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">Set gym in settings →</Link>
          )}
        </div>
      </div>
    </div>
  )
}
