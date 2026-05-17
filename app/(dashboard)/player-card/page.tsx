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

const BELT_COLORS: Record<string, string> = {
  white: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  brown: 'bg-amber-800 text-white',
  black: 'bg-gray-900 text-white',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  processing: 'bg-blue-100 text-blue-600',
  analysed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
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

  // Try to get DB user for profile fields (belt, gym, etc.)
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

  // Videos with no matches: split into actively processing vs failed
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

  // ---------- Aggregate stats ----------
  const totalAnalyzedTime = allSegments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalDominantTime = allSegments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalInferiorTime = allSegments.filter(s => s.dominance === 'inferior').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const dominancePct = totalAnalyzedTime > 0 ? Math.round((totalDominantTime / totalAnalyzedTime) * 100) : 0
  const subAttempts = allEvents.filter(e => e.actor === 'user' && e.eventTypeId.includes('submission')).length

  // ---------- Position breakdown ----------
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

  // ---------- Your Game: strengths / vulnerabilities ----------
  const positionsWithEnoughTime = sortedPositions.filter(([, s]) => s.total > 30)
  const strengths = positionsWithEnoughTime
    .map(([id, s]) => ({ id, domPct: Math.round((s.dominant / s.total) * 100), total: s.total }))
    .filter(p => p.domPct >= 50)
    .sort((a, b) => b.domPct - a.domPct)
    .slice(0, 3)
  const vulnerabilities = positionsWithEnoughTime
    .map(([id, s]) => ({ id, infPct: Math.round((s.inferior / s.total) * 100), total: s.total }))
    .filter(p => p.infPct >= 30)
    .sort((a, b) => b.infPct - a.infPct)
    .slice(0, 3)

  const isProcessing =
    scanningVideos.length > 0 ||
    recentMatches.some((m) => m.status === 'pending' || m.status === 'processing')

  if (recentMatches.length === 0 && scanningVideos.length === 0 && failedVideos.length === 0) {
    return (
      <div className="space-y-6 max-w-2xl">
        <ProfileHeader name={displayName} dbUser={dbUser} />
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm mb-4">No match footage analysed yet.</p>
          <Link href="/upload" className="inline-block text-sm px-4 py-2 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity">
            Upload Match
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {isProcessing && <RefreshPoller />}

      {/* ── Profile header ── */}
      <ProfileHeader name={displayName} dbUser={dbUser} />

      {/* ── Stats strip ── */}
      {analysedIds.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Matches" value={String(analysedIds.length)} sub={`of ${recentMatches.length} loaded`} />
          <StatTile label="Mat Time" value={fmt(totalAnalyzedTime)} />
          <StatTile label="Dominant" value={`${dominancePct}%`} sub={`${100 - dominancePct - Math.round((totalInferiorTime / totalAnalyzedTime) * 100)}% neutral`} accent={dominancePct >= 55 ? 'green' : dominancePct < 40 ? 'red' : undefined} />
          <StatTile label="Sub Attempts" value={String(subAttempts)} />
        </div>
      )}

      {/* ── Your Game ── */}
      {(strengths.length > 0 || vulnerabilities.length > 0) && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/40">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Game</h2>
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div className="p-4 space-y-2.5">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Strengths</p>
              {strengths.length > 0 ? strengths.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{POSITION_MAP[p.id] ?? p.id}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${p.domPct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-green-700 w-8 text-right tabular-nums">{p.domPct}%</span>
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
            <div className="p-4 space-y-2.5">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Vulnerabilities</p>
              {vulnerabilities.length > 0 ? vulnerabilities.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{POSITION_MAP[p.id] ?? p.id}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${p.infPct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-red-600 w-8 text-right tabular-nums">{p.infPct}%</span>
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground">Not enough data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Position breakdown ── */}
      {sortedPositions.length > 0 && (
        <div className="space-y-3">
          <SectionHeader title="Position Breakdown" sub="All analysed matches combined" />
          <div className="space-y-2">
            {sortedPositions.slice(0, 8).map(([posId, stats]) => {
              const barPct = (stats.total / maxPositionTime) * 100
              const domPct = (stats.dominant / stats.total) * 100
              const infPct = (stats.inferior / stats.total) * 100
              const neuPct = Math.max(0, 100 - domPct - infPct)
              return (
                <div key={posId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{POSITION_MAP[posId] ?? posId}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(stats.total)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full flex" style={{ width: `${barPct}%` }}>
                      <div className="bg-green-500" style={{ width: `${domPct}%` }} />
                      <div className="bg-gray-300" style={{ width: `${neuPct}%` }} />
                      <div className="bg-red-400" style={{ width: `${infPct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Dominant</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300 inline-block" /> Neutral</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> Inferior</span>
          </div>
        </div>
      )}

      {/* ── Scanning videos ── */}
      {scanningVideos.length > 0 && (
        <div className="space-y-2">
          <SectionHeader title="In Progress" />
          {scanningVideos.map((v) => (
            <div key={v.id} className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm truncate max-w-xs">{v.originalFilename}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {v.sourceType === 'public_url' ? 'Scanning for matches…' : 'Queued for analysis…'}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 flex-shrink-0">scanning</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Failed uploads ── */}
      {failedVideos.length > 0 && (
        <div className="space-y-2">
          <SectionHeader title="Failed" sub="These scans did not complete — remove them or resubmit the URL" />
          {failedVideos.map((v) => (
            <div key={v.id} className="rounded-lg border border-red-200 bg-red-50/40 p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{v.originalFilename}</p>
                <p className="text-xs text-red-600 mt-0.5">Analysis failed</p>
              </div>
              <DeleteVideoButton videoId={v.id} />
            </div>
          ))}
        </div>
      )}

      {/* ── Match history ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader title="Match History" />
          <div className="flex items-center gap-2">
            <ClearAllButton />
            <Link href="/upload" className="text-xs px-3 py-1.5 rounded-full border font-medium hover:bg-muted transition-colors">
              + Add footage
            </Link>
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
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center text-lg font-bold flex-shrink-0">
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold truncate">{name}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {belt && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${BELT_COLORS[belt] ?? 'bg-muted text-foreground'}`}>
              {belt.charAt(0).toUpperCase() + belt.slice(1)} Belt
            </span>
          )}
          {style && (
            <span className="text-xs text-muted-foreground capitalize">
              {style === 'no_gi' ? 'No-Gi' : style === 'both' ? 'Gi & No-Gi' : 'Gi'}
            </span>
          )}
          {gym && <span className="text-xs text-muted-foreground truncate">{gym}</span>}
          {!belt && !gym && (
            <Link href="#" className="text-xs text-muted-foreground hover:text-foreground">
              Add profile details →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${accent === 'green' ? 'text-green-700' : accent === 'red' ? 'text-red-600' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
  segments: { endSeconds: number; startSeconds: number; positionId: string; dominance: string }[]
  events: { eventTypeId: string; actor: string; outcome: string; techniqueLabel: string | null }[]
  insights: { id: string; category: string; severity: string; description: string; suggestion: string; youtubeSearchQuery: string | null }[]
  thumbnailUrl: string | null
  deleteButton: React.ReactNode
}) {
  const totalTime = segments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const domTime = segments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const domPct = totalTime > 0 ? Math.round((domTime / totalTime) * 100) : null

  // Top position by time
  const posByTime: Record<string, number> = {}
  for (const s of segments) {
    posByTime[s.positionId] = (posByTime[s.positionId] ?? 0) + (s.endSeconds - s.startSeconds)
  }
  const topPos = Object.entries(posByTime).sort((a, b) => b[1] - a[1])[0]?.[0]

  // Key event: first successful user submission attempt
  const keyEvent = events.find(e => e.actor === 'user' && e.eventTypeId.includes('submission') && e.outcome === 'successful')
    ?? events.find(e => e.actor === 'user' && e.eventTypeId.includes('submission'))

  const isAnalysed = match.status === 'analysed'

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Match header */}
      <div className="flex items-stretch">
        {/* Thumbnail */}
        {thumbnailUrl && (
          <VideoThumbnail
            src={thumbnailUrl}
            className="w-[88px] h-[66px] rounded-l-lg"
          />
        )}
        <div className="px-4 py-3 flex items-start justify-between gap-3 flex-1 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isAnalysed ? (
              <Link href={`/matches/${match.id}`} className="font-semibold text-sm hover:underline">
                vs. {match.opponentLabel}
              </Link>
            ) : (
              <span className="font-semibold text-sm">vs. {match.opponentLabel}</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[match.status]}`}>
              {match.status}
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
              <Link
                href={`/matches/${match.id}`}
                className="text-xs px-2.5 py-1 rounded-full border font-medium hover:bg-muted transition-colors"
              >
                Details
              </Link>
              <Link
                href={`/matches/${match.id}/coach`}
                className="text-xs px-2.5 py-1 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
              >
                Coach
              </Link>
            </>
          )}
          {deleteButton}
        </div>
        </div>
      </div>

      {/* Match stats strip — only for analysed matches */}
      {isAnalysed && segments.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {/* Dominance bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${domPct !== null && domPct >= 55 ? 'bg-green-500' : domPct !== null && domPct < 40 ? 'bg-red-400' : 'bg-gray-400'}`}
                style={{ width: `${domPct ?? 50}%` }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums w-10 text-right text-muted-foreground">
              {domPct !== null ? `${domPct}% dom` : '—'}
            </span>
          </div>

          {/* Quick stats pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{fmt(totalTime)}</span>
            {topPos && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full truncate max-w-[160px]">
                {POSITION_MAP[topPos] ?? topPos}
              </span>
            )}
            {keyEvent && (
              <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full truncate max-w-[160px]">
                {keyEvent.techniqueLabel ?? keyEvent.eventTypeId.replace(/_/g, ' ')}
                {keyEvent.outcome === 'successful' ? ' ✓' : ''}
              </span>
            )}
          </div>

          {/* Insights */}
          {matchInsights.length > 0 && (
            <div className="space-y-1 pt-1">
              {matchInsights.slice(0, 2).map((insight) => (
                <div key={insight.id} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    insight.category === 'strength' ? 'bg-green-500' :
                    insight.category === 'mistake' ? 'bg-red-400' :
                    insight.category === 'opportunity' ? 'bg-blue-400' : 'bg-yellow-400'
                  }`} />
                  <span className="text-muted-foreground leading-relaxed line-clamp-2">{insight.description}</span>
                </div>
              ))}
              {matchInsights.length > 2 && (
                <Link href={`/matches/${match.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                  +{matchInsights.length - 2} more insights →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {(match.status === 'pending' || match.status === 'processing') && (
        <div className="px-4 pb-3">
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground text-center">
            Analysis in progress…
          </div>
        </div>
      )}

      {match.status === 'failed' && (
        <div className="px-4 pb-3">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            Analysis failed. Try uploading again.
          </div>
        </div>
      )}
    </div>
  )
}
