import { db } from '../../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights } from '../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MatchContent, type TimelineItem } from '../../../(dashboard)/matches/[matchId]/match-content'
import { POSITIONS } from '../../../../lib/taxonomy/positions'
import { EVENT_TYPES } from '../../../../lib/taxonomy/events'
import type { Metadata } from 'next'

const POSITION_MAP = Object.fromEntries(POSITIONS.map((p) => [p.id, p.name]))
const EVENT_MAP = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e.name]))

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export async function generateMetadata({ params }: { params: Promise<{ shortId: string }> }): Promise<Metadata> {
  const { shortId } = await params
  const match = await db.query.matches.findFirst({ where: eq(matches.shareToken, shortId) })
  if (!match) return { title: 'Match Analysis — RollPlan' }

  const segments = await db.select().from(positionSegments).where(eq(positionSegments.matchId, match.id))
  const totalTime = segments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const dominantTime = segments.filter(s => s.dominance === 'dominant').reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)
  const controlRate = totalTime > 0 ? Math.round((dominantTime / totalTime) * 100) : 0

  const posStats: Record<string, number> = {}
  for (const s of segments) posStats[s.positionId] = (posStats[s.positionId] ?? 0) + (s.endSeconds - s.startSeconds)
  const topPos = Object.entries(posStats).sort((a, b) => b[1] - a[1])[0]
  const topPosName = topPos ? (POSITION_MAP[topPos[0]] ?? topPos[0]) : null

  const date = (match.recordedAt ?? match.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
  const title = `${match.competitorLabel ?? 'Match'} Analysis — ${date}`
  const description = [
    `vs. ${match.opponentLabel}`,
    `${controlRate}% control rate`,
    topPosName ? `${topPosName} dominant` : null,
  ].filter(Boolean).join(' · ')

  return {
    title,
    description,
    openGraph: { title, description, siteName: 'RollPlan' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function SharedMatchPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = await params

  const match = await db.query.matches.findFirst({ where: eq(matches.shareToken, shortId) })
  if (!match || match.status !== 'analysed') notFound()

  const video = match.videoId
    ? await db.query.videos.findFirst({ where: eq(videos.id, match.videoId) })
    : null

  const [segments, events, matchInsights] = await Promise.all([
    db.select().from(positionSegments).where(eq(positionSegments.matchId, match.id)).orderBy(asc(positionSegments.startSeconds)),
    db.select().from(matchEvents).where(eq(matchEvents.matchId, match.id)).orderBy(asc(matchEvents.timestampSeconds)),
    db.select().from(insights).where(eq(insights.matchId, match.id)),
  ])

  const positionStats: Record<string, { total: number; dominant: number; neutral: number; inferior: number }> = {}
  for (const seg of segments) {
    const dur = seg.endSeconds - seg.startSeconds
    if (!positionStats[seg.positionId]) positionStats[seg.positionId] = { total: 0, dominant: 0, neutral: 0, inferior: 0 }
    positionStats[seg.positionId].total += dur
    positionStats[seg.positionId][seg.dominance as 'dominant' | 'neutral' | 'inferior'] += dur
  }

  const sortedPositions = Object.entries(positionStats).sort((a, b) => b[1].total - a[1].total)
  const maxPositionTime = sortedPositions[0]?.[1].total ?? 1
  const totalMatchTime = segments.reduce((acc, s) => acc + (s.endSeconds - s.startSeconds), 0)

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

  const displayDate = (match.recordedAt ?? match.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
  const showVideo = match.shareIncludesVideo && video?.publicUrl

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header */}
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <Link href="/" className="text-xl font-extrabold tracking-tight [font-family:var(--font-brand)]">
          Frame<span className="text-muted-foreground font-bold">Matters</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">Shared match analysis</span>
          <Link
            href="/"
            className="text-xs px-3 py-1.5 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
          >
            Analyse your own matches →
          </Link>
        </div>
      </header>

      <main className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Match header */}
        <div>
          <h1 className="text-2xl font-bold">
            {match.tournamentOpponentId
              ? `${match.competitorLabel || 'Unknown'} vs. ${match.opponentLabel}`
              : `vs. ${match.opponentLabel}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {match.format === 'no_gi' ? 'No-Gi' : 'Gi'} · {match.context}
            {match.eventName ? ` · ${match.eventName}` : ''}
            {' · '}{displayDate}
          </p>
        </div>

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
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> In Control</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-zinc-600 inline-block" /> Neutral</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Under Pressure</span>
            </div>
          </div>
        )}

        {/* Match Report */}
        {match.narration && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Match Report</h2>
            <div className="rounded-xl border bg-card p-5 space-y-3">
              {match.narration.split('\n\n').filter(Boolean).map((para, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground/90">{para}</p>
              ))}
            </div>
          </div>
        )}

        {/* Video + Timeline + Coaching Notes */}
        <MatchContent
          videoUrl={showVideo ? video!.publicUrl! : null}
          videoHidden={!showVideo && !!video?.publicUrl}
          matchInsights={matchInsights}
          timelineItems={timelineItems}
          segments={segments.map((s) => ({
            id: s.id,
            startSeconds: s.startSeconds,
            endSeconds: s.endSeconds,
            userBbox: (s.userBbox as { x1: number; y1: number; x2: number; y2: number } | null) ?? null,
            opponentBbox: (s.opponentBbox as { x1: number; y1: number; x2: number; y2: number } | null) ?? null,
          }))}
          spatialData={null}
          competitorLabel={match.tournamentOpponentId ? match.competitorLabel : null}
          opponentLabel={match.tournamentOpponentId ? match.opponentLabel : null}
        />

        {/* Footer CTA */}
        <div className="border-t border-border/60 pt-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Analyse your own BJJ matches with AI</p>
          <Link href="/" className="inline-block text-sm px-4 py-2 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity">
            Try RollPlan free →
          </Link>
        </div>
      </main>
    </div>
  )
}
