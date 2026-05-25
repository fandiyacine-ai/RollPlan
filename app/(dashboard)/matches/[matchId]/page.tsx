import { db } from '../../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights, tournamentOpponents } from '../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { MatchContent, type TimelineItem } from './match-content'
import { NarrateButton } from './narrate-button'
import { ShareButton } from './share-button'
import { CorrectResultButton } from './correct-result-button'
import { ScoutingView } from './scouting-view'
import { ReanalyzeButton } from './reanalyze-button'
import { MarkUpgradeSeen } from './mark-upgrade-seen'
import { POSITIONS } from '../../../../lib/taxonomy/positions'
import { EVENT_TYPES } from '../../../../lib/taxonomy/events'
import { auth } from '@clerk/nextjs/server'

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

function MatchResultBadge({ winner, method, technique }: { winner: string; method: string | null; technique: string | null }) {
  const isWin = winner === 'user'
  const label = method === 'walkover'
    ? (isWin ? 'W — Walkover' : 'L — Walkover')
    : method === 'submission'
    ? (isWin ? `W — Sub${technique ? ` (${technique})` : ''}` : `L — Sub${technique ? ` (${technique})` : ''}`)
    : method === 'points'
    ? (isWin ? 'W — Points' : 'L — Points')
    : method === 'dq'
    ? (isWin ? 'W — DQ' : 'L — DQ')
    : isWin ? 'Win' : 'Loss'
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
      isWin
        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30'
        : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'
    }`}>
      {label}
    </span>
  )
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function isAdmin(clerkId: string | null | undefined) {
  const adminId = process.env.ADMIN_CLERK_USER_ID
  return !!adminId && clerkId === adminId
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
  const { userId: clerkUserId } = await auth()

  const backHref = back ?? '/matches'
  const backLabel = back?.includes('/tournaments') ? '← Scout Opponent' : '← My Matches'

  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
  if (!match) notFound()

  const video = match.videoId
    ? await db.query.videos.findFirst({ where: eq(videos.id, match.videoId) })
    : null

  const tournamentOpponentRow = match.tournamentOpponentId
    ? await db.query.tournamentOpponents.findFirst({ where: eq(tournamentOpponents.id, match.tournamentOpponentId) })
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
    if (dur <= 0) continue
    if (!positionStats[seg.positionId]) {
      positionStats[seg.positionId] = { total: 0, dominant: 0, neutral: 0, inferior: 0 }
    }
    positionStats[seg.positionId].total += dur
    positionStats[seg.positionId][seg.dominance as 'dominant' | 'neutral' | 'inferior'] += dur
  }

  const sortedPositions = Object.entries(positionStats).sort((a, b) => b[1].total - a[1].total)
  const maxPositionTime = sortedPositions[0]?.[1].total ?? 1
  const firstSegStart = segments[0]?.startSeconds ?? 0
  const lastSegEnd = segments[segments.length - 1]?.endSeconds ?? 0
  const lastEventTime = events.length > 0 ? events[events.length - 1].timestampSeconds : null
  const matchEnd = lastEventTime !== null ? Math.min(lastEventTime + 30, lastSegEnd) : lastSegEnd
  const totalMatchTime = matchEnd - firstSegStart

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
      eventName: EVENT_MAP[e.eventTypeId] ?? e.techniqueLabel ?? e.eventTypeId,
      techniqueLabel: e.techniqueLabel,
      outcome: e.outcome,
    })),
  ].sort((a, b) => a.time - b.time)

  const displayDate = match.recordedAt ?? match.createdAt
  const knownOpponent = (match.opponentLabel && match.opponentLabel.toLowerCase() !== 'unknown')
    ? match.opponentLabel
    : null

  const displayTitle = match.tournamentOpponentId
    ? `${match.competitorLabel || 'You'} vs. ${knownOpponent ?? 'Unknown'}`
    : knownOpponent
    ? `vs. ${knownOpponent}`
    : `${match.format === 'no_gi' ? 'No-Gi' : 'Gi'} ${match.context === 'sparring' ? 'Sparring' : match.context === 'drilling' ? 'Drilling' : 'Competition'}`

  // Scouting view: full-width two-panel layout for opponent footage
  if (match.tournamentOpponentId && match.status === 'analysed') {
    return (
      <>
        {/* Negate main's padding so ScoutingView fills the exact viewport below the nav (h-14 = 3.5rem).
            -mb-24 cancels pb-24 on mobile; sm:-mb-6 cancels pb-6 on desktop. */}
        <div className="-mx-6 -mt-6 -mb-24 sm:-mx-6 sm:-mt-6 sm:-mb-6 h-[calc(100svh-3.5rem)] overflow-hidden flex flex-col">
          <ScoutingView
            match={{
              id: match.id,
              competitorLabel: match.competitorLabel,
              opponentLabel: match.opponentLabel,
              format: match.format,
              context: match.context,
              eventName: match.eventName,
              resultWinner: match.resultWinner,
              resultMethod: match.resultMethod,
              resultTechnique: match.resultTechnique,
            }}
            videoUrl={video?.publicUrl ?? null}
            insights={matchInsights}
            timelineItems={timelineItems}
            sortedPositions={sortedPositions}
            maxPositionTime={maxPositionTime}
            positionNames={POSITION_MAP}
            backHref={backHref}
          />
        </div>
        {isAdmin(clerkUserId) && (
          <div className="fixed bottom-4 right-4 z-50 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg px-3 py-2 flex items-center gap-2 text-[10px]">
            <span className="text-zinc-500">Admin</span>
            <ReanalyzeButton matchId={matchId} />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <Link href={backHref} className="text-xs text-muted-foreground hover:text-foreground inline-block mb-3">
          {backLabel}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">
                {displayTitle}
              </h1>
              {match.resultWinner && (
                <MatchResultBadge winner={match.resultWinner} method={match.resultMethod} technique={match.resultTechnique} />
              )}
              {match.status === 'analysed' && (
                <CorrectResultButton matchId={matchId} />
              )}
            </div>
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
            {tournamentOpponentRow && (
              <Link
                href={`/tournaments/${tournamentOpponentRow.tournamentId}/gameplan?opponent=${tournamentOpponentRow.id}`}
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                View Gameplan for {tournamentOpponentRow.opponentLabel} →
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[match.status]}`}>
              {STATUS_LABEL[match.status] ?? match.status}
            </span>
            {match.status === 'analysed' && (
              <>
                <ShareButton matchId={matchId} />
                <Link
                  href={`/matches/${matchId}/coach?back=${encodeURIComponent(backHref)}`}
                  className={`${buttonVariants({ size: 'sm' })} gap-1.5`}
                >
                  Frame by Frame
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-white/20 leading-none tracking-wide">AI</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KB upgrade banner — shown until user has seen it */}
      {match.kbUpgradedAt && (!match.kbUpgradeSeenAt || match.kbUpgradedAt > match.kbUpgradeSeenAt) && (
        <>
          <MarkUpgradeSeen matchId={matchId} />
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>
              <circle cx="8" cy="8" r="3"/>
            </svg>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-500">Analysis upgraded</p>
              {match.kbChangelog && match.kbChangelog.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {match.kbChangelog.map((entry, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="text-foreground/70">{new Date(entry.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      {' — '}+{entry.added} event{entry.added !== 1 ? 's' : ''} detected
                      {entry.summary ? `: ${entry.summary}` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

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
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-2xl font-bold mt-1">{matchInsights.length}</p>
            </div>
          </div>

          {/* Position breakdown */}
          {sortedPositions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4.5"/><path d="M6 3.5v2.5l1.5 1"/></svg>
                Time on Mat
              </h2>
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
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="1.5" width="8" height="9" rx="1"/><path d="M4 4.5h4M4 6.5h4M4 8.5h2"/></svg>
                Match Report
              </h2>
              <NarrateButton matchId={matchId} hasNarration={!!match.narration} />
            </div>

            {match.narration ? (
              <div className="rounded-xl border bg-card p-5 space-y-4">
                {match.narration.split('\n\n').filter(Boolean).map((chunk, i) => {
                  const lines = chunk.split('\n')
                  const firstLine = lines[0].trim()
                  const isHeader = firstLine === firstLine.toUpperCase() && firstLine.length < 30 && /^[A-Z\s]+$/.test(firstLine)
                  if (isHeader) {
                    const body = lines.slice(1).join('\n').trim()
                    return (
                      <div key={i} className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{firstLine}</p>
                        {body && <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{body}</p>}
                      </div>
                    )
                  }
                  return <p key={i} className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{chunk}</p>
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No match report yet — click &ldquo;Generate Match Report&rdquo; to get a coach&rsquo;s breakdown of this match.
                </p>
              </div>
            )}
          </div>

          {/* Admin: re-run full pipeline */}
          {isAdmin(clerkUserId) && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
              <span>Admin:</span>
              <ReanalyzeButton matchId={matchId} />
            </div>
          )}

          {/* Video + Timeline + Coaching Notes */}
          <MatchContent
            videoUrl={video?.publicUrl ?? null}
            matchInsights={matchInsights}
            timelineItems={timelineItems}
            matchId={match.id}
            competitorLabel={match.tournamentOpponentId ? match.competitorLabel : null}
            opponentLabel={match.tournamentOpponentId ? match.opponentLabel : null}
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
