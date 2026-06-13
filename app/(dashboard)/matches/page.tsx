import React from 'react'
import { db } from '../../../lib/db'
import { matches, insights, videos, positionSegments, users } from '../../../lib/db/schema'
import { desc, eq, inArray, isNull, and, ne, or } from 'drizzle-orm'
import Link from 'next/link'
import { buttonVariants } from '../../../components/ui/button'
import RefreshPoller from '../player-card/refresh-poller'
import { DeleteMatchButton } from '../player-card/delete-match-button'
import { DeleteVideoButton } from '../player-card/delete-video-button'
import { VideoThumbnail } from '../player-card/video-thumbnail'
import { POSITIONS } from '../../../lib/taxonomy/positions'
import { auth } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))

const STATUS_CHIP: Record<string, string> = {
  pending:    'bg-muted text-muted-foreground border border-border',
  processing: 'bg-muted text-muted-foreground border border-border',
  analysed:   'bg-muted text-muted-foreground border border-border',
  failed:     'bg-muted text-rose-400 border border-border',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued', processing: 'Analysing', analysed: 'Ready', failed: 'Failed',
}

const SOURCE_LABEL: Record<string, string> = {
  own_competition: 'Competition',
  own_sparring: 'Sparring',
  opponent: 'Scout',
  public_url: 'URL',
}

function fmt(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

function matchTitle(m: { eventName: string | null; format: string; context: string; sourceType: string | null }): string {
  if (m.eventName) return m.eventName
  const fmtLabel = m.format === 'no_gi' ? 'No-Gi' : 'Gi'
  if (m.sourceType === 'opponent') return `${fmtLabel} Scout Footage`
  const ctxLabel = m.context === 'sparring' ? 'Sparring'
    : m.context === 'drilling' ? 'Drilling'
    : 'Competition'
  return `${fmtLabel} ${ctxLabel}`
}

export default async function MatchesPage() {
  const { userId: clerkId } = await auth()

  let dbUser: typeof users.$inferSelect | null = null
  if (clerkId) {
    dbUser = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }) ?? null
  }

  const matchFilter = dbUser
    ? or(eq(matches.userId, dbUser.id), isNull(matches.userId))
    : isNull(matches.userId)

  const allMatches = await db
    .select({
      id: matches.id,
      videoId: matches.videoId,
      status: matches.status,
      format: matches.format,
      context: matches.context,
      ruleset: matches.ruleset,
      eventName: matches.eventName,
      opponentLabel: matches.opponentLabel,
      resultWinner: matches.resultWinner,
      resultMethod: matches.resultMethod,
      createdAt: matches.createdAt,
      videoPublicUrl: videos.publicUrl,
      sourceType: videos.sourceType,
      kbUpgradedAt: matches.kbUpgradedAt,
      kbUpgradeSeenAt: matches.kbUpgradeSeenAt,
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
    .select({
      id: videos.id,
      originalFilename: videos.originalFilename,
      sourceType: videos.sourceType,
      status: videos.status,
    })
    .from(videos)
    .leftJoin(matches, eq(matches.videoId, videos.id))
    .where(and(isNull(matches.id), ne(videos.status, 'analysed'), ne(videos.sourceType, 'opponent'), videoFilter))
    .orderBy(desc(videos.uploadedAt))
    .limit(20)

  const scanningVideos = videosWithNoMatches.filter(v => v.status !== 'failed')
  const failedVideos = videosWithNoMatches.filter(v => v.status === 'failed')

  const analysedIds = allMatches.filter(m => m.status === 'analysed').map(m => m.id)

  const [allInsights, allSegments] = await Promise.all([
    analysedIds.length > 0
      ? db.select().from(insights).where(inArray(insights.matchId, analysedIds))
      : Promise.resolve([]),
    analysedIds.length > 0
      ? db.select().from(positionSegments).where(inArray(positionSegments.matchId, analysedIds))
      : Promise.resolve([]),
  ])

  const isProcessing =
    scanningVideos.length > 0 ||
    allMatches.some(m => m.status === 'pending' || m.status === 'processing')

  const isEmpty = allMatches.length === 0 && scanningVideos.length === 0 && failedVideos.length === 0

  // Aggregate stats for sidebar
  const analysedCount = allMatches.filter(m => m.status === 'analysed').length
  const wins = allMatches.filter(m => m.resultWinner === 'user').length
  const losses = allMatches.filter(m => m.resultWinner === 'opponent').length
  const totalMatTime = allSegments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const perMatchRates = analysedIds.map(id => {
    const segs = allSegments.filter(s => s.matchId === id)
    const total = segs.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
    const dom = segs.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
    return total > 0 ? (dom / total) * 100 : null
  }).filter((r): r is number => r !== null)
  const avgControlRate = perMatchRates.length > 0
    ? Math.round(perMatchRates.reduce((a, b) => a + b, 0) / perMatchRates.length)
    : null

  if (isEmpty) {
    return (
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-2xl font-semibold">My Matches</h1>
          <Link href="/upload" className={buttonVariants({ size: 'sm' })}>+ Analyse</Link>
        </div>
        <div className="rounded-2xl border border-dashed border-border/60 p-10 space-y-8">
          <div className="max-w-lg space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1.5">Upload match footage.</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI breaks it into positions, events, and coaching notes — automatically.
              </p>
            </div>
            <Link href="/upload" className={buttonVariants()}>
              Analyse your first match →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: 'Position breakdown', body: 'Time in guard, side control, back mount — and how much you controlled each.' },
              { title: 'Control rate', body: 'A single number for how dominant you were across the whole match.' },
              { title: 'Coaching notes', body: 'AI insights on patterns to drill and moments to study frame by frame.' },
            ].map(({ title, body }) => (
              <div key={title} className="rounded-xl border border-border/60 bg-card p-4 space-y-1.5">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground border-t border-border/40 pt-4">
            Scouted opponent footage lives under{' '}
            <Link href="/tournaments" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Tournaments → Opponents
            </Link>
            , not here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      {isProcessing && <RefreshPoller />}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">My Matches</h1>
          <span className="text-sm text-muted-foreground tabular-nums">{allMatches.length} total</span>
        </div>
        <Link href="/upload" className={buttonVariants({ size: 'sm' })}>+ Analyse</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 items-start">

        {/* ── Sidebar ── */}
        <aside className="lg:sticky lg:top-20">
          {/* Stats: 2-col grid on mobile, stacked on desktop */}
          <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-3">
            <div className="rounded-xl border border-border/60 bg-card p-3 lg:p-4">
              <p className="text-xs text-muted-foreground font-medium mb-0.5 lg:mb-1">Analysed</p>
              <p className="text-2xl lg:text-3xl font-bold tabular-nums leading-none">{analysedCount}</p>
              {allMatches.length !== analysedCount && (
                <p className="text-xs text-muted-foreground mt-1">{allMatches.length - analysedCount} pending</p>
              )}
            </div>

            {avgControlRate !== null && (
              <div className="rounded-xl border border-border/60 bg-card p-3 lg:p-4">
                <p className="text-xs text-muted-foreground font-medium mb-0.5 lg:mb-1">Avg control</p>
                <p className="text-2xl lg:text-3xl font-bold tabular-nums leading-none">{avgControlRate}%</p>
              </div>
            )}

            {totalMatTime > 0 && (
              <div className="rounded-xl border border-border/60 bg-card p-3 lg:p-4">
                <p className="text-xs text-muted-foreground font-medium mb-0.5 lg:mb-1">Mat time</p>
                <p className="text-xl lg:text-2xl font-bold tabular-nums leading-none">{fmt(totalMatTime)}</p>
              </div>
            )}

            {(wins > 0 || losses > 0) && (
              <div className="rounded-xl border border-border/60 bg-card p-3 lg:p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1.5 lg:mb-2.5">Record</p>
                <div className="flex items-end gap-3 lg:gap-4">
                  <div>
                    <p className="text-xl lg:text-2xl font-bold text-blue-500 tabular-nums leading-none">{wins}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">wins</p>
                  </div>
                  <div>
                    <p className="text-xl lg:text-2xl font-bold text-rose-500 tabular-nums leading-none">{losses}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">losses</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {analysedCount > 0 && (
            <Link
              href="/player-card"
              className="mt-2 lg:mt-0 flex items-center justify-between px-4 py-2.5 rounded-xl border border-border/60 bg-card text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              <span>Full stats</span>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
            </Link>
          )}
        </aside>

        {/* ── Match list ── */}
        <div className="min-w-0 space-y-4">
          {/* Processing state — no matches yet but videos in progress */}
          {allMatches.length === 0 && scanningVideos.length > 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 p-8 space-y-4 text-center">
              <div className="flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-foreground/40 animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Analysing your footage…</p>
                <p className="text-xs text-muted-foreground">AI is breaking your match into positions, events, and coaching notes. This usually takes a few minutes.</p>
              </div>
              <Link href="/upload" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                + Upload another match
              </Link>
            </div>
          )}

          {/* In Progress */}
          {scanningVideos.length > 0 && (
            <div className="space-y-2">
              {scanningVideos.map((v) => (
                <div key={v.id} className="rounded-xl border border-border/60 bg-card px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-pulse flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{v.originalFilename}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.sourceType === 'public_url' ? 'Scanning for matches…' : 'Analysing…'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">Analysing…</span>
                </div>
              ))}
            </div>
          )}

          {/* Failed */}
          {failedVideos.length > 0 && (
            <div className="space-y-2">
              {failedVideos.map((v) => (
                <div key={v.id} className="rounded-xl border border-border/60 bg-card px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{v.originalFilename}</p>
                    <p className="text-xs text-rose-500 mt-0.5">Analysis failed — remove or resubmit</p>
                  </div>
                  <DeleteVideoButton videoId={v.id} />
                </div>
              ))}
            </div>
          )}

          {/* Match timeline grouped by month */}
          <div>
            {(() => {
              let lastMonthKey: string | null = null
              return allMatches.map((match) => {
                const monthKey = match.createdAt.toLocaleDateString('en', { month: 'long', year: 'numeric' })
                const showMonth = monthKey !== lastMonthKey
                lastMonthKey = monthKey
                const matchSegs = allSegments.filter(s => s.matchId === match.id)
                const matchInsightsList = allInsights.filter(i => i.matchId === match.id)
                return (
                  <React.Fragment key={match.id}>
                    {showMonth && (
                      <div className="pb-3 pt-2 first:pt-0">
                        <span className="text-xs text-muted-foreground font-medium">{monthKey}</span>
                      </div>
                    )}
                    <div className="pb-3">
                      <MatchCard
                        match={match}
                        segments={matchSegs}
                        insightsList={matchInsightsList}
                        deleteButton={<DeleteMatchButton matchId={match.id} videoId={match.videoId ?? ''} />}
                        upgraded={!!(match.kbUpgradedAt && (!match.kbUpgradeSeenAt || match.kbUpgradedAt > match.kbUpgradeSeenAt))}
                      />
                    </div>
                  </React.Fragment>
                )
              })
            })()}
          </div>
        </div>

      </div>
    </div>
  )
}

function MatchCard({
  match,
  segments,
  insightsList,
  deleteButton,
  upgraded,
}: {
  match: {
    id: string; videoId: string | null; status: string; format: string; context: string
    eventName: string | null; opponentLabel: string | null; resultWinner: string | null
    resultMethod: string | null; createdAt: Date; videoPublicUrl: string | null
    sourceType: string | null
  }
  segments: { endSeconds: number; startSeconds: number; positionId: string; dominance: string }[]
  insightsList: { id: string; category: string; description: string; confidence: number }[]
  deleteButton: React.ReactNode
  upgraded?: boolean
}) {
  const isAnalysed = match.status === 'analysed'
  const title = matchTitle({ ...match, sourceType: match.sourceType })

  const totalTime = segments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const domTime = segments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const domPct = totalTime > 0 ? Math.round((domTime / totalTime) * 100) : null

  const posByTime: Record<string, number> = {}
  for (const s of segments) posByTime[s.positionId] = (posByTime[s.positionId] ?? 0) + (s.endSeconds - s.startSeconds)
  const topPos = Object.entries(posByTime).sort((a, b) => b[1] - a[1])[0]?.[0]

  const topInsight = insightsList.find(i => i.category === 'strength')
    ?? insightsList.find(i => i.category === 'opportunity')
    ?? insightsList[0]
  const extraCount = Math.max(0, insightsList.length - 1)

  const avgConfidence = insightsList.length > 0
    ? Math.round(insightsList.reduce((acc, i) => acc + i.confidence, 0) / insightsList.length * 100)
    : null

  const contextLabel = SOURCE_LABEL[match.sourceType ?? ''] ?? SOURCE_LABEL[match.context] ?? 'Competition'
  const formatLabel = match.format === 'no_gi' ? 'No-Gi' : 'Gi'

  const dateStr = match.createdAt.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Top row: title + meta + status */}
      <div className="flex items-stretch">
        {/* Thumbnail */}
        {match.videoPublicUrl ? (
          <VideoThumbnail src={match.videoPublicUrl} className="w-28 h-20 object-cover flex-shrink-0" />
        ) : (
          <div className="w-28 h-20 bg-muted/50 flex-shrink-0 flex items-center justify-center border-r border-border/40">
            <svg className="w-5 h-5 text-muted-foreground/20" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 px-4 py-3 min-w-0 flex flex-col justify-between gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {isAnalysed ? (
                <Link href={`/matches/${match.id}`} className="font-medium text-sm hover:text-primary transition-colors line-clamp-1 block">
                  {title}
                </Link>
              ) : (
                <span className="font-medium text-sm line-clamp-1 block">{title}</span>
              )}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {match.resultWinner && (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-sm border ${
                    match.resultWinner === 'user'
                      ? 'text-blue-500 border-blue-500/30'
                      : 'text-rose-500 border-rose-500/30'
                  }`}>
                    {match.resultWinner === 'user'
                      ? (match.resultMethod === 'submission' ? 'W · Sub' : match.resultMethod === 'points' ? 'W · Pts' : 'W')
                      : (match.resultMethod === 'submission' ? 'L · Sub' : match.resultMethod === 'points' ? 'L · Pts' : 'L')}
                  </span>
                )}
                {match.opponentLabel && match.opponentLabel.toLowerCase() !== 'unknown' && match.context !== 'opponent' && (
                  <p className="text-xs text-muted-foreground line-clamp-1">vs. <span className="font-semibold text-foreground/70">{match.opponentLabel}</span></p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {upgraded && (
                <span className="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/20">
                  UPGRADED
                </span>
              )}
              {!isAnalysed && (
                <span className={`text-xs font-medium ${
                  match.status === 'failed' ? 'text-rose-500' : 'text-muted-foreground'
                }`}>
                  {STATUS_LABEL[match.status] ?? match.status}
                </span>
              )}
              {deleteButton}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{contextLabel}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-xs text-muted-foreground">{formatLabel}</span>
            <span className="text-xs text-muted-foreground/50 ml-auto">{dateStr}</span>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {isAnalysed && segments.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/40 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-foreground/50" style={{ width: `${domPct ?? 50}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground/70">{domPct !== null ? `${domPct}% ctrl` : '—'}</span>
            <span className="opacity-30">·</span>
            <span>{fmt(totalTime)}</span>
            {topPos && (
              <>
                <span className="opacity-30">·</span>
                <span>{POSITION_MAP[topPos] ?? topPos}</span>
              </>
            )}
            {avgConfidence !== null && (
              <>
                <span className="opacity-30">·</span>
                <span title="How confident the AI was in its analysis of this match">Coverage {avgConfidence}%</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Insight + actions */}
      {isAnalysed && (
        <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {topInsight && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
                {topInsight.description}
              </p>
            )}
            {extraCount > 0 && (
              <span className="text-[10px] text-muted-foreground/50">+{extraCount} insight{extraCount > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Link href={`/matches/${match.id}`} className={buttonVariants({ variant: 'outline', size: 'xs' })}>
              Review
            </Link>
            <Link href={`/matches/${match.id}/coach`} className={`${buttonVariants({ size: 'xs' })} gap-1`}>
              Frame by Frame
              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-white/20 leading-none">AI</span>
            </Link>
          </div>
        </div>
      )}

      {/* Non-analysed footer */}
      {!isAnalysed && (
        <div className="px-4 py-2.5 border-t border-border/40 flex items-center justify-between">
          {match.status === 'failed' ? (
            <p className="text-xs text-rose-400 font-medium">Analysis failed — try uploading again.</p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <p className="text-xs text-muted-foreground">Analysing your footage…</p>
            </div>
          )}
          {deleteButton}
        </div>
      )}
    </div>
  )
}
