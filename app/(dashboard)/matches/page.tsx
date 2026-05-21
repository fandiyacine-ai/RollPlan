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

  if (isEmpty) {
    return (
      <div className="max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight uppercase">My Matches</h1>
          <Link href="/upload" className={buttonVariants({ size: 'sm' })}>+ Analyse</Link>
        </div>
        <div className="rounded-xl border border-dashed p-16 text-center space-y-4">
          <p className="text-muted-foreground text-sm">No matches analysed yet.</p>
          <Link href="/upload" className={buttonVariants({ size: 'sm', className: 'rounded-full' })}>
            Analyse your first match
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      {isProcessing && <RefreshPoller />}

      {/* Page header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">FrameMatters</p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-black tracking-tight uppercase leading-none">My Matches</h1>
            {allMatches.length > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums font-medium">{allMatches.length} total</span>
            )}
          </div>
        </div>
        <Link href="/upload" className={buttonVariants({ size: 'sm' })}>+ Analyse</Link>
      </div>

      {/* In Progress */}
      {scanningVideos.length > 0 && (
        <div className="space-y-2">
          {scanningVideos.map((v) => (
            <div key={v.id} className="rounded-xl border border-border/60 bg-card px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{v.originalFilename}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v.sourceType === 'public_url' ? 'Scanning for matches…' : 'Analysing…'}
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border border-blue-800/40 text-blue-400 flex-shrink-0">
                Analysing
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Failed */}
      {failedVideos.length > 0 && (
        <div className="space-y-2">
          {failedVideos.map((v) => (
            <div key={v.id} className="rounded-xl border border-rose-800/30 bg-rose-950/10 px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{v.originalFilename}</p>
                <p className="text-xs text-rose-400 mt-0.5">Analysis failed — remove or resubmit</p>
              </div>
              <DeleteVideoButton videoId={v.id} />
            </div>
          ))}
        </div>
      )}

      {/* Match timeline — grouped by month */}
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
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                      {monthKey}
                    </span>
                  </div>
                )}
                <div className="pb-3">
                  <MatchCard
                    match={match}
                    segments={matchSegs}
                    insightsList={matchInsightsList}
                    deleteButton={<DeleteMatchButton matchId={match.id} videoId={match.videoId ?? ''} />}
                  />
                </div>
              </React.Fragment>
            )
          })
        })()}
      </div>
    </div>
  )
}

function MatchCard({
  match,
  segments,
  insightsList,
  deleteButton,
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
                <Link href={`/matches/${match.id}`} className="font-black text-sm tracking-tight hover:text-primary transition-colors line-clamp-1 block">
                  {title}
                </Link>
              ) : (
                <span className="font-black text-sm tracking-tight line-clamp-1 block">{title}</span>
              )}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {match.resultWinner && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                    match.resultWinner === 'user'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30'
                      : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'
                  }`}>
                    {match.resultWinner === 'user'
                      ? (match.resultMethod === 'submission' ? 'W — Sub' : match.resultMethod === 'points' ? 'W — Pts' : 'W')
                      : (match.resultMethod === 'submission' ? 'L — Sub' : match.resultMethod === 'points' ? 'L — Pts' : 'L')}
                  </span>
                )}
                {match.opponentLabel && match.opponentLabel.toLowerCase() !== 'unknown' && match.context !== 'opponent' && (
                  <p className="text-xs text-muted-foreground line-clamp-1">vs. <span className="font-semibold text-foreground/70">{match.opponentLabel}</span></p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isAnalysed && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border ${
                  match.status === 'failed' ? 'border-rose-800/40 text-rose-400' : 'border-border text-muted-foreground'
                }`}>
                  {STATUS_LABEL[match.status] ?? match.status}
                </span>
              )}
              {deleteButton}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-muted text-muted-foreground">{contextLabel}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-bold uppercase tracking-wider">{formatLabel}</span>
            <span className="text-[9px] text-muted-foreground/50 ml-auto font-medium">{dateStr}</span>
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
            <span className="font-black text-foreground/70 uppercase tracking-wider">{domPct !== null ? `${domPct}% ctrl` : '—'}</span>
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
