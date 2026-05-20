import { db } from '../../../../../lib/db'
import { tournaments, tournamentOpponents, matches, videos } from '../../../../../lib/db/schema'
import { eq, inArray, isNull, and, notLike, like, sql } from 'drizzle-orm'
import { AddOpponentForm } from './opponent-forms'
import { OpponentAccordion } from './opponent-accordion'
import { SyncBracketButton } from './sync-bracket-button'
import { PostEventBanner } from './post-event-banner'
import { AutoRefresh } from './auto-refresh'

export const dynamic = 'force-dynamic'

type MatchRow = {
  id: string; status: string; format: string | null; context: string | null
  eventName: string | null; opponentLabel: string | null; createdAt: Date; label: string | null; tournamentOpponentId: string | null
  resultWinner: string | null; resultMethod: string | null; resultTechnique: string | null
}

type VideoRow = {
  id: string; status: string; label: string; createdAt: Date; tournamentOpponentId: string | null
  failureReason: string | null; chunksDone: number | null; chunksTotal: number | null
}

function DbError({ label, err }: { label: string; err: unknown }) {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    <div className="rounded-lg border border-rose-800/50 bg-rose-950/20 p-4 text-sm text-rose-400">
      <p className="font-semibold mb-1">DB error ({label})</p>
      <pre className="text-xs whitespace-pre-wrap break-all">{msg}</pre>
    </div>
  )
}

export default async function OpponentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params

  const tournamentRow = await db
    .select({
      name: tournaments.name,
      smoothcompUrl: tournaments.smoothcompUrl,
      eventDate: tournaments.eventDate,
      outcome: tournaments.outcome,
    })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1)
    .then(r => r[0] ?? null)
    .catch(() => null)

  const eventDatePassed = tournamentRow?.eventDate
    ? new Date(tournamentRow.eventDate) < new Date()
    : false
  const showPostEventBanner = eventDatePassed && !tournamentRow?.outcome

  let opponents: { id: string; tournamentId: string; opponentLabel: string; playerCardId: string | null; seedingNotes: string | null; createdAt: Date; footageStatus: string; smoothcompAthleteId: string | null }[]
  try {
    opponents = await db
      .select({
        id: tournamentOpponents.id,
        tournamentId: tournamentOpponents.tournamentId,
        opponentLabel: tournamentOpponents.opponentLabel,
        playerCardId: tournamentOpponents.playerCardId,
        seedingNotes: tournamentOpponents.seedingNotes,
        createdAt: tournamentOpponents.createdAt,
        footageStatus: tournamentOpponents.footageStatus,
        smoothcompAthleteId: tournamentOpponents.smoothcompAthleteId,
      })
      .from(tournamentOpponents)
      .where(eq(tournamentOpponents.tournamentId, tournamentId))
      .orderBy(tournamentOpponents.createdAt)
  } catch (err) {
    return <DbError label="opponents query" err={err} />
  }

  const opponentIds = opponents.map(o => o.id)

  let allMatches: MatchRow[] = []
  let allPendingVideos: VideoRow[] = []

  if (opponentIds.length > 0) {
    try {
      allMatches = await db.select({
        id: matches.id,
        status: matches.status,
        format: matches.format,
        context: matches.context,
        eventName: matches.eventName,
        opponentLabel: matches.opponentLabel,
        createdAt: matches.createdAt,
        label: matches.eventName,
        tournamentOpponentId: matches.tournamentOpponentId,
        resultWinner: matches.resultWinner,
        resultMethod: matches.resultMethod,
        resultTechnique: matches.resultTechnique,
      })
      .from(matches)
      .where(inArray(matches.tournamentOpponentId, opponentIds))
      .orderBy(matches.createdAt) as MatchRow[]
    } catch (err) {
      return <DbError label="matches query" err={err} />
    }

    try {
      const rawVideos = await db.select({
        id: videos.id,
        status: videos.status,
        label: videos.originalFilename,
        createdAt: videos.uploadedAt,
        tournamentOpponentId: videos.tournamentOpponentId,
        failureReason: videos.failureReason,
      })
      .from(videos)
      .leftJoin(matches, eq(matches.videoId, videos.id))
      .where(and(
        inArray(videos.tournamentOpponentId, opponentIds),
        isNull(matches.id),
        notLike(videos.r2Key, 'chunk/%'),
      ))
      .orderBy(videos.uploadedAt)

      // For parent videos in processing state, fetch chunk scan progress
      const processingIds = rawVideos.filter(v => v.status === 'processing').map(v => v.id)
      const chunkCountById: Record<string, { done: number; total: number }> = {}
      if (processingIds.length > 0) {
        const counts = await db.select({
          parentId: sql<string>`split_part(r2_key, '/', 2)`,
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(*) filter (where status = 'analysed')::int`,
        })
        .from(videos)
        .where(and(like(videos.r2Key, 'chunk/%'), inArray(videos.tournamentOpponentId, opponentIds)))
        .groupBy(sql`split_part(r2_key, '/', 2)`)
        for (const r of counts) chunkCountById[r.parentId] = { done: r.done, total: r.total }
      }

      allPendingVideos = rawVideos.map(v => ({
        ...v,
        chunksDone: chunkCountById[v.id]?.done ?? null,
        chunksTotal: chunkCountById[v.id]?.total ?? null,
      })) as VideoRow[]
    } catch (err) {
      return <DbError label="videos query" err={err} />
    }
  }

  const matchesByOpponent = allMatches.reduce<Record<string, MatchRow[]>>((acc, m) => {
    if (!m.tournamentOpponentId) return acc
    acc[m.tournamentOpponentId] ??= []
    acc[m.tournamentOpponentId].push(m)
    return acc
  }, {})

  const pendingVideosByOpponent = allPendingVideos.reduce<Record<string, VideoRow[]>>((acc, v) => {
    if (!v.tournamentOpponentId) return acc
    acc[v.tournamentOpponentId] ??= []
    acc[v.tournamentOpponentId].push(v)
    return acc
  }, {})

  const hasActiveScans = allMatches.some(m => m.status === 'processing' || m.status === 'pending' || m.status === 'uploaded')
    || allPendingVideos.some(v => v.status === 'processing' || v.status === 'pending' || v.status === 'uploaded')
    || opponents.some(o => o.footageStatus === 'pending' || o.footageStatus === 'auto_queued')

  return (
    <div className="space-y-5">
      {hasActiveScans && <AutoRefresh />}
      {showPostEventBanner && tournamentRow && (
        <PostEventBanner
          tournamentId={tournamentId}
          tournamentName={tournamentRow.name}
        />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Opponents ({opponents.length})
        </h2>
        <div className="flex items-center gap-3">
          {tournamentRow?.smoothcompUrl?.includes('/bracket/') && opponents.length > 0 && (
            <SyncBracketButton tournamentId={tournamentId} />
          )}
          <AddOpponentForm tournamentId={tournamentId} />
        </div>
      </div>

      {opponents.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-primary text-sm font-semibold">Step 2 of 3</span>
            <div className="flex items-center gap-1">
              <span className="text-primary text-lg">●</span>
              <span className="text-primary text-lg">●</span>
              <span className="text-muted-foreground/40 text-lg">●</span>
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">Who are you facing?</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Add the athletes you might meet in your bracket. Once you add them, scout their footage and the AI will build you a gameplan for each.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {opponents.map((opp) => (
            <OpponentAccordion
              key={opp.id}
              opponent={{ ...opp, footageStatus: opp.footageStatus ?? 'manual' }}
              matches={(matchesByOpponent[opp.id] ?? []).map(m => ({
                ...m, format: m.format ?? null, context: m.context ?? null, label: undefined,
                resultWinner: m.resultWinner ?? null, resultMethod: m.resultMethod ?? null, resultTechnique: m.resultTechnique ?? null,
                failureReason: null,
              }))}
              pendingVideos={(pendingVideosByOpponent[opp.id] ?? [])
                .filter(v => {
                  // Hide the parent video once chunk scanning has found matches for this opponent.
                  // The parent is marked 'analysed' when chunks succeed, but matches are linked
                  // to chunk video IDs so the parent always appears in the no-match query.
                  const hasMatches = (matchesByOpponent[opp.id] ?? []).length > 0
                  return !(hasMatches && v.status === 'analysed')
                })
                .map(v => ({
                  ...v,
                  format: null, context: null, eventName: null, opponentLabel: null,
                  resultWinner: null, resultMethod: null, resultTechnique: null,
                  status: v.status === 'analysed' ? 'failed' : v.status,
                  failureReason: v.status === 'analysed'
                    ? (v.failureReason ?? 'Scan complete — no matches found for this athlete in the video.')
                    : (v.failureReason ?? null),
                  chunksDone: v.chunksDone ?? null,
                  chunksTotal: v.chunksTotal ?? null,
                }))}
              tournamentId={tournamentId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
