import { db } from '../../../lib/db'
import { matches, insights, videos, positionSegments } from '../../../lib/db/schema'
import { desc, eq, inArray, isNull } from 'drizzle-orm'
import Link from 'next/link'
import RefreshPoller from './refresh-poller'
import { POSITIONS } from '../../../lib/taxonomy/positions'

export const dynamic = 'force-dynamic'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'Strength',
  mistake: 'Mistake',
  opportunity: 'Opportunity',
  pattern: 'Pattern',
}

const CATEGORY_COLORS: Record<string, string> = {
  strength: 'bg-green-50 border-green-200 text-green-800',
  mistake: 'bg-red-50 border-red-200 text-red-800',
  opportunity: 'bg-blue-50 border-blue-200 text-blue-800',
  pattern: 'bg-yellow-50 border-yellow-200 text-yellow-800',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  moderate: 'bg-yellow-500',
  minor: 'bg-gray-400',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  analysed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default async function PlayerCardPage() {
  const recentMatches = await db
    .select({
      id: matches.id,
      status: matches.status,
      format: matches.format,
      context: matches.context,
      eventName: matches.eventName,
      opponentLabel: matches.opponentLabel,
      createdAt: matches.createdAt,
      filename: videos.originalFilename,
    })
    .from(matches)
    .leftJoin(videos, eq(matches.videoId, videos.id))
    .orderBy(desc(matches.createdAt))
    .limit(10)

  // Videos scanning (no match records yet)
  const scanningVideos = await db
    .select({
      id: videos.id,
      originalFilename: videos.originalFilename,
      sourceType: videos.sourceType,
      status: videos.status,
      uploadedAt: videos.uploadedAt,
    })
    .from(videos)
    .leftJoin(matches, eq(matches.videoId, videos.id))
    .where(isNull(matches.id))
    .orderBy(desc(videos.uploadedAt))
    .limit(5)

  const analysedIds = recentMatches
    .filter((m) => m.status === 'analysed')
    .map((m) => m.id)

  const [allInsights, allSegments] = await Promise.all([
    analysedIds.length > 0
      ? db.select().from(insights).where(inArray(insights.matchId, analysedIds))
      : Promise.resolve([]),
    analysedIds.length > 0
      ? db.select().from(positionSegments).where(inArray(positionSegments.matchId, analysedIds))
      : Promise.resolve([]),
  ])

  // Aggregate position stats across all analysed matches
  const positionStats: Record<string, { total: number; dominant: number; neutral: number; inferior: number }> = {}
  for (const seg of allSegments) {
    const dur = seg.endSeconds - seg.startSeconds
    if (!positionStats[seg.positionId]) {
      positionStats[seg.positionId] = { total: 0, dominant: 0, neutral: 0, inferior: 0 }
    }
    positionStats[seg.positionId].total += dur
    positionStats[seg.positionId][seg.dominance as 'dominant' | 'neutral' | 'inferior'] += dur
  }

  const topPositions = Object.entries(positionStats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)
  const maxPositionTime = topPositions[0]?.[1].total ?? 1

  const totalAnalyzedTime = allSegments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalDominantTime = allSegments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const totalInferiorTime = allSegments.filter(s => s.dominance === 'inferior').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const dominancePct = totalAnalyzedTime > 0 ? Math.round((totalDominantTime / totalAnalyzedTime) * 100) : 0
  const inferiorPct = totalAnalyzedTime > 0 ? Math.round((totalInferiorTime / totalAnalyzedTime) * 100) : 0

  const isProcessing =
    scanningVideos.length > 0 ||
    recentMatches.some((m) => m.status === 'pending' || m.status === 'processing')

  if (recentMatches.length === 0 && scanningVideos.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold">Player Card</h1>
        <p className="text-muted-foreground">Upload a match video to get started.</p>
        <Link href="/upload" className="inline-block text-sm px-4 py-2 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity">
          Upload Match
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Player Card</h1>

      {isProcessing && <RefreshPoller />}

      {/* Stats summary */}
      {analysedIds.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Matches Analysed</p>
            <p className="text-2xl font-bold mt-1">{analysedIds.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">of {recentMatches.length} shown</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Time Analysed</p>
            <p className="text-2xl font-bold mt-1">{formatTime(totalAnalyzedTime)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Dominant</p>
            <p className="text-2xl font-bold mt-1">{dominancePct}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{inferiorPct}% inferior</p>
          </div>
        </div>
      )}

      {/* Position heat map */}
      {topPositions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Position Heat Map</h2>
          <div className="space-y-2.5">
            {topPositions.map(([posId, stats]) => {
              const barPct = (stats.total / maxPositionTime) * 100
              const domPct = (stats.dominant / stats.total) * 100
              const infPct = (stats.inferior / stats.total) * 100
              const neuPct = Math.max(0, 100 - domPct - infPct)
              return (
                <div key={posId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{POSITION_MAP[posId] ?? posId}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatTime(stats.total)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barPct}%` }}>
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
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Dominant
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 inline-block" /> Neutral
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> Inferior
            </span>
          </div>
        </div>
      )}

      {/* Scanning videos */}
      {scanningVideos.length > 0 && (
        <div className="space-y-2">
          {scanningVideos.map((v) => (
            <div key={v.id} className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm truncate max-w-xs">{v.originalFilename}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {v.sourceType === 'public_url' ? 'Scanning URL for matches…' : 'Queued for analysis…'}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 flex-shrink-0">
                scanning
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recent matches */}
      <div className="space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Recent Matches</h2>
        <div className="space-y-6">
          {recentMatches.map((match) => {
            const matchInsights = allInsights.filter((i) => i.matchId === match.id)
            return (
              <div key={match.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    {match.status === 'analysed' ? (
                      <Link href={`/matches/${match.id}`} className="font-medium text-sm hover:underline truncate block max-w-xs">
                        {match.opponentLabel ? `vs. ${match.opponentLabel}` : (match.filename ?? 'Untitled match')}
                      </Link>
                    ) : (
                      <p className="font-medium text-sm truncate max-w-xs">
                        {match.opponentLabel ? `vs. ${match.opponentLabel}` : (match.filename ?? 'Untitled match')}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {match.format === 'no_gi' ? 'No-Gi' : 'Gi'} · {match.context}
                      {match.eventName ? ` · ${match.eventName}` : ''}
                      {' · '}{match.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {match.status === 'analysed' && (
                      <>
                        <Link
                          href={`/matches/${match.id}`}
                          className="text-xs px-3 py-1 rounded-full border font-medium hover:bg-muted transition-colors"
                        >
                          Details
                        </Link>
                        <Link
                          href={`/matches/${match.id}/coach`}
                          className="text-xs px-3 py-1 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
                        >
                          Coach
                        </Link>
                      </>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[match.status]}`}>
                      {match.status}
                    </span>
                  </div>
                </div>

                {match.status === 'analysed' && matchInsights.length === 0 && (
                  <p className="text-sm text-muted-foreground">No insights generated.</p>
                )}

                {matchInsights.length > 0 && (
                  <div className="space-y-2">
                    {matchInsights.slice(0, 3).map((insight) => (
                      <div
                        key={insight.id}
                        className={`rounded-lg border p-4 space-y-1 ${CATEGORY_COLORS[insight.category] ?? 'bg-muted border-muted'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[insight.severity] ?? 'bg-gray-400'}`} />
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {CATEGORY_LABEL[insight.category] ?? insight.category}
                          </span>
                          <span className="text-xs opacity-60 ml-auto">
                            {Math.round(insight.confidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="text-sm font-medium">{insight.description}</p>
                        <p className="text-sm opacity-80">{insight.suggestion}</p>
                        {insight.youtubeSearchQuery && (
                          <a
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(insight.youtubeSearchQuery)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium mt-1 opacity-70 hover:opacity-100 transition-opacity"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                            Watch technique
                          </a>
                        )}
                      </div>
                    ))}
                    {matchInsights.length > 3 && (
                      <Link
                        href={`/matches/${match.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        +{matchInsights.length - 3} more insights →
                      </Link>
                    )}
                  </div>
                )}

                {(match.status === 'pending' || match.status === 'processing') && (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                    Analysis in progress…
                  </div>
                )}

                {match.status === 'failed' && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Analysis failed. Try uploading again.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
