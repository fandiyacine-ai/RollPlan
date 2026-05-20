import { db } from '../../../../../lib/db'
import { tournaments, tournamentOpponents, matches, videos, gameplans } from '../../../../../lib/db/schema'
import { eq, inArray, isNull, and, notLike, like, sql } from 'drizzle-orm'
import { AddOpponentForm } from './opponent-forms'
import { OpponentAccordion } from './opponent-accordion'
import { SyncBracketButton } from './sync-bracket-button'
import { PostEventBanner } from './post-event-banner'
import { AutoRefresh } from './auto-refresh'
import { ImportBracketDialog } from './import-bracket-dialog'
import type { MatchupPrediction } from '../../../../../lib/ai/schemas/prediction'

export const dynamic = 'force-dynamic'

type MatchRow = {
  id: string; status: string; format: string | null; context: string | null
  eventName: string | null; opponentLabel: string | null; createdAt: Date; label: string | null; tournamentOpponentId: string | null
  resultWinner: string | null; resultMethod: string | null; resultTechnique: string | null
}

type VideoRow = {
  id: string; status: string; label: string; createdAt: Date; tournamentOpponentId: string | null
  failureReason: string | null; chunksDone: number | null; chunksTotal: number | null; chunksFailed: number | null
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

  // Predictions for tournament outlook card
  const allGameplans = opponentIds.length > 0
    ? await db
        .select({ opponentId: gameplans.opponentId, prediction: gameplans.prediction })
        .from(gameplans)
        .where(eq(gameplans.tournamentId, tournamentId))
        .catch(() => [] as { opponentId: string | null; prediction: unknown }[])
    : []

  const predictionByOpponent = Object.fromEntries(
    allGameplans
      .filter(g => g.opponentId && g.prediction)
      .map(g => [g.opponentId!, g.prediction as MatchupPrediction])
  )

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

      // For parent videos in processing/failed state, fetch chunk scan progress
      const chunkedIds = rawVideos.filter(v => v.status === 'processing' || v.status === 'failed').map(v => v.id)
      const chunkCountById: Record<string, { done: number; total: number; failed: number }> = {}
      if (chunkedIds.length > 0) {
        const counts = await db.select({
          parentId: sql<string>`split_part(r2_key, '/', 2)`,
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(*) filter (where status = 'analysed')::int`,
          failed: sql<number>`count(*) filter (where status = 'failed')::int`,
        })
        .from(videos)
        .where(and(like(videos.r2Key, 'chunk/%'), inArray(videos.tournamentOpponentId, opponentIds)))
        .groupBy(sql`split_part(r2_key, '/', 2)`)
        for (const r of counts) chunkCountById[r.parentId] = { done: r.done, total: r.total, failed: r.failed }
      }

      allPendingVideos = rawVideos.map(v => ({
        ...v,
        chunksDone: chunkCountById[v.id]?.done ?? null,
        chunksTotal: chunkCountById[v.id]?.total ?? null,
        chunksFailed: chunkCountById[v.id]?.failed ?? null,
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

  // Opponents with no footage and no active scans — need user action
  const opponentsNeedingFootage = opponents.filter(o => {
    const hasAnyRow = (allMatches.some(m => m.tournamentOpponentId === o.id))
      || (allPendingVideos.some(v => v.tournamentOpponentId === o.id))
    const isAutoSearching = o.footageStatus === 'pending' || o.footageStatus === 'auto_queued'
    return !hasAnyRow && !isAutoSearching
  })

  return (
    <div className="space-y-5">
      {hasActiveScans && <AutoRefresh />}
      {opponentsNeedingFootage.length > 0 && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 flex items-start gap-3 text-xs text-amber-300">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-amber-400">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            <span className="font-semibold text-amber-200">
              {opponentsNeedingFootage.length === 1
                ? `${opponentsNeedingFootage[0].opponentLabel} needs scouting footage.`
                : `${opponentsNeedingFootage.length} opponents need scouting footage.`}
            </span>{' '}
            Expand each opponent below and click <span className="font-medium">"Scout footage"</span> to add YouTube links or upload videos. The AI will analyse their game and generate a gameplan.
          </span>
        </div>
      )}
      {showPostEventBanner && tournamentRow && (
        <PostEventBanner
          tournamentId={tournamentId}
          tournamentName={tournamentRow.name}
        />
      )}

      {/* Tournament Outlook — shown when ≥2 opponents have predictions */}
      {Object.keys(predictionByOpponent).length >= 2 && (() => {
        const entries = opponents
          .filter(o => predictionByOpponent[o.id])
          .map(o => ({ name: o.opponentLabel, pred: predictionByOpponent[o.id] }))
        const favourable = entries.filter(e => e.pred.verdict === 'favourable').length
        const tough = entries.filter(e => e.pred.verdict === 'tough').length
        const neutral = entries.filter(e => e.pred.verdict === 'neutral').length
        const avgWinProb = Math.round(entries.reduce((s, e) => s + e.pred.win_probability, 0) / entries.length)
        const overallVerdict = avgWinProb >= 60 ? 'Strong draw' : avgWinProb >= 45 ? 'Mixed draw' : 'Tough draw'
        return (
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tournament Outlook</p>
                <p className="text-lg font-bold mt-0.5">{overallVerdict} <span className="text-sm font-normal text-muted-foreground">· avg {avgWinProb}% win probability</span></p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {favourable > 0 && <span className="px-2 py-1 rounded-full border border-emerald-800/30 bg-emerald-950/30 text-emerald-400 font-medium">{favourable} favourable</span>}
                {neutral > 0 && <span className="px-2 py-1 rounded-full border border-zinc-700/30 bg-zinc-800/30 text-zinc-400 font-medium">{neutral} neutral</span>}
                {tough > 0 && <span className="px-2 py-1 rounded-full border border-rose-800/30 bg-rose-950/30 text-rose-400 font-medium">{tough} tough</span>}
              </div>
            </div>
            <div className="space-y-1.5">
              {entries.map(({ name, pred }) => {
                const colour = pred.verdict === 'favourable' ? 'bg-emerald-500' : pred.verdict === 'tough' ? 'bg-rose-500' : 'bg-amber-500'
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-32 truncate flex-shrink-0">{name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${colour}`} style={{ width: `${pred.win_probability}%` }} />
                    </div>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground w-8 text-right flex-shrink-0">{pred.win_probability}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Opponents ({opponents.length})
        </h2>
        <div className="flex items-center gap-2">
          {tournamentRow?.smoothcompUrl?.includes('/bracket/') && opponents.length > 0 && (
            <SyncBracketButton tournamentId={tournamentId} />
          )}
          {tournamentRow?.smoothcompUrl?.includes('/bracket/') && (
            <ImportBracketDialog tournamentId={tournamentId} />
          )}
          <AddOpponentForm tournamentId={tournamentId} />
        </div>
      </div>

      {/* Sync bracket hint when no bracket URL is linked yet */}
      {opponents.length > 0 && !tournamentRow?.smoothcompUrl?.includes('/bracket/') && (
        <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-3 flex items-start gap-3 text-xs text-muted-foreground">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            <span className="font-medium text-foreground/70">AI-extracted results may contain errors.</span>{' '}
            To auto-correct match results from the official draw, edit this tournament and add your Smoothcomp bracket URL — a "Sync from bracket" button will appear here.
            Results can also be corrected manually via "Wrong result?" on each match page.
          </span>
        </div>
      )}

      {opponents.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <span className="text-primary text-sm font-semibold">Step 2 of 3</span>
            <div className="flex items-center gap-1">
              <span className="text-primary text-lg">●</span>
              <span className="text-primary text-lg">●</span>
              <span className="text-muted-foreground/40 text-lg">●</span>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1">Who are you facing?</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add the athletes you might meet in your bracket — the AI will scout their footage and build you a gameplan for each.
            </p>
          </div>
          {tournamentRow?.smoothcompUrl?.includes('/bracket/') ? (
            <div className="flex flex-col items-center gap-3">
              <ImportBracketDialog tournamentId={tournamentId} />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>or</span>
                <AddOpponentForm tournamentId={tournamentId} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <AddOpponentForm tournamentId={tournamentId} />
              <p className="text-xs text-muted-foreground max-w-xs">
                Have a Smoothcomp bracket URL?{' '}
                <span className="font-medium text-foreground/70">Edit your tournament</span> to add it — you can then import your full draw in one click.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {opponents.map((opp) => (
            <OpponentAccordion
              key={opp.id}
              opponent={{ ...opp, footageStatus: opp.footageStatus ?? 'manual' }}
              matches={(matchesByOpponent[opp.id] ?? []).map(m => ({
                ...m, rowType: 'match' as const, format: m.format ?? null, context: m.context ?? null, label: undefined,
                resultWinner: m.resultWinner ?? null, resultMethod: m.resultMethod ?? null, resultTechnique: m.resultTechnique ?? null,
                failureReason: null,
              }))}
              pendingVideos={(pendingVideosByOpponent[opp.id] ?? [])
                .filter(v => {
                  // Once matches exist, hide parent videos that are either:
                  // (a) 'analysed' — chunks succeeded, matches live on chunk video IDs
                  // (b) 'failed' with chunk data — an old scan attempt that a re-submit fixed
                  const hasMatches = (matchesByOpponent[opp.id] ?? []).length > 0
                  if (!hasMatches) return true
                  if (v.status === 'analysed') return false
                  if (v.status === 'failed' && v.chunksTotal != null) return false
                  return true
                })
                .map(v => ({
                  ...v,
                  rowType: 'video' as const,
                  format: null, context: null, eventName: null, opponentLabel: null,
                  resultWinner: null, resultMethod: null, resultTechnique: null,
                  status: v.status === 'analysed' ? 'failed' : v.status,
                  failureReason: v.status === 'analysed'
                    ? (v.failureReason ?? 'Scan complete — no matches found for this athlete in the video.')
                    : (v.failureReason ?? null),
                  chunksDone: v.chunksDone ?? null,
                  chunksTotal: v.chunksTotal ?? null,
                  chunksFailed: v.chunksFailed ?? null,
                }))}
              tournamentId={tournamentId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
