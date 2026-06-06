'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AddOpponentForm, ScoutForm } from './opponent-forms'
import { ImportBracketDialog } from './import-bracket-dialog'
import { SyncBracketButton } from './sync-bracket-button'

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchCard = {
  headline: string
  open_with: string
  attack_chain: string[]
  watch_out: string
  if_losing_points?: string
}

export type UserCardData = {
  ownTotal: number
  ownWins: number
  userTopPct: number | null
  topPositions: { positionId: string; secs: number }[]
  attacks: { label: string; count: number }[]
}

export type OpponentRow = {
  id: string
  opponentLabel: string
  profilePhotoUrl: string | null
  ajpWins: number | null
  ajpLosses: number | null
  ajpProfileUrl: string | null
  smoothcompWins: number | null
  smoothcompLosses: number | null
  smoothcompProfileUrl: string | null
  ibjjfBestResult: string | null
  footageStatus: string
  intelStatus: string | null
  scoutedMatchCount: number
  scoutedMatches: { id: string; label: string | null }[]
  topPositions: { positionId: string; secs: number }[]
  attacks: { label: string; count: number }[]
  topPct: number | null
  gameplanVerdict: string | null
  winProbability: number | null
  card: MatchCard | null
  gameplanStatus: string | null
  hasGameplan: boolean
  communityMatchCount: number
  hasFootage: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const POSITION_LABEL: Record<string, string> = {
  closed_guard: 'Closed guard', half_guard: 'Half guard', open_guard: 'Open guard',
  butterfly_guard: 'Butterfly', back_control: 'Back control', mount: 'Mount',
  side_control: 'Side control', turtle: 'Turtle', north_south: 'N/S',
  knee_on_belly: 'Knee on belly', standing: 'Standing', x_guard: 'X-guard',
  deep_half: 'Deep half', fifty_fifty: '50/50', single_leg_x: 'SLX',
  de_la_riva: 'De La Riva', reverse_de_la_riva: 'RDLR',
}
function fmtPos(id: string) { return POSITION_LABEL[id] ?? id.replace(/_/g, ' ') }
function careerRecord(w: number | null | undefined, l: number | null | undefined) {
  if (w == null && l == null) return null
  return `${w ?? 0}W ${l ?? 0}L`
}

// ── GameStyleBar ──────────────────────────────────────────────────────────────

function GameStyleBar({ topPct, right = false }: { topPct: number; right?: boolean }) {
  const label = topPct >= 65 ? 'Top player' : topPct >= 50 ? 'Balanced' : topPct >= 35 ? 'Guard-heavy' : 'Guard player'
  const fillClass = right ? 'bg-red-500/60' : 'bg-emerald-500/60'
  const bgClass = right ? 'bg-red-500/[0.12]' : 'bg-emerald-500/[0.12]'
  const labelClass = right ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/55">Game style</span>
        <span className={`text-[11px] font-bold ${labelClass}`}>{label}</span>
      </div>
      <div className={`h-2 w-full rounded-full ${bgClass} overflow-hidden`}>
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${topPct}%` }} />
      </div>
    </div>
  )
}

// ── VerdictBadge ──────────────────────────────────────────────────────────────

function VerdictBadge({ verdict, winProbability }: { verdict: string | null; winProbability: number | null }) {
  if (!verdict) return null
  const cfg = {
    favourable: { bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', label: 'Favourable' },
    neutral:    { bg: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400', label: 'Neutral' },
    tough:      { bg: 'bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400', label: 'Tough match' },
  }[verdict] ?? { bg: 'bg-zinc-500/15 border-zinc-500/30 text-zinc-500', label: verdict }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg}`}>
      {cfg.label}
      {winProbability != null && <span className="opacity-70">· {winProbability}%</span>}
    </span>
  )
}

// ── UserCard ──────────────────────────────────────────────────────────────────

function UserCard({ userName, data }: { userName: string; data: UserCardData }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-border shadow-lg bg-zinc-100 dark:bg-zinc-900">
      {/* Green accent top strip */}
      <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-emerald-600" />

      <div className="p-4 space-y-4">
        {/* Identity */}
        <div>
          <p className="text-[7px] font-black uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400/70 mb-1.5">You</p>
          <p className="font-black text-2xl uppercase leading-tight tracking-wide text-foreground break-words">
            {userName}
          </p>
          {data.ownTotal > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{data.ownWins}W</span>
              <span className="text-sm font-bold text-foreground/40">{data.ownTotal - data.ownWins}L</span>
              <span className="text-[9px] text-foreground/30 uppercase tracking-wider">on RollPlan</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Game style */}
        {data.userTopPct != null && (
          <GameStyleBar topPct={data.userTopPct} />
        )}

        {/* Top positions */}
        {data.topPositions.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-foreground/40">Dominates from</p>
            {data.topPositions.slice(0, 3).map(p => (
              <p key={p.positionId} className="text-xs text-foreground/60 font-medium">{fmtPos(p.positionId)}</p>
            ))}
          </div>
        )}

        {/* Attacks */}
        {data.attacks.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-foreground/40">Key attacks</p>
            {data.attacks.slice(0, 3).map(a => (
              <p key={a.label} className="text-xs">
                <span className="font-semibold text-foreground/70">{a.label}</span>
                <span className="text-foreground/40 ml-1">×{a.count}</span>
              </p>
            ))}
          </div>
        )}

        {data.ownTotal === 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-foreground/40 italic leading-snug">Upload your own footage to build your player card</p>
            <Link
              href="/upload?context=own"
              className="block text-center text-[10px] font-semibold px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors"
            >
              + Add your footage
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}


// ── OpponentSection ───────────────────────────────────────────────────────────

function OpponentSection({ opp, tournamentId }: { opp: OpponentRow; tournamentId: string }) {
  const ajpRecord = careerRecord(opp.ajpWins, opp.ajpLosses)
  const scRecord = careerRecord(opp.smoothcompWins, opp.smoothcompLosses)
  const hasStats = opp.scoutedMatchCount > 0
  const isScanning = opp.footageStatus === 'pending' || opp.footageStatus === 'auto_queued'
  const backParam = encodeURIComponent(`/tournaments/${tournamentId}/opponents`)

  return (
    <div className="rounded-2xl overflow-hidden border border-border shadow-sm">

      {/* Red accent top strip */}
      <div className="h-1 w-full bg-gradient-to-r from-red-600 to-red-700" />

      {/* Opponent header */}
      <div className="bg-zinc-100 dark:bg-zinc-900 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[7px] font-black uppercase tracking-[0.35em] text-red-600 dark:text-red-500/80 mb-1.5">Opponent</p>
            <div className="flex items-center gap-3 min-w-0">
              {opp.profilePhotoUrl && (
                <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-red-500/30 flex-shrink-0">
                  <Image src={opp.profilePhotoUrl} alt={opp.opponentLabel} width={36} height={36} className="object-cover w-full h-full" />
                </div>
              )}
              <p className="font-black text-2xl uppercase leading-tight tracking-wide text-foreground break-words">
                {opp.opponentLabel}
              </p>
            </div>
            {/* Records row */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {ajpRecord && (
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] text-foreground/40 uppercase tracking-wider font-bold">AJP</span>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">{ajpRecord.split(' ')[0]}</span>
                  <span className="text-xs font-bold text-foreground/40">{ajpRecord.split(' ')[1]}</span>
                </span>
              )}
              {scRecord && (
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] text-foreground/40 uppercase tracking-wider font-bold">SC</span>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">{scRecord.split(' ')[0]}</span>
                  <span className="text-xs font-bold text-foreground/40">{scRecord.split(' ')[1]}</span>
                </span>
              )}
              {opp.ibjjfBestResult && (
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] text-foreground/40 uppercase tracking-wider font-bold">IBJJF</span>
                  <span className="text-[11px] text-foreground/50">{opp.ibjjfBestResult.split('|')[0]?.trim()}</span>
                </span>
              )}
              {opp.communityMatchCount > 0 && (
                <span className="text-[9px] text-violet-600 dark:text-violet-400/70 font-medium">{opp.communityMatchCount} community match{opp.communityMatchCount !== 1 ? 'es' : ''}</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-1">
            {/* Scouting links — one per match */}
            {hasStats && opp.scoutedMatches.length > 0 && (
              <div className="flex flex-col items-end gap-1">
                {opp.scoutedMatches.map(m => (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}?back=${backParam}`}
                    className="text-xs text-foreground/40 hover:text-foreground/80 transition-colors font-medium whitespace-nowrap"
                  >
                    {m.label ? `vs ${m.label} ↗` : 'View scouting ↗'}
                  </Link>
                ))}
              </div>
            )}
            <Link
              href={`/tournaments/${tournamentId}/fight-card/${opp.id}`}
              className="text-xs text-red-500/60 hover:text-red-600 transition-colors font-medium whitespace-nowrap"
            >
              Fight card →
            </Link>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="bg-card">
        {isScanning ? (
          <div className="px-5 py-4 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <p className="text-sm text-muted-foreground">Searching for footage…</p>
          </div>
        ) : hasStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/30">

            {/* Left: game stats */}
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 dark:text-red-400/80">Their game</p>

              {opp.topPct != null && <GameStyleBar topPct={opp.topPct} right />}

              {opp.topPositions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/55">Dominates from</p>
                  {opp.topPositions.slice(0, 3).map(p => (
                    <p key={p.positionId} className="text-xs text-foreground/70 font-medium">{fmtPos(p.positionId)}</p>
                  ))}
                </div>
              )}

              {opp.attacks.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/55">Key attacks</p>
                  {opp.attacks.slice(0, 3).map(a => (
                    <p key={a.label} className="text-xs">
                      <span className="font-semibold text-foreground/80">{a.label}</span>
                      <span className="text-muted-foreground/55 ml-1">×{a.count}</span>
                    </p>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/40">
                {opp.scoutedMatchCount} match{opp.scoutedMatchCount !== 1 ? 'es' : ''} scouted
              </p>
            </div>

            {/* Right: gameplan */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Gameplan</p>
                {(opp.gameplanVerdict || opp.winProbability) && (
                  <VerdictBadge verdict={opp.gameplanVerdict} winProbability={opp.winProbability} />
                )}
              </div>

              {opp.gameplanStatus === 'generating' ? (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-sm text-muted-foreground">Generating…</p>
                </div>
              ) : opp.card ? (
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-500">Open with</p>
                    <p className="text-xs font-semibold leading-snug">{opp.card.open_with}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-red-600 dark:text-red-400">Watch out</p>
                    <p className="text-xs font-semibold leading-snug text-red-700 dark:text-red-300">{opp.card.watch_out}</p>
                  </div>
                  {opp.card.attack_chain.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {opp.card.attack_chain.slice(0, 3).map((step, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold bg-foreground/[0.06] border border-border/40 px-2 py-0.5 rounded">
                            {step}
                          </span>
                          {i < arr.length - 1 && (
                            <svg className="w-2 h-2 text-muted-foreground/30 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M2 6h8M7 3l3 3-3 3" />
                            </svg>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <Link
                    href={`/tournaments/${tournamentId}/gameplan?opponent=${opp.id}`}
                    className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    Full gameplan →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground/60">
                    {opp.scoutedMatchCount > 0 ? 'Ready to generate' : 'Scout footage to generate a gameplan'}
                  </p>
                  {opp.scoutedMatchCount > 0 && (
                    <Link
                      href={`/tournaments/${tournamentId}/gameplan?opponent=${opp.id}`}
                      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-foreground/[0.06] border border-border/50 text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors"
                    >
                      Generate gameplan
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* No footage yet */
          <div className="p-5 space-y-5">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground/60">No footage scouted yet.</p>
              <ScoutForm opponentId={opp.id} tournamentId={tournamentId} opponentName={opp.opponentLabel} hasMatches={false} />
            </div>

            {/* Fight card teaser — fills the space and surfaces the fight card */}
            <div className="rounded-xl border border-red-500/15 bg-red-500/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Fight card</p>
                <Link
                  href={`/tournaments/${tournamentId}/fight-card/${opp.id}`}
                  className="text-xs text-red-500/60 hover:text-red-600 dark:hover:text-red-400 transition-colors font-medium"
                >
                  View →
                </Link>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ajpRecord && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">AJP record</p>
                    <p className="text-sm font-bold">
                      <span className="text-red-500">{opp.ajpWins ?? 0}W</span>
                      <span className="text-foreground/30 ml-1">{opp.ajpLosses ?? 0}L</span>
                    </p>
                  </div>
                )}
                {(opp.smoothcompWins != null || opp.smoothcompLosses != null) && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Smoothcomp</p>
                    <p className="text-sm font-bold">
                      <span className="text-red-500">{opp.smoothcompWins ?? 0}W</span>
                      <span className="text-foreground/30 ml-1">{opp.smoothcompLosses ?? 0}L</span>
                    </p>
                  </div>
                )}
                {opp.ibjjfBestResult && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">IBJJF best</p>
                    <p className="text-xs font-semibold text-foreground/60">{opp.ibjjfBestResult.split('|')[0]?.trim()}</p>
                  </div>
                )}
                {opp.communityMatchCount > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Community</p>
                    <p className="text-xs font-semibold text-violet-500">{opp.communityMatchCount} match{opp.communityMatchCount !== 1 ? 'es' : ''}</p>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
                Side-by-side records, position tendencies, and a match-day reference card — even without scouted footage.
              </p>
            </div>
          </div>
        )}

        {/* Footer — scout more button only */}
        {hasStats && (
          <div className="px-5 py-3 border-t border-border/30">
            <ScoutForm opponentId={opp.id} tournamentId={tournamentId} opponentName={opp.opponentLabel} hasMatches />
          </div>
        )}
      </div>
    </div>
  )
}

// ── TournamentFightView ───────────────────────────────────────────────────────

export function TournamentFightView({
  userName,
  tournamentId,
  userData,
  opponents,
  smoothcompUrl,
  userSmootcompAthleteId,
}: {
  userName: string
  tournamentId: string
  userData: UserCardData
  opponents: OpponentRow[]
  smoothcompUrl: string | null
  userSmootcompAthleteId: string | null | undefined
}) {
  return (
    <div>
      {/* Management header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {opponents.length} opponent{opponents.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          {smoothcompUrl?.includes('/bracket/') && opponents.length > 0 && (
            <SyncBracketButton tournamentId={tournamentId} />
          )}
          <ImportBracketDialog
            tournamentId={tournamentId}
            hasBracketUrl={!!smoothcompUrl?.includes('/bracket/')}
            userSmootcompAthleteId={userSmootcompAthleteId ?? null}
          />
          <AddOpponentForm tournamentId={tournamentId} />
        </div>
      </div>

      {/* Desktop: entire two-column block is sticky so both columns share the same top edge */}
      <div className="hidden md:flex gap-5 items-start sticky top-20">

        {/* User card — left, no sticky needed since parent block is sticky */}
        <div className="w-[220px] flex-shrink-0">
          <UserCard userName={userName} data={userData} />

          {/* Jump nav */}
          {opponents.length > 1 && (
            <nav className="mt-3 space-y-0.5">
              {opponents.map((opp, i) => (
                <a
                  key={opp.id}
                  href={`#opp-${opp.id}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors group"
                >
                  <span className="text-[9px] font-mono text-muted-foreground/30 w-3 flex-shrink-0">{i + 1}</span>
                  <span className="truncate font-medium">{opp.opponentLabel}</span>
                  {opp.gameplanVerdict && (
                    <span className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      opp.gameplanVerdict === 'favourable' ? 'bg-emerald-400' :
                      opp.gameplanVerdict === 'tough' ? 'bg-rose-400' : 'bg-amber-400'
                    }`} />
                  )}
                </a>
              ))}
            </nav>
          )}
        </div>

        {/* Opponent sections — scroll container fills remaining viewport height below the sticky offset */}
        <div
          className="flex-1 min-w-0 overflow-y-auto snap-y snap-mandatory"
          style={{ height: 'calc(100vh - 100px)' }}
        >
          {opponents.map(opp => (
            <div key={opp.id} id={`opp-${opp.id}`} className="snap-start snap-always pb-6" style={{ minHeight: 'calc(100vh - 100px)' }}>
              <OpponentSection opp={opp} tournamentId={tournamentId} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: stacked */}
      <div className="md:hidden space-y-4">

        {/* Mobile jump nav — only when >1 opponent */}
        {opponents.length > 1 && (
          <div className="sticky top-14 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur-sm border-b border-border/40 overflow-x-auto no-scrollbar">
            <div className="flex gap-1.5 w-max">
              {opponents.map((opp, i) => (
                <a
                  key={opp.id}
                  href={`#opp-mobile-${opp.id}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-muted/40 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                >
                  <span className="text-[9px] font-mono text-muted-foreground/40">{i + 1}</span>
                  <span className="font-medium">{opp.opponentLabel.split(' ')[0]}</span>
                  {opp.gameplanVerdict && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      opp.gameplanVerdict === 'favourable' ? 'bg-emerald-400' :
                      opp.gameplanVerdict === 'tough' ? 'bg-rose-400' : 'bg-amber-400'
                    }`} />
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Condensed user banner */}
        <div className="rounded-xl overflow-hidden border border-border bg-zinc-100 dark:bg-zinc-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[7px] font-black uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400/60 mb-1">You</p>
              <p className="font-black text-xl uppercase leading-tight text-foreground">{userName}</p>
              {userData.ownTotal > 0 && (
                <p className="text-xs mt-1">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{userData.ownWins}W</span>
                  <span className="text-foreground/40 font-bold ml-1">{userData.ownTotal - userData.ownWins}L</span>
                  <span className="text-foreground/30 ml-1 text-[9px] uppercase">on RollPlan</span>
                </p>
              )}
            </div>
            {userData.userTopPct != null && (
              <div className="w-24 flex-shrink-0">
                <GameStyleBar topPct={userData.userTopPct} />
              </div>
            )}
          </div>
        </div>

        {opponents.map(opp => (
          <div key={opp.id} id={`opp-mobile-${opp.id}`} className="scroll-mt-28">
            <OpponentSection opp={opp} tournamentId={tournamentId} />
          </div>
        ))}
      </div>
    </div>
  )
}
