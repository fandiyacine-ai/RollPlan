import { db } from '../../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights } from '../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { POSITIONS } from '../../../../lib/taxonomy/positions'
import { EVENT_TYPES } from '../../../../lib/taxonomy/events'

export const dynamic = 'force-dynamic'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))
const EVENT_MAP = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e.name]))

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  analysed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
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

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params

  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
  if (!match) notFound()

  const video = match.videoId
    ? await db.query.videos.findFirst({ where: eq(videos.id, match.videoId) })
    : null

  const [segments, events, matchInsights] = await Promise.all([
    db.select().from(positionSegments).where(eq(positionSegments.matchId, matchId)).orderBy(asc(positionSegments.startSeconds)),
    db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(asc(matchEvents.timestampSeconds)),
    db.select().from(insights).where(eq(insights.matchId, matchId)),
  ])

  // Compute position breakdown grouped by positionId
  const positionStats: Record<string, { total: number; dominant: number; neutral: number; inferior: number }> = {}
  for (const seg of segments) {
    const dur = seg.endSeconds - seg.startSeconds
    if (!positionStats[seg.positionId]) {
      positionStats[seg.positionId] = { total: 0, dominant: 0, neutral: 0, inferior: 0 }
    }
    positionStats[seg.positionId].total += dur
    positionStats[seg.positionId][seg.dominance as 'dominant' | 'neutral' | 'inferior'] += dur
  }

  const sortedPositions = Object.entries(positionStats).sort((a, b) => b[1].total - a[1].total)
  const maxPositionTime = sortedPositions[0]?.[1].total ?? 1
  const totalMatchTime = segments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)

  const displayDate = match.recordedAt ?? match.createdAt

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <Link href="/player-card" className="text-xs text-muted-foreground hover:text-foreground inline-block mb-3">
          ← Player Card
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">vs. {match.opponentLabel}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {match.format === 'no_gi' ? 'No-Gi' : 'Gi'} · {match.context}
              {match.eventName ? ` · ${match.eventName}` : ''}
              {' · '}{displayDate.toLocaleDateString()}
            </p>
            {match.competitorLabel && (
              <p className="text-xs text-muted-foreground mt-0.5">Competitor: {match.competitorLabel}</p>
            )}
            {video?.originalFilename && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{video.originalFilename}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[match.status]}`}>
              {match.status}
            </span>
            {match.status === 'analysed' && (
              <Link
                href={`/matches/${matchId}/coach`}
                className="text-xs px-3 py-1.5 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
              >
                AI Coach
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Processing state */}
      {(match.status === 'pending' || match.status === 'processing') && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Analysis in progress…
        </div>
      )}

      {match.status === 'failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Analysis failed. Try uploading the match again.
        </div>
      )}

      {match.status === 'analysed' && (
        <>
          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Match Time</p>
              <p className="text-2xl font-bold mt-1">{formatTime(totalMatchTime)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Positions Tracked</p>
              <p className="text-2xl font-bold mt-1">{segments.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Events Detected</p>
              <p className="text-2xl font-bold mt-1">{events.length}</p>
            </div>
          </div>

          {/* Position breakdown */}
          {sortedPositions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Position Breakdown</h2>
              <div className="space-y-2.5">
                {sortedPositions.map(([posId, stats]) => {
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

          {/* Events timeline */}
          {events.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Events</h2>
              <div className="divide-y">
                {events.map((event) => {
                  const isUser = event.actor === 'user'
                  return (
                    <div key={event.id} className="flex items-start gap-3 py-2.5">
                      <span className="text-xs text-muted-foreground font-mono w-10 flex-shrink-0 pt-0.5 tabular-nums">
                        {formatTime(event.timestampSeconds)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isUser ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {isUser ? 'You' : 'Opp'}
                          </span>
                          <span className="text-sm font-medium">{EVENT_MAP[event.eventTypeId] ?? event.eventTypeId}</span>
                          {event.techniqueLabel && (
                            <span className="text-xs text-muted-foreground">({event.techniqueLabel})</span>
                          )}
                          <span className="text-xs text-muted-foreground capitalize ml-auto">{event.outcome}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI Insights */}
          {matchInsights.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI Insights</h2>
              <div className="space-y-2">
                {matchInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className={`rounded-lg border p-4 space-y-1 ${CATEGORY_COLORS[insight.category] ?? 'bg-muted border-muted'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[insight.severity] ?? 'bg-gray-400'}`} />
                      <span className="text-xs font-semibold uppercase tracking-wide capitalize">{insight.category}</span>
                      <span className="text-xs opacity-60 ml-auto">{Math.round(insight.confidence * 100)}% conf.</span>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        Watch technique
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {matchInsights.length === 0 && (
            <p className="text-sm text-muted-foreground">No insights generated for this match.</p>
          )}
        </>
      )}
    </div>
  )
}
