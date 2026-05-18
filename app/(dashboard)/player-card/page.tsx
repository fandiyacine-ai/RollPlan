import React from 'react'
import { db } from '../../../lib/db'
import { matches, insights, videos, positionSegments, matchEvents, users } from '../../../lib/db/schema'
import { desc, eq, inArray, isNull, and, ne, or } from 'drizzle-orm'
import Link from 'next/link'
import { buttonVariants } from '../../../components/ui/button'
import RefreshPoller from './refresh-poller'
import { DeleteVideoButton } from './delete-video-button'
import { ClearAllButton } from './clear-all-button'
import { POSITIONS } from '../../../lib/taxonomy/positions'
import { auth, currentUser } from '@clerk/nextjs/server'
import { ControlTrendChart, type TrendPoint } from './progress-chart'

export const dynamic = 'force-dynamic'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))

const BELT_STYLE: Record<string, { bg: string; text: string }> = {
  white:  { bg: 'bg-zinc-200',    text: 'text-zinc-900' },
  blue:   { bg: 'bg-blue-600',    text: 'text-white' },
  purple: { bg: 'bg-purple-600',  text: 'text-white' },
  brown:  { bg: 'bg-amber-800',   text: 'text-white' },
  black:  { bg: 'bg-zinc-950 ring-1 ring-zinc-600', text: 'text-white' },
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

export default async function PlayerCardPage() {
  const { userId: clerkId } = await auth()
  const clerkUser = clerkId ? await currentUser() : null

  let dbUser: typeof users.$inferSelect | null = null
  if (clerkId) {
    dbUser = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }) ?? null
  }

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
    })
    .from(matches)
    .leftJoin(videos, eq(matches.videoId, videos.id))
    .where(matchFilter)
    .orderBy(desc(matches.createdAt))
    .limit(50)

  const videoFilter = dbUser
    ? or(eq(videos.userId, dbUser.id), isNull(videos.userId))
    : isNull(videos.userId)

  const videosWithNoMatches = await db
    .select({ id: videos.id, originalFilename: videos.originalFilename, sourceType: videos.sourceType, status: videos.status })
    .from(videos)
    .leftJoin(matches, eq(matches.videoId, videos.id))
    .where(and(isNull(matches.id), ne(videos.status, 'analysed'), videoFilter))
    .limit(10)

  const scanningVideos = videosWithNoMatches.filter(v => v.status !== 'failed')
  const failedVideos = videosWithNoMatches.filter(v => v.status === 'failed')

  // Own matches only for stats (sourceType !== 'opponent')
  const ownAnalysedIds = recentMatches
    .filter(m => m.status === 'analysed' && m.sourceType !== 'opponent')
    .map(m => m.id)

  const scoutedAnalysed = recentMatches.filter(m => m.status === 'analysed' && m.sourceType === 'opponent').length
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

  // ── Stats ──
  const totalAnalyzedTime = allSegments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalDominantTime = allSegments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalInferiorTime = allSegments.filter(s => s.dominance === 'inferior').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const controlPct = totalAnalyzedTime > 0 ? Math.round((totalDominantTime / totalAnalyzedTime) * 100) : 0
  const underPressurePct = totalAnalyzedTime > 0 ? Math.round((totalInferiorTime / totalAnalyzedTime) * 100) : 0
  const avgMatchDuration = ownAnalysedIds.length > 0 ? Math.round(totalAnalyzedTime / ownAnalysedIds.length) : 0
  const subAttempts = allEvents.filter(e => e.actor === 'user' && e.eventTypeId.includes('submission')).length
  const avgAiScore = allInsights.length > 0
    ? Math.round(allInsights.reduce((acc, i) => acc + i.confidence, 0) / allInsights.length * 100)
    : null

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

  // trend delta: last 3 vs previous 3
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

  if (isEmpty) {
    return (
      <div className="max-w-2xl space-y-6">
        <ProfileHeader name={displayName} dbUser={dbUser} />
        <div className="rounded-xl border border-dashed border-border p-16 text-center space-y-4">
          <p className="text-muted-foreground text-sm">No match footage analysed yet.</p>
          <Link href="/upload" className={buttonVariants({ size: 'sm', className: 'rounded-full' })}>
            Analyse your first match
          </Link>
        </div>
      </div>
    )
  }

  const matchesSub = [
    scoutedAnalysed > 0 ? `+${scoutedAnalysed} scouted` : null,
    pendingCount > 0 ? `${pendingCount} analysing…` : null,
  ].filter(Boolean).join(' · ') || undefined

  return (
    <div className="max-w-5xl space-y-8">
      {isProcessing && <RefreshPoller />}

      <ProfileHeader name={displayName} dbUser={dbUser} />

      {/* Stats grid */}
      {ownAnalysedIds.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Matches Analysed"
            value={String(ownAnalysedIds.length)}
            sub={matchesSub}
          />
          <StatCard label="Total Mat Time" value={fmt(totalAnalyzedTime)} />
          <StatCard
            label="Avg Duration"
            value={avgMatchDuration > 0 ? fmt(avgMatchDuration) : '—'}
            sub="per match"
          />
          <StatCard
            label="Control Rate"
            value={`${controlPct}%`}
            sub={`${underPressurePct}% under pressure`}
            accent={controlPct >= 55 ? 'good' : controlPct < 35 ? 'bad' : undefined}
            trend={trendDelta}
          />
          <StatCard
            label="Attacks Attempted"
            value={String(subAttempts)}
            sub="submission attempts"
          />
          <StatCard
            label="AI Confidence"
            value={avgAiScore !== null ? `${avgAiScore}%` : '—'}
            sub="avg analysis score"
          />
        </div>
      )}

      {/* Progress over time */}
      {ownAnalysedIds.length >= 2 && (
        <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
          <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Progress Over Time</h2>
            {trendDelta !== null && trendDelta !== 0 && (
              <span className={`text-xs font-semibold ${trendDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trendDelta > 0 ? '↑' : '↓'} {Math.abs(trendDelta)}% vs prev 3 matches
              </span>
            )}
          </div>
          <div className="px-5 pt-3 pb-1">
            <div className="flex items-center gap-5 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 bg-emerald-400 rounded-full" />
                Control Rate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 bg-rose-500/50 rounded-full" />
                Under Pressure
              </span>
            </div>
            <ControlTrendChart data={perMatchTrend} />
          </div>
        </div>
      )}

      {/* Processing banner */}
      {pendingCount > 0 && (
        <div className="rounded-xl border border-blue-900/30 bg-blue-950/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <p className="text-sm text-muted-foreground">
              {pendingCount} match{pendingCount !== 1 ? 'es' : ''} being analysed
            </p>
          </div>
          <Link href="/matches" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            View in My Matches →
          </Link>
        </div>
      )}

      {/* Game DNA */}
      {(sharpPositions.length > 0 || exposedPositions.length > 0) && (
        <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
          <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Game DNA</h2>
            <span className="text-xs text-muted-foreground">{ownAnalysedIds.length} match{ownAnalysedIds.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div className="p-5 space-y-4">
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Strongest Positions
              </p>
              {sharpPositions.length > 0 ? sharpPositions.map(([id, s]) => {
                const pct = Math.round((s.dominant / s.total) * 100)
                return (
                  <div key={id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm">{POSITION_MAP[id] ?? id}</span>
                      <span className="text-xs font-bold text-emerald-400 tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              }) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                Exposed Positions
              </p>
              {exposedPositions.length > 0 ? exposedPositions.map(([id, s]) => {
                const pct = Math.round((s.inferior / s.total) * 100)
                return (
                  <div key={id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm">{POSITION_MAP[id] ?? id}</span>
                      <span className="text-xs font-bold text-rose-400 tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              }) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Signature techniques */}
      {(topMyTech.length >= 2 || topTheirTech.length >= 2) && (
        <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
          <div className="px-5 py-3 border-b border-border/60">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Signature Game</h2>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div className="p-5 space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Your Weapons</p>
              {topMyTech.length > 0 ? topMyTech.map(([tech, count]) => (
                <div key={tech}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm capitalize">{tech}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count}×</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-foreground/40 rounded-full" style={{ width: `${(count / maxMyTech) * 100}%` }} />
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Opponent Threats</p>
              {topTheirTech.length > 0 ? topTheirTech.map(([tech, count]) => (
                <div key={tech}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm capitalize">{tech}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count}×</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-rose-500/50 rounded-full" style={{ width: `${(count / maxTheirTech) * 100}%` }} />
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Time & Control */}
      {sortedPositions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Time & Control</h2>
          <div className="rounded-xl border bg-card p-5 space-y-4">
            {sortedPositions.slice(0, 10).map(([posId, stats]) => {
              const barPct = (stats.total / maxPositionTime) * 100
              const domPct = (stats.dominant / stats.total) * 100
              const infPct = (stats.inferior / stats.total) * 100
              const neuPct = Math.max(0, 100 - domPct - infPct)
              return (
                <div key={posId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm">{POSITION_MAP[posId] ?? posId}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(stats.total)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barPct}%` }}>
                      <div className="bg-emerald-500" style={{ width: `${domPct}%` }} />
                      <div className="bg-zinc-500/60" style={{ width: `${neuPct}%` }} />
                      <div className="bg-rose-500" style={{ width: `${infPct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> In Control</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-zinc-500/60 inline-block" /> Neutral</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500 inline-block" /> Under Pressure</span>
          </div>
        </div>
      )}

      {/* Failed videos */}
      {failedVideos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Failed</h2>
          {failedVideos.map((v) => (
            <div key={v.id} className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 flex items-center justify-between gap-4">
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
          Stats based on {ownAnalysedIds.length} analysed match{ownAnalysedIds.length !== 1 ? 'es' : ''}
        </p>
        <ClearAllButton />
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
      <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-lg font-bold flex-shrink-0">
        {initials(name)}
      </div>
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-black tracking-tight">{name}</h1>
          {belt && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${BELT_STYLE[belt]?.bg ?? 'bg-muted'} ${BELT_STYLE[belt]?.text ?? 'text-foreground'}`}>
              {belt.charAt(0).toUpperCase() + belt.slice(1)} Belt
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {gym ?? (
            <Link href="#" className="hover:text-foreground transition-colors">Add gym →</Link>
          )}
          {style && ` · ${style === 'no_gi' ? 'No-Gi' : style === 'both' ? 'Gi & No-Gi' : 'Gi'}`}
        </p>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent, trend }: {
  label: string; value: string; sub?: string; accent?: 'good' | 'bad'; trend?: number | null
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between mt-2">
        <p className={`text-3xl font-black tabular-nums tracking-tight leading-none ${
          accent === 'good' ? 'text-emerald-400' : accent === 'bad' ? 'text-rose-400' : 'text-foreground'
        }`}>
          {value}
        </p>
        {trend != null && trend !== 0 && (
          <span className={`text-xs font-bold mb-0.5 ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend > 0 ? '↑' : '↓'}{Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
