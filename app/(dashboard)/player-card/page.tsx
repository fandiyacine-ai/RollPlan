import { db } from '../../../lib/db'
import { matches, insights, videos } from '../../../lib/db/schema'
import { desc, eq, inArray } from 'drizzle-orm'
import RefreshPoller from './refresh-poller'

export const dynamic = 'force-dynamic'

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

export default async function PlayerCardPage() {
  const recentMatches = await db
    .select({
      id: matches.id,
      status: matches.status,
      format: matches.format,
      context: matches.context,
      eventName: matches.eventName,
      createdAt: matches.createdAt,
      filename: videos.originalFilename,
    })
    .from(matches)
    .leftJoin(videos, eq(matches.videoId, videos.id))
    .orderBy(desc(matches.createdAt))
    .limit(10)

  const analysedIds = recentMatches
    .filter((m) => m.status === 'analysed')
    .map((m) => m.id)

  const allInsights = analysedIds.length > 0
    ? await db.select().from(insights).where(inArray(insights.matchId, analysedIds))
    : []

  const isProcessing = recentMatches.some(
    (m) => m.status === 'pending' || m.status === 'processing'
  )

  if (recentMatches.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold">Player Card</h1>
        <p className="text-muted-foreground">Upload a match video to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Player Card</h1>

      {isProcessing && <RefreshPoller />}

      <div className="space-y-8">
        {recentMatches.map((match) => {
          const matchInsights = allInsights.filter((i) => i.matchId === match.id)
          return (
            <div key={match.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm truncate max-w-xs">
                    {match.filename ?? 'Untitled match'}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {match.format === 'no_gi' ? 'No-Gi' : 'Gi'} · {match.context}
                    {match.eventName ? ` · ${match.eventName}` : ''}
                    {' · '}{match.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[match.status]}`}>
                  {match.status}
                </span>
              </div>

              {match.status === 'analysed' && matchInsights.length === 0 && (
                <p className="text-sm text-muted-foreground">No insights generated.</p>
              )}

              {matchInsights.length > 0 && (
                <div className="space-y-2">
                  {matchInsights.map((insight) => (
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
  )
}
