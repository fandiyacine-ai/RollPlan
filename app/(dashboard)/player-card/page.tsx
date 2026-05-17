import React from 'react'
import { db } from '../../../lib/db'
import { matches, insights, videos, positionSegments, matchEvents, users } from '../../../lib/db/schema'
import { desc, eq, inArray, isNull, and, ne, or } from 'drizzle-orm'
import Link from 'next/link'
import RefreshPoller from './refresh-poller'
import { DeleteMatchButton } from './delete-match-button'
import { DeleteVideoButton } from './delete-video-button'
import { ClearAllButton } from './clear-all-button'
import { VideoThumbnail } from './video-thumbnail'
import { POSITIONS } from '../../../lib/taxonomy/positions'
import { auth, currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))

const BELT_STYLE: Record<string, { bg: string; text: string }> = {
  white:  { bg: 'bg-zinc-200',    text: 'text-zinc-900' },
  blue:   { bg: 'bg-blue-600',    text: 'text-white' },
  purple: { bg: 'bg-purple-600',  text: 'text-white' },
  brown:  { bg: 'bg-amber-800',   text: 'text-white' },
  black:  { bg: 'bg-zinc-950 ring-1 ring-zinc-600', text: 'text-white' },
}

const STATUS_CHIP: Record<string, string> = {
  pending:    'bg-zinc-800 text-zinc-400',
  processing: 'bg-blue-950 text-blue-400 border border-blue-800/50',
  analysed:   'bg-emerald-950 text-emerald-400 border border-emerald-800/50',
  failed:     'bg-rose-950 text-rose-400 border border-rose-800/50',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued', processing: 'Analysing', analysed: 'Ready', failed: 'Failed',
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
      videoId: matches.videoId,
      status: matches.status,
      format: matches.format,
      context: matches.context,
      ruleset: matches.ruleset,
      eventName: matches.eventName,
      opponentLabel: matches.opponentLabel,
      competitorLabel: matches.competitorLabel,
      createdAt: matches.createdAt,
      filename: videos.originalFilename,
      videoPublicUrl: videos.publicUrl,
    })
    .from(matches)
    .leftJoin(videos, eq(matches.videoId, videos.id))
    .where(matchFilter)
    .orderBy(desc(matches.createdAt))
    .limit(20)

  const videoFilter = dbUser
    ? or(eq(videos.userId, dbUser.id), isNull(videos.userId))
    : isNull(videos.userId)

  const videosWithNoMatches = await db
    .select({
      id: videos.id,
      originalFilename: videos.originalFilename,
      sourceType: videos.sourceType,
      status: videos.status,
      uploadedAt: videos.uploadedAt,
    })
    .from(videos)
    .leftJoin(matches, eq(matches.videoId, videos.id))
    .where(and(isNull(matches.id), ne(videos.status, 'analysed'), videoFilter))
    .orderBy(desc(videos.uploadedAt))
    .limit(20)

  const scanningVideos = videosWithNoMatches.filter(v => v.status !== 'failed')
  const failedVideos = videosWithNoMatches.filter(v => v.status === 'failed')

  const analysedIds = recentMatches.filter((m) => m.status === 'analysed').map((m) => m.id)

  const [allInsights, allSegments, allEvents] = await Promise.all([
    analysedIds.length > 0
      ? db.select().from(insights).where(inArray(insights.matchId, analysedIds))
      : Promise.resolve([]),
    analysedIds.length > 0
      ? db.select().from(positionSegments).where(inArray(positionSegments.matchId, analysedIds))
      : Promise.resolve([]),
    analysedIds.length > 0
      ? db.select().from(matchEvents).where(inArray(matchEvents.matchId, analysedIds))
      : Promise.resolve([]),
  ])

  // ── Stats ──
  const totalAnalyzedTime = allSegments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalDominantTime = allSegments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalInferiorTime = allSegments.filter(s => s.dominance === 'inferior').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const controlPct = totalAnalyzedTime > 0 ? Math.round((totalDominantTime / totalAnalyzedTime) * 100) : 0
  const underPressurePct = totalAnalyzedTime > 0 ? Math.round((totalInferiorTime / totalAnalyzedTime) * 100) : 0
  const subAttempts = allEvents.filter(e => e.actor === 'user' && e.eventTypeId.includes('submission')).length

  // ── Position breakdown ──
  const positionStats: Record<string, { total: number; dominant: number; neutral: number; inferior: number }> = {}
  for (const seg of allSegments) {
    const dur = seg.endSeconds - seg.startSeconds
    if (!positionStats[seg.positionId]) {
      positionStats[seg.positionId] = { total: 0, dominant: 0, neutral: 0, inferior: 0 }
    }
    positionStats[seg.positionId].total += dur
    positionStats[seg.positionId][seg.dominance as 'dominant' | 'neutral' | 'inferior'] += dur
  }

  const sortedPositions = Object.entries(positionStats).sort((a, b) => b[1].total - a[1].total)
  const maxPositionTime = sortedPositions[0]?.[1].total ?? 1

  const sharpPositions = sortedPositions
    .filter(([, s]) => s.total > 30 && (s.dominant / s.total) >= 0.5)
    .sort(([, a], [, b]) => (b.dominant / b.total) - (a.dominant / a.total))
    .slice(0, 3)

  const exposedPositions = sortedPositions
    .filter(([, s]) => s.total > 30 && (s.inferior / s.total) >= 0.3)
    .sort(([, a], [, b]) => (b.inferior / b.total) - (a.inferior / a.total))
    .slice(0, 3)

  const isProcessing =
    scanningVideos.length > 0 ||
    recentMatches.some((m) => m.status === 'pending' || m.status === 'processing')

  const isEmpty = recentMatches.length === 0 && scanningVideos.length === 0 && failedVideos.length === 0

  if (isEmpty) {
    return (
      <div className="max-w-2xl space-y-6">
        <ProfileHeader name={displayName} dbUser={dbUser} />
        <div className="rounded-xl border border-dashed border-border p-16 text-center space-y-4">
          <p className="text-muted-foreground text-sm">No match footage analysed yet.</p>
          <Link
            href="/upload"
            className="inline-block text-sm px-5 py-2 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
          >
            Upload your first match
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-8">
      {isProcessing && <RefreshPoller />}

      {/* ── Profile ── */}
      <ProfileHeader name={displayName} dbUser={dbUser} />

      {/* ── Stats band ── */}
      {analysedIds.length > 0 && (
        <div className="grid grid-cols-4 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/20">
          <StatCell
            label="Matches"
            value={String(analysedIds.length)}
            sub={recentMatches.length > analysedIds.length ? `${recentMatches.length} total` : undefined}
          />
          <StatCell label="Time on Mat" value={fmt(totalAnalyzedTime)} />
          <StatCell
            label="Control Rate"
            value={`${controlPct}%`}
            sub={`${underPressurePct}% under pressure`}
            accent={controlPct >= 55 ? 'green' : controlPct < 40 ? 'red' : undefined}
          />
          <StatCell label="Attacks" value={String(subAttempts)} sub="submission attempts" />
        </div>
      )}

      {/* ── Your DNA ── */}
      {(sharpPositions.length > 0 || exposedPositions.length > 0) && (
        <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
          <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Game DNA</h2>
            <span className="text-xs text-muted-foreground">{analysedIds.length} match{analysedIds.length !== 1 ? 'es' : ''} analysed</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div className="p-5 space-y-3">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Sharp Positions
              </p>
              {sharpPositions.length > 0 ? sharpPositions.map(([id, s]) => {
                const pct = Math.round((s.dominant / s.total) * 100)
                return (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{POSITION_MAP[id] ?? id}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-emerald-400 w-8 text-right tabular-nums">{pct}%</span>
                    </div>
                  </div>
                )
              }) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                Exposed Positions
              </p>
              {exposedPositions.length > 0 ? exposedPositions.map(([id, s]) => {
                const pct = Math.round((s.inferior / s.total) * 100)
                return (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{POSITION_MAP[id] ?? id}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-rose-400 w-8 text-right tabular-nums">{pct}%</span>
                    </div>
                  </div>
                )
              }) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Position breakdown ── */}
      {sortedPositions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Time & Control</h2>
          <div className="space-y-2">
            {sortedPositions.slice(0, 8).map(([posId, stats]) => {
              const barPct = (stats.total / maxPositionTime) * 100
              const domPct = (stats.dominant / stats.total) * 100
              const infPct = (stats.inferior / stats.total) * 100
              const neuPct = Math.max(0, 100 - domPct - infPct)
              return (
                <div key={posId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground/80">{POSITION_MAP[posId] ?? posId}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(stats.total)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barPct}%` }}>
                      <div className="bg-emerald-500" style={{ width: `${domPct}%` }} />
                      <div className="bg-zinc-500" style={{ width: `${neuPct}%` }} />
                      <div className="bg-rose-500" style={{ width: `${infPct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-5 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> In Control</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-zinc-500 inline-block" /> Neutral</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500 inline-block" /> Under Pressure</span>
          </div>
        </div>
      )}

      {/* ── Scanning ── */}
      {scanningVideos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">In Progress</h2>
          {scanningVideos.map((v) => (
            <div key={v.id} className="rounded-xl border border-border/60 p-4 flex items-center justify-between gap-4 bg-card">
              <div>
                <p className="font-medium text-sm truncate max-w-xs">{v.originalFilename}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {v.sourceType === 'public_url' ? 'Scanning footage for matches…' : 'Analysing your footage…'}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-950 text-blue-400 border border-blue-800/50 flex-shrink-0">
                Analysing
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Failed ── */}
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

      {/* ── Match feed ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Match Feed</h2>
          <div className="flex items-center gap-2">
            <ClearAllButton />
          </div>
        </div>
        <div className="space-y-3">
          {recentMatches.map((match) => {
            const matchSegs = allSegments.filter(s => s.matchId === match.id)
            const matchEvts = allEvents.filter(e => e.matchId === match.id)
            const matchInsightsList = allInsights.filter(i => i.matchId === match.id)
            return (
              <MatchCard
                key={match.id}
                match={match}
                segments={matchSegs}
                events={matchEvts}
                insights={matchInsightsList}
                thumbnailUrl={match.videoPublicUrl ?? null}
                deleteButton={<DeleteMatchButton matchId={match.id} videoId={match.videoId} />}
              />
            )
          })}
        </div>
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
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 text-primary flex items-center justify-center text-base font-bold flex-shrink-0">
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
    </div>
  )
}

function StatCell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-2xl font-black mt-1 tabular-nums tracking-tight ${
        accent === 'green' ? 'text-emerald-400' : accent === 'red' ? 'text-rose-400' : 'text-foreground'
      }`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function MatchCard({
  match,
  segments,
  events,
  insights: matchInsights,
  thumbnailUrl,
  deleteButton,
}: {
  match: {
    id: string; videoId: string; status: string; format: string; context: string; ruleset: string
    eventName: string | null; opponentLabel: string; competitorLabel: string | null
    createdAt: Date; filename: string | null
  }
  segments: { endSeconds: number; startSeconds: number; positionId: string; dominance: string; matchId: string }[]
  events: { eventTypeId: string; actor: string; outcome: string; techniqueLabel: string | null; matchId: string }[]
  insights: { id: string; category: string; severity: string; description: string; suggestion: string; youtubeSearchQuery: string | null }[]
  thumbnailUrl: string | null
  deleteButton: React.ReactNode
}) {
  const totalTime = segments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const domTime = segments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const domPct = totalTime > 0 ? Math.round((domTime / totalTime) * 100) : null

  const posByTime: Record<string, number> = {}
  for (const s of segments) posByTime[s.positionId] = (posByTime[s.positionId] ?? 0) + (s.endSeconds - s.startSeconds)
  const topPos = Object.entries(posByTime).sort((a, b) => b[1] - a[1])[0]?.[0]

  const keyEvent = events.find(e => e.actor === 'user' && e.eventTypeId.includes('submission') && e.outcome === 'successful')
    ?? events.find(e => e.actor === 'user' && e.eventTypeId.includes('submission'))

  const topInsight = matchInsights.find(i => i.category === 'strength') ?? matchInsights[0]
  const isAnalysed = match.status === 'analysed'

  // Border accent based on performance
  const perfBorder = domPct !== null && domPct >= 60
    ? 'border-emerald-800/50'
    : domPct !== null && domPct <= 35
    ? 'border-rose-800/50'
    : 'border-border/60'

  return (
    <div className={`rounded-xl border overflow-hidden bg-card ${perfBorder}`}>
      {/* Header row */}
      <div className="flex items-stretch">
        {thumbnailUrl ? (
          <VideoThumbnail src={thumbnailUrl} className="w-28 h-[72px] object-cover flex-shrink-0" />
        ) : (
          <div className="w-28 h-[72px] bg-muted/50 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/30">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3V9z"/>
            </svg>
          </div>
        )}
        <div className="px-4 py-3 flex items-start justify-between gap-3 flex-1 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isAnalysed ? (
                <Link href={`/matches/${match.id}`} className="font-bold text-sm hover:text-primary transition-colors">
                  vs. {match.opponentLabel}
                </Link>
              ) : (
                <span className="font-bold text-sm">{match.opponentLabel ?? 'Unknown'}</span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_CHIP[match.status] ?? 'bg-muted text-muted-foreground'}`}>
                {STATUS_LABEL[match.status] ?? match.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {match.format === 'no_gi' ? 'No-Gi' : 'Gi'}
              {match.eventName ? ` · ${match.eventName}` : ''}
              {' · '}{match.createdAt.toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isAnalysed && (
              <>
                <Link href={`/matches/${match.id}`} className="text-xs px-2.5 py-1 rounded-lg border border-border/60 font-medium hover:bg-muted transition-colors">
                  Full Review
                </Link>
                <Link href={`/matches/${match.id}/coach`} className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
                  Ask Coach
                </Link>
              </>
            )}
            {deleteButton}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {isAnalysed && segments.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/40 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${domPct !== null && domPct >= 55 ? 'bg-emerald-500' : domPct !== null && domPct < 40 ? 'bg-rose-500' : 'bg-zinc-500'}`}
                style={{ width: `${domPct ?? 50}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
              {domPct !== null ? `${domPct}% ctrl` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] bg-muted/60 px-2 py-0.5 rounded-full text-muted-foreground">{fmt(totalTime)}</span>
            {topPos && (
              <span className="text-[11px] bg-muted/60 px-2 py-0.5 rounded-full text-muted-foreground truncate max-w-[120px]">
                {POSITION_MAP[topPos] ?? topPos}
              </span>
            )}
            {keyEvent && (
              <span className="text-[11px] bg-amber-950/60 text-amber-400 border border-amber-800/30 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                {keyEvent.techniqueLabel ?? keyEvent.eventTypeId.replace(/_/g, ' ')}
                {keyEvent.outcome === 'successful' ? ' ✓' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top coaching note */}
      {isAnalysed && topInsight && (
        <div className="px-4 py-2.5 border-t border-border/40 flex items-start gap-2">
          <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            topInsight.category === 'strength' ? 'bg-emerald-400' :
            topInsight.category === 'mistake' ? 'bg-rose-400' :
            topInsight.category === 'opportunity' ? 'bg-blue-400' : 'bg-amber-400'
          }`} />
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {topInsight.description}
          </p>
          {matchInsights.length > 1 && (
            <Link href={`/matches/${match.id}`} className="text-xs text-primary/70 hover:text-primary ml-auto flex-shrink-0 transition-colors">
              +{matchInsights.length - 1}
            </Link>
          )}
        </div>
      )}

      {(match.status === 'pending' || match.status === 'processing') && (
        <div className="px-4 py-3 border-t border-border/40">
          <p className="text-xs text-muted-foreground text-center">Analysing your footage…</p>
        </div>
      )}

      {match.status === 'failed' && (
        <div className="px-4 py-3 border-t border-rose-900/30">
          <p className="text-xs text-rose-400">Analysis failed. Try uploading again.</p>
        </div>
      )}
    </div>
  )
}
