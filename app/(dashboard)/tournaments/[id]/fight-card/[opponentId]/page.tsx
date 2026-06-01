import { db } from '@/lib/db'
import { tournaments, tournamentOpponents, matches, positionSegments, matchEvents, gameplans, videos } from '@/lib/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { currentUser } from '@clerk/nextjs/server'
import type { GameplanOutput } from '@/lib/ai/schemas/gameplan'
import { GenerateGameplanButton } from '../../gameplan/generate-button'

export const dynamic = 'force-dynamic'

// ── helpers ────────────────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round((n / total) * 100)}%`
}

function careerRecord(wins: number | null | undefined, losses: number | null | undefined): string | null {
  if (wins == null && losses == null) return null
  return `${wins ?? 0}W ${losses ?? 0}L`
}

// ── page ───────────────────────────────────────────────────────────────────────

export default async function FightCardPage({
  params,
}: {
  params: Promise<{ id: string; opponentId: string }>
}) {
  const { id: tournamentId, opponentId } = await params
  const userId = await getOrCreateDbUserId().catch(() => null)
  if (!userId) notFound()

  // Tournament
  const tournament = await db.query.tournaments.findFirst({
    where: and(eq(tournaments.id, tournamentId), eq(tournaments.userId, userId)),
  })
  if (!tournament) notFound()

  // Opponent
  const opponent = await db.query.tournamentOpponents.findFirst({
    where: and(eq(tournamentOpponents.id, opponentId), eq(tournamentOpponents.tournamentId, tournamentId)),
  })
  if (!opponent) notFound()

  // User display name (from Clerk profile)
  const clerkUser = await currentUser()
  const userName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || 'You'

  // ── Scouted matches (opponent side) ──────────────────────────────────────────

  const scoutedMatches = await db
    .select({
      id: matches.id,
      resultWinner: matches.resultWinner,
      resultMethod: matches.resultMethod,
      resultTechnique: matches.resultTechnique,
    })
    .from(matches)
    .where(and(eq(matches.tournamentOpponentId, opponentId), eq(matches.status, 'analysed')))

  const scoutedMatchIds = scoutedMatches.map(m => m.id)

  // ── Opponent position stats ───────────────────────────────────────────────────
  let oppTopSecs = 0
  let oppTotalSecs = 0
  let oppTopPositions: Array<{ positionId: string; secs: number }> = []

  if (scoutedMatchIds.length > 0) {
    const posRows = await db
      .select({
        positionId: positionSegments.positionId,
        userRole: positionSegments.userRole,
        totalSecs: sql<number>`sum(${positionSegments.endSeconds} - ${positionSegments.startSeconds})`,
      })
      .from(positionSegments)
      .where(inArray(positionSegments.matchId, scoutedMatchIds))
      .groupBy(positionSegments.positionId, positionSegments.userRole)

    for (const row of posRows) {
      const secs = Number(row.totalSecs)
      oppTotalSecs += secs
      if (row.userRole === 'bottom') {
        oppTopSecs += secs
        oppTopPositions.push({ positionId: row.positionId, secs })
      }
    }
    oppTopPositions.sort((a, b) => b.secs - a.secs)
  }

  // ── Opponent key attacks ──────────────────────────────────────────────────────
  let oppAttacks: Array<{ label: string; count: number }> = []
  if (scoutedMatchIds.length > 0) {
    const evRows = await db
      .select({
        techniqueLabel: matchEvents.techniqueLabel,
        count: sql<number>`count(*)`,
      })
      .from(matchEvents)
      .where(
        and(
          inArray(matchEvents.matchId, scoutedMatchIds),
          eq(matchEvents.actor, 'opponent'),
          inArray(matchEvents.outcome, ['successful', 'failed']),
        )
      )
      .groupBy(matchEvents.techniqueLabel)

    oppAttacks = evRows
      .filter(r => r.techniqueLabel)
      .map(r => ({ label: r.techniqueLabel!, count: Number(r.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  }

  // ── User own matches ──────────────────────────────────────────────────────────
  const ownMatchRows = await db
    .select({
      id: matches.id,
      resultWinner: matches.resultWinner,
      resultMethod: matches.resultMethod,
    })
    .from(matches)
    .innerJoin(videos, eq(videos.id, matches.videoId))
    .where(
      and(
        eq(matches.userId, userId),
        eq(matches.status, 'analysed'),
        inArray(videos.sourceType, ['own_competition', 'own_sparring']),
      )
    )

  const ownMatchIds = ownMatchRows.map(m => m.id)
  const ownWins = ownMatchRows.filter(m => m.resultWinner === 'user').length
  const ownTotal = ownMatchRows.length

  // ── User position stats ───────────────────────────────────────────────────────
  let userTopSecs = 0
  let userTotalSecs = 0
  let userTopPositions: Array<{ positionId: string; secs: number }> = []

  if (ownMatchIds.length > 0) {
    const posRows = await db
      .select({
        positionId: positionSegments.positionId,
        userRole: positionSegments.userRole,
        totalSecs: sql<number>`sum(${positionSegments.endSeconds} - ${positionSegments.startSeconds})`,
      })
      .from(positionSegments)
      .where(inArray(positionSegments.matchId, ownMatchIds))
      .groupBy(positionSegments.positionId, positionSegments.userRole)

    for (const row of posRows) {
      const secs = Number(row.totalSecs)
      userTotalSecs += secs
      if (row.userRole === 'top') {
        userTopSecs += secs
        userTopPositions.push({ positionId: row.positionId, secs })
      }
    }
    userTopPositions.sort((a, b) => b.secs - a.secs)
  }

  // ── User key attacks ──────────────────────────────────────────────────────────
  let userAttacks: Array<{ label: string; count: number }> = []
  if (ownMatchIds.length > 0) {
    const evRows = await db
      .select({
        techniqueLabel: matchEvents.techniqueLabel,
        count: sql<number>`count(*)`,
      })
      .from(matchEvents)
      .where(
        and(
          inArray(matchEvents.matchId, ownMatchIds),
          eq(matchEvents.actor, 'user'),
          inArray(matchEvents.outcome, ['successful', 'failed']),
        )
      )
      .groupBy(matchEvents.techniqueLabel)

    userAttacks = evRows
      .filter(r => r.techniqueLabel)
      .map(r => ({ label: r.techniqueLabel!, count: Number(r.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  }

  // ── Gameplan ──────────────────────────────────────────────────────────────────
  const gameplan = await db.query.gameplans.findFirst({
    where: eq(gameplans.opponentId, opponentId),
    columns: { structuredPlan: true, status: true },
  })

  const plan = (gameplan?.status !== 'generating' && gameplan?.structuredPlan && Object.keys(gameplan.structuredPlan as object).length > 0)
    ? gameplan.structuredPlan as GameplanOutput
    : null
  const isGenerating = gameplan?.status === 'generating'

  const card = plan?.match_card ?? null

  const ajpRecord = careerRecord(opponent.ajpWins, opponent.ajpLosses)
  const scRecord = careerRecord(opponent.smoothcompWins, opponent.smoothcompLosses)

  const POSITION_LABEL: Record<string, string> = {
    closed_guard: 'Closed guard', half_guard: 'Half guard', open_guard: 'Open guard',
    butterfly_guard: 'Butterfly', back_control: 'Back control', mount: 'Mount',
    side_control: 'Side control', turtle: 'Turtle', north_south: 'N/S',
    knee_on_belly: 'Knee on belly', standing: 'Standing', rear_naked: 'RNC',
    x_guard: 'X-guard', deep_half: 'Deep half', fifty_fifty: '50/50',
  }

  function fmtPos(id: string) {
    return POSITION_LABEL[id] ?? id.replace(/_/g, ' ')
  }

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Fight Card ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/40">

        {/* Hero — broadcast-style dark header */}
        <div className="relative bg-[oklch(0.13_0.01_255)] overflow-hidden">

          {/* Side accent strips */}
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-emerald-400 to-emerald-600" />
          <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-rose-400 to-rose-600" />

          {/* Meta row */}
          <div className="relative border-b border-white/[0.07] px-7 py-2.5 flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/20">Fight Card</span>
            <div className="flex items-center gap-2">
              {tournament.ruleset && (
                <span className="bg-white/[0.07] border border-white/[0.09] rounded px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white/40">
                  {tournament.ruleset}
                </span>
              )}
              {tournament.division && (
                <span className="text-[10px] text-white/30 font-medium">{tournament.division}</span>
              )}
              {tournament.weightClass && (
                <>
                  <span className="text-white/20 text-[10px]">·</span>
                  <span className="text-[10px] text-white/30 font-medium">{tournament.weightClass}</span>
                </>
              )}
            </div>
          </div>

          {/* Athletes */}
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-7 py-8 sm:py-10">

            {/* User side */}
            <div className="min-w-0">
              <p className="text-[7px] font-black uppercase tracking-[0.35em] text-emerald-400/60 mb-1.5">You</p>
              <p className="font-display text-5xl sm:text-6xl uppercase leading-[0.88] tracking-wide text-white truncate">
                {userName}
              </p>
            </div>

            {/* VS badge */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full border border-white/[0.12] bg-white/[0.04] flex items-center justify-center">
                <span className="text-[8px] font-black tracking-[0.15em] text-white/30 uppercase">vs</span>
              </div>
            </div>

            {/* Opponent side */}
            <div className="min-w-0 text-right">
              <p className="text-[7px] font-black uppercase tracking-[0.35em] text-rose-400/60 mb-1.5">Opponent</p>
              <div className="flex items-end justify-end gap-3 min-w-0">
                <p className="font-display text-5xl sm:text-6xl uppercase leading-[0.88] tracking-wide text-white truncate">
                  {opponent.opponentLabel}
                </p>
                {opponent.profilePhotoUrl && (
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-rose-500/30 flex-shrink-0 mb-0.5">
                    <Image
                      src={opponent.profilePhotoUrl}
                      alt={opponent.opponentLabel}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subtle gradient fade at bottom of hero */}
          <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-card/20 to-transparent pointer-events-none" />
        </div>

        {/* Stats panel */}
        <div className="grid grid-cols-[1fr_1px_1fr] bg-card">

          {/* User stats */}
          <div className="p-4 space-y-2">
            <p className="text-[7px] font-black uppercase tracking-[0.3em] text-emerald-500/50 mb-3">Your record</p>
            <StatRow label="Matches" value={ownTotal > 0 ? String(ownTotal) : '—'} accent="emerald" />
            {ownTotal > 0 && (
              <>
                <StatRow label="Win rate" value={pct(ownWins, ownTotal)} accent="emerald" />
                <StatRow label="Top time" value={pct(userTopSecs, userTotalSecs)} />
              </>
            )}
            {userTopPositions.slice(0, 2).map(p => (
              <StatRow key={p.positionId} label={fmtPos(p.positionId)} value={`${Math.round(p.secs)}s`} dim />
            ))}
            {userAttacks.length > 0 && (
              <div className="pt-2 mt-1 border-t border-border/20 space-y-1.5">
                <p className="text-[7px] font-black uppercase tracking-[0.25em] text-muted-foreground/30">Attacks</p>
                {userAttacks.slice(0, 3).map(a => (
                  <p key={a.label} className="text-[11px] text-foreground/70">
                    <span className="font-semibold">{a.label}</span>
                    <span className="text-[9px] ml-1 text-muted-foreground/35">×{a.count}</span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="bg-border/40" />

          {/* Opponent stats */}
          <div className="p-4 space-y-2">
            <p className="text-[7px] font-black uppercase tracking-[0.3em] text-rose-500/50 mb-3 text-right">Their record</p>
            <StatRow label="Scouted" value={scoutedMatches.length > 0 ? String(scoutedMatches.length) : '—'} right accent="rose" />
            {scoutedMatches.length > 0 && (
              <StatRow label="Top time" value={pct(oppTopSecs, oppTotalSecs)} right />
            )}
            {ajpRecord && <StatRow label="AJP" value={ajpRecord} right accent="rose" />}
            {scRecord && <StatRow label="SC" value={scRecord} right />}
            {opponent.ibjjfBestResult && (
              <StatRow label="IBJJF best" value={opponent.ibjjfBestResult} right dim />
            )}
            {oppTopPositions.slice(0, 2).map(p => (
              <StatRow key={p.positionId} label={fmtPos(p.positionId)} value={`${Math.round(p.secs)}s`} dim right />
            ))}
            {oppAttacks.length > 0 && (
              <div className="pt-2 mt-1 border-t border-border/20 space-y-1.5">
                <p className="text-[7px] font-black uppercase tracking-[0.25em] text-muted-foreground/30 text-right">Attacks</p>
                {oppAttacks.slice(0, 3).map(a => (
                  <p key={a.label} className="text-[11px] text-foreground/70 text-right">
                    <span className="text-[9px] mr-1 text-muted-foreground/35">×{a.count}</span>
                    <span className="font-semibold">{a.label}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border/30 grid grid-cols-[1fr_1px_1fr]">
          <Link
            href={`/upload?context=own&back=/tournaments/${tournamentId}/fight-card/${opponentId}`}
            className="px-5 py-3 text-xs text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/[0.04] transition-colors font-medium"
          >
            + Add your footage
          </Link>
          <div className="bg-border/30" />
          <Link
            href={`/tournaments/${tournamentId}/opponents`}
            className="px-5 py-3 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/[0.04] transition-colors font-medium text-right"
          >
            + Scout footage →
          </Link>
        </div>
      </div>

      {/* ── Gameplan ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="border-b border-border/40 px-5 py-3 flex items-center justify-between gap-3">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/40">Gameplan</p>
          {plan ? (
            <Link
              href={`/tournaments/${tournamentId}/gameplan?opponent=${opponentId}&back=/tournaments/${tournamentId}/fight-card/${opponentId}`}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Full gameplan →
            </Link>
          ) : !isGenerating ? (
            <Link
              href={`/tournaments/${tournamentId}/gameplan?opponent=${opponentId}&back=/tournaments/${tournamentId}/fight-card/${opponentId}`}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Full view →
            </Link>
          ) : null}
        </div>

        {isGenerating ? (
          <div className="px-5 py-6 flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <p className="text-sm text-muted-foreground">Generating gameplan…</p>
          </div>
        ) : plan && card ? (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border-l-2 border-emerald-500 bg-emerald-500/[0.06] px-4 py-3 space-y-1">
                <p className="text-[8px] font-black uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-500">Open with</p>
                <p className="text-sm font-bold leading-snug">{card.open_with}</p>
              </div>
              <div className="rounded-xl border-l-2 border-rose-500 bg-rose-500/[0.06] px-4 py-3 space-y-1">
                <p className="text-[8px] font-black uppercase tracking-[0.22em] text-rose-600 dark:text-rose-400">Watch out</p>
                <p className="text-sm font-bold leading-snug text-rose-700 dark:text-rose-300">{card.watch_out}</p>
              </div>
            </div>

            {card.attack_chain.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/35 mr-1">Attack chain</p>
                {card.attack_chain.slice(0, 4).map((step, i, arr) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold bg-foreground/[0.06] border border-border/40 px-2.5 py-1 rounded-lg">
                      {step}
                    </span>
                    {i < arr.length - 1 && (
                      <svg className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M2 6h8M7 3l3 3-3 3" />
                      </svg>
                    )}
                  </span>
                ))}
              </div>
            )}

            {card.if_losing_points && (
              <div className="flex gap-2 items-start border-t border-border/30 pt-3">
                <span className="text-[8px] font-black uppercase tracking-[0.18em] text-amber-500/70 whitespace-nowrap flex-shrink-0 pt-px">If losing</span>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">{card.if_losing_points}</p>
              </div>
            )}
          </div>
        ) : scoutedMatches.length > 0 ? (
          <div className="px-5 py-5 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {scoutedMatches.length} match{scoutedMatches.length !== 1 ? 'es' : ''} scouted — ready to generate
            </p>
            <GenerateGameplanButton tournamentId={tournamentId} opponentId={opponentId} />
          </div>
        ) : (
          <div className="px-5 py-5">
            <p className="text-sm text-muted-foreground/60">Scout footage first to generate a gameplan.</p>
          </div>
        )}
      </div>

      {/* Back */}
      <div>
        <Link
          href={`/tournaments/${tournamentId}/opponents`}
          className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          ← All opponents
        </Link>
      </div>
    </div>
  )
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  right = false,
  dim = false,
  accent,
}: {
  label: string
  value: string
  right?: boolean
  dim?: boolean
  accent?: 'emerald' | 'rose'
}) {
  const valueClass = dim
    ? 'text-muted-foreground/45'
    : accent === 'emerald'
      ? 'text-emerald-400'
      : accent === 'rose'
        ? 'text-rose-400'
        : 'text-foreground/85'

  return (
    <div className={`flex items-baseline gap-2 ${right ? 'flex-row-reverse' : ''}`}>
      <span className={`text-xs font-bold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground/35 leading-none">{label}</span>
    </div>
  )
}
