import { db } from '../../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights, tournamentOpponents, users } from '../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { MatchContent, type TimelineItem } from './match-content'
import { ScoutingView } from './scouting-view'
import { NarrateButton } from './narrate-button'
import { ShareButton } from './share-button'
import { CorrectResultButton } from './correct-result-button'
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

  const userRow = match.tournamentOpponentId && match.userId
    ? await db.query.users.findFirst({
        where: eq(users.id, match.userId),
        columns: { ajpWins: true, ajpLosses: true, ajpProfileUrl: true, smoothcompWins: true, smoothcompLosses: true, smoothcompFedUrl: true, ibjjfBestResult: true, ibjjfProfileUrl: true },
      })
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
    ? `${match.competitorLabel || 'You'} vs. ${knownOpponent ?? tournamentOpponentRow?.opponentLabel ?? 'Opponent'}`
    : knownOpponent
    ? `vs. ${knownOpponent}`
    : `${match.format === 'no_gi' ? 'No-Gi' : 'Gi'} ${match.context === 'sparring' ? 'Sparring' : match.context === 'drilling' ? 'Drilling' : 'Competition'}`

  if (match.status === 'analysed') {
    return (
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
          kbVersion: match.kbVersion,
        }}
        videoUrl={video?.publicUrl ?? null}
        insights={matchInsights}
        timelineItems={timelineItems}
        sortedPositions={sortedPositions}
        maxPositionTime={maxPositionTime}
        positionNames={POSITION_MAP}
        backHref={backHref}
        backLabel={backLabel}
        viewMode={match.tournamentOpponentId ? 'scouting' : 'analysis'}
        opponentIntel={tournamentOpponentRow ? {
          ajpWins: tournamentOpponentRow.ajpWins ?? null,
          ajpLosses: tournamentOpponentRow.ajpLosses ?? null,
          ajpProfileUrl: tournamentOpponentRow.ajpProfileUrl ?? null,
          smoothcompWins: tournamentOpponentRow.smoothcompWins ?? null,
          smoothcompLosses: tournamentOpponentRow.smoothcompLosses ?? null,
          smoothcompFedUrl: tournamentOpponentRow.smoothcompFedUrl ?? null,
          ibjjfBestResult: tournamentOpponentRow.ibjjfBestResult ?? null,
          ibjjfProfileUrl: tournamentOpponentRow.ibjjfProfileUrl ?? null,
        } : null}
        userIntel={userRow ? {
          ajpWins: userRow.ajpWins ?? null,
          ajpLosses: userRow.ajpLosses ?? null,
          ajpProfileUrl: userRow.ajpProfileUrl ?? null,
          smoothcompWins: userRow.smoothcompWins ?? null,
          smoothcompLosses: userRow.smoothcompLosses ?? null,
          smoothcompFedUrl: userRow.smoothcompFedUrl ?? null,
          ibjjfBestResult: userRow.ibjjfBestResult ?? null,
          ibjjfProfileUrl: userRow.ibjjfProfileUrl ?? null,
        } : null}
      />
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
              {match.tournamentOpponentId && (
                <span className="text-xs uppercase tracking-[0.2em] text-amber-300 border border-amber-500/20 bg-amber-500/5 rounded-full px-2 py-1">
                  Opponent scouting
                </span>
              )}
              {match.resultWinner && (
                <MatchResultBadge winner={match.resultWinner} method={match.resultMethod} technique={match.resultTechnique} />
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
    </div>
  )
}
