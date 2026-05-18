import { db } from '../../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights } from '../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { MatchContent, type TimelineItem } from './match-content'
import { NarrateButton } from './narrate-button'
import { POSITIONS } from '../../../../lib/taxonomy/positions'
import { EVENT_TYPES } from '../../../../lib/taxonomy/events'

export const dynamic = 'force-dynamic'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))
const EVENT_MAP = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e.name]))

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
  processing: 'bg-blue-950 text-blue-400 border border-blue-800/50',
  analysed: 'bg-muted text-muted-foreground border border-border',
  failed: 'bg-rose-950 text-rose-400 border border-rose-800/50',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  processing: 'Analysing',
  analysed: 'Ready',
  failed: 'Failed',
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const { matchId } = await params
  const { back } = await searchParams

  const backHref = back ?? '/matches'
  const backLabel = back?.includes('/tournaments') ? '← Scout Opponent' : '← My Matches'

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

  // Build merged timeline
  const timelineItems: TimelineItem[] = [
    ...segments.map(s => ({
      type: 'position' as const,
      time: s.startSeconds,
      positionName: POSITION_MAP[s.positionId] ?? s.positionId,
      dominance: s.dominance,
      durationSeconds: s.endSeconds - s.startSeconds,
      segmentId: s.id,
    })),
    ...events.map(e => ({
      type: 'event' as const,
      time: e.timestampSeconds,
      actor: e.actor,
      eventName: EVENT_MAP[e.eventTypeId] ?? e.eventTypeId,
      techniqueLabel: e.techniqueLabel,
      outcome: e.outcome,
    })),
  ].sort((a, b) => a.time - b.time)

  const displayDate = match.recordedAt ?? match.createdAt

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <Link href={backHref} className="text-xs text-muted-foreground hover:text-foreground inline-block mb-3">
          {backLabel}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {match.tournamentOpponentId
                ? `${match.competitorLabel || 'Unknown'} vs. ${match.opponentLabel}`
                : `vs. ${match.opponentLabel}`}
            </h1>
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
              {STATUS_LABEL[match.status] ?? match.status}
            </span>
            {match.status === 'analysed' && (
              <Link
                href={`/matches/${matchId}/coach`}
                className={`${buttonVariants({ size: 'sm' })} gap-1.5`}
              >
                Frame by Frame
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-white/20 leading-none tracking-wide">AI</span>
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
        <div className="rounded-lg border border-rose-800/50 bg-rose-950/40 p-4 text-sm text-rose-400">
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
              <p className="text-xs text-muted-foreground">Segments</p>
              <p className="text-2xl font-bold mt-1">{segments.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Events</p>
              <p className="text-2xl font-bold mt-1">{events.length}</p>
            </div>
          </div>

          {/* Position breakdown */}
          {sortedPositions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Time on Mat</h2>
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
                          <div className="bg-emerald-500" style={{ width: `${domPct}%` }} />
                          <div className="bg-zinc-600" style={{ width: `${neuPct}%` }} />
                          <div className="bg-rose-400" style={{ width: `${infPct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> In Control
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-zinc-600 inline-block" /> Neutral
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Under Pressure
                </span>
              </div>
            </div>
          )}

          {/* Match Report */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Match Report</h2>
              <NarrateButton matchId={matchId} hasNarration={!!match.narration} />
            </div>

            {match.narration ? (
              <div className="rounded-xl border bg-card p-5 space-y-3">
                {match.narration.split('\n\n').filter(Boolean).map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-foreground/90">{para}</p>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No match report yet — click &ldquo;Generate Match Report&rdquo; to get a coach&rsquo;s breakdown of this match.
                </p>
              </div>
            )}
          </div>

          {/* Video + Timeline + Coaching Notes */}
          <MatchContent
            videoUrl={video?.publicUrl ?? null}
            matchInsights={matchInsights}
            timelineItems={timelineItems}
            segments={segments.map((s) => ({
              id: s.id,
              startSeconds: s.startSeconds,
              endSeconds: s.endSeconds,
              userBbox: (s.userBbox as { x1: number; y1: number; x2: number; y2: number } | null) ?? null,
              opponentBbox: (s.opponentBbox as { x1: number; y1: number; x2: number; y2: number } | null) ?? null,
            }))}
            spatialData={(match.spatialData as { roi: { x1: number; y1: number; x2: number; y2: number }; athlete: { x1: number; y1: number; x2: number; y2: number } } | null) ?? null}
          />
        </>
      )}
    </div>
  )
}
