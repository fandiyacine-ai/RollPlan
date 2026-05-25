'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ScoutForm, DeleteOpponentButton, EditOpponentButton, RescanVideoButton, RetriggerIntelButton } from './opponent-forms'
import { importCommunityFootage, saveOpponentResult } from './actions'

type FootageRow = {
  id: string
  rowType?: 'video' | 'match'
  status: string
  format: string | null
  context: string | null
  eventName: string | null
  opponentLabel?: string | null
  label?: string
  createdAt: Date
  resultWinner: string | null
  resultMethod: string | null
  resultTechnique: string | null
  failureReason: string | null
  chunksDone?: number | null
  chunksTotal?: number | null
  chunksFailed?: number | null
}

type Opponent = {
  id: string
  opponentLabel: string
  seedingNotes: string | null
  footageStatus: string
  userResult: string | null
  userResultMethod: string | null
  ajpWins: number | null
  ajpLosses: number | null
  ajpProfileUrl: string | null
  smoothcompWins: number | null
  smoothcompLosses: number | null
  smoothcompFedUrl: string | null
  ibjjfWins: number | null
  ibjjfLosses: number | null
  ibjjfProfileUrl: string | null
  ibjjfBestResult: string | null
}

const PLATFORM_BADGE_CLASS: Record<string, string> = {
  AJP:        'bg-orange-900/70 text-orange-300 border-orange-700/50',
  Smoothcomp: 'bg-sky-900/70 text-sky-300 border-sky-700/50',
  IBJJF:      'bg-violet-900/70 text-violet-300 border-violet-700/50',
}

function PlatformBadge({ label }: { label: string }) {
  const cls = PLATFORM_BADGE_CLASS[label] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700/30'
  return <span className={`text-[9px] font-bold px-1 py-px rounded border flex-shrink-0 ${cls}`}>{label}</span>
}

function WLBadge({ label, wins, losses, url }: { label: string; wins: number; losses: number; url: string | null }) {
  const total = wins + losses
  const winPct = total > 0 ? (wins / total) * 100 : 0
  const content = (
    <span className="flex items-center gap-1.5">
      <PlatformBadge label={label} />
      <span className="text-[11px] font-mono">
        <span className="text-emerald-400/80">{wins}W</span>
        <span className="text-muted-foreground/30 mx-0.5">/</span>
        <span className="text-rose-400/80">{losses}L</span>
      </span>
      {total > 0 && (
        <span className="w-10 h-1 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
          <span className="h-full bg-emerald-500/60 block" style={{ width: `${winPct}%` }} />
        </span>
      )}
    </span>
  )
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-100 opacity-70 transition-opacity" title={`View ${label} profile`}>
        {content}
      </a>
    )
  }
  return <span className="opacity-60">{content}</span>
}

function ResultBadge({ winner, method, technique }: { winner: string; method: string | null; technique: string | null }) {
  const isWin = winner === 'user'
  const label = method === 'walkover'
    ? (isWin ? 'W — Walkover' : 'L — Walkover')
    : method === 'submission'
    ? (isWin ? `W — Sub${technique ? ` (${technique})` : ''}` : `L — Sub${technique ? ` (${technique})` : ''}`)
    : method === 'points' ? (isWin ? 'W — Points' : 'L — Points')
    : method === 'dq' ? (isWin ? 'W — DQ' : 'L — DQ')
    : isWin ? 'Win' : 'Loss'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
      isWin ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'
    }`}>
      {label}
    </span>
  )
}

const STATUS_CHIP: Record<string, string> = {
  pending:    'bg-zinc-800 text-zinc-400',
  processing: 'bg-blue-950 text-blue-400 border border-blue-800/50',
  analysed:   'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30',
  failed:     'bg-rose-950 text-rose-400 border border-rose-800/50',
  uploaded:   'bg-zinc-800 text-zinc-400',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued', processing: 'Scanning', analysed: 'Ready', failed: 'Failed', uploaded: 'Queued',
}

function rowTitle(m: FootageRow): string {
  // For matches — use opponent name as the primary label
  if (m.opponentLabel) {
    const suffix = m.eventName ? ` · ${m.eventName}` : ''
    return `vs ${m.opponentLabel}${suffix}`
  }
  if (m.eventName) return m.eventName
  // For video-only rows — strip chunk suffix and URL noise
  if (m.label) {
    const clean = m.label.replace(/\s*·\s*Part\s+\d+\/\d+$/, '').trim()
    // If it looks like a URL, show a clean placeholder
    if (/^https?:\/\//.test(clean)) {
      try {
        const u = new URL(clean)
        if (u.hostname.includes('youtube') || u.hostname.includes('youtu.be')) return 'YouTube video'
        return u.hostname
      } catch { return 'Video link' }
    }
    return clean || m.label
  }
  const fmt = m.format === 'no_gi' ? 'No-Gi' : 'Gi'
  const ctx = m.context === 'sparring' ? 'Sparring' : 'Competition'
  return `${fmt} ${ctx}`
}

function OpponentResultWidget({
  opponentId,
  tournamentId,
  userResult,
  userResultMethod,
}: {
  opponentId: string
  tournamentId: string
  userResult: string | null
  userResultMethod: string | null
}) {
  const [pending, setPending] = useState(false)
  const [localResult, setLocalResult] = useState<string | null>(userResult)
  const [localMethod, setLocalMethod] = useState<string | null>(userResultMethod)
  const [showMethodPicker, setShowMethodPicker] = useState(false)
  const [pendingResult, setPendingResult] = useState<'win' | 'loss' | null>(null)

  const methods = [
    { value: 'submission', label: 'Submission' },
    { value: 'points', label: 'Points' },
    { value: 'dq', label: 'DQ' },
    { value: 'walkover', label: 'Walkover' },
  ]

  async function pick(result: 'win' | 'loss' | null, method: string | null = null) {
    setPending(true)
    await saveOpponentResult(opponentId, tournamentId, result, method)
    setLocalResult(result)
    setLocalMethod(method)
    setShowMethodPicker(false)
    setPendingResult(null)
    setPending(false)
  }

  function handleResultClick(result: 'win' | 'loss') {
    if (localResult === result) {
      // Clear the result
      pick(null, null)
    } else {
      setPendingResult(result)
      setShowMethodPicker(true)
    }
  }

  const resultLabel = localResult === 'win'
    ? (localMethod === 'submission' ? 'W — Sub' : localMethod === 'points' ? 'W — Pts' : localMethod === 'dq' ? 'W — DQ' : localMethod === 'walkover' ? 'W — WO' : 'Win')
    : localResult === 'loss'
    ? (localMethod === 'submission' ? 'L — Sub' : localMethod === 'points' ? 'L — Pts' : localMethod === 'dq' ? 'L — DQ' : localMethod === 'walkover' ? 'L — WO' : 'Loss')
    : null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Your result:</span>
      {localResult ? (
        <>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            localResult === 'win'
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/30'
              : 'bg-rose-950/60 text-rose-400 border-rose-800/30'
          }`}>
            {resultLabel}
          </span>
          <button
            onClick={() => pick(null, null)}
            disabled={pending}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-40"
          >
            clear
          </button>
        </>
      ) : showMethodPicker ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground/70">How?</span>
          {methods.map(m => (
            <button
              key={m.value}
              onClick={() => pick(pendingResult!, m.value)}
              disabled={pending}
              className="text-[10px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-40"
            >
              {m.label}
            </button>
          ))}
          <button
            onClick={() => pick(pendingResult!, null)}
            disabled={pending}
            className="text-[10px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-40"
          >
            Skip
          </button>
          <button
            onClick={() => { setShowMethodPicker(false); setPendingResult(null) }}
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleResultClick('win')}
            disabled={pending}
            className="text-[10px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:border-emerald-600 hover:text-emerald-400 transition-colors disabled:opacity-40"
          >
            Won
          </button>
          <button
            onClick={() => handleResultClick('loss')}
            disabled={pending}
            className="text-[10px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:border-rose-600 hover:text-rose-400 transition-colors disabled:opacity-40"
          >
            Lost
          </button>
        </div>
      )}
    </div>
  )
}

const CHUNK_LABEL_RE = /·\s*Part\s+(\d+)\/(\d+)$/

function detectChunks(pendingVideos: FootageRow[]): { done: number; total: number } | null {
  let total = 0
  let remaining = 0
  for (const v of pendingVideos) {
    const m = v.label?.match(CHUNK_LABEL_RE)
    if (m) {
      total = Math.max(total, parseInt(m[2]))
      remaining++
    }
  }
  return total > 0 ? { done: total - remaining, total } : null
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normaliseStatus(s: string): string {
  return s === 'uploaded' ? 'pending' : s
}

export function OpponentAccordion({
  opponent,
  matches,
  pendingVideos,
  tournamentId,
  communityMatchCount = 0,
  eventDatePassed = false,
}: {
  opponent: Opponent
  matches: FootageRow[]
  pendingVideos: FootageRow[]
  tournamentId: string
  communityMatchCount?: number
  eventDatePassed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [importing, startImport] = useTransition()
  const [importDone, setImportDone] = useState(false)

  const allRows = [...pendingVideos, ...matches]

  // Chunk progress comes from the parent video row (processing = in flight, failed = scan gave up)
  const chunkingVideo = pendingVideos.find(v => (v.status === 'processing' || v.status === 'failed') && v.chunksTotal)
  const chunkProgress = chunkingVideo?.chunksTotal
    ? { done: chunkingVideo.chunksDone ?? 0, total: chunkingVideo.chunksTotal, failed: chunkingVideo.chunksFailed ?? 0 }
    : null

  const analysed = matches.filter(m => m.status === 'analysed').length
  const pending  = allRows.filter(m => m.status === 'pending' || m.status === 'processing' || m.status === 'uploaded').length
  const failed   = allRows.filter(m => m.status === 'failed').length

  const statusDot = pending > 0
    ? <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
    : analysed > 0
    ? <span className="w-2 h-2 rounded-full bg-emerald-400/60 flex-shrink-0" />
    : <span className="w-2 h-2 rounded-full border border-muted-foreground/30 flex-shrink-0" />

  const { footageStatus } = opponent
  const chunksFailed = chunkProgress?.failed ?? 0
  // Only surface the failure if no successful matches came through — once there's a result
  // the failed parent video is from an old scan attempt and shouldn't pollute the subtitle.
  const allChunksFailed = chunkProgress && chunkProgress.failed > 0 && chunkProgress.done === 0 && analysed === 0

  const subtitle = allChunksFailed
    ? <span className="text-rose-400">{chunkingVideo?.failureReason ?? 'Scan failed — video may be private, age-restricted, or unavailable'}</span>
    : chunkProgress
    ? chunkProgress.done === 0
      ? <span className="text-blue-400">Scanning — splitting into {chunkProgress.total} parts…</span>
      : <><span className="text-blue-400">{chunkProgress.done}/{chunkProgress.total} parts scanned{chunksFailed > 0 ? ` (${chunksFailed} failed)` : ''}</span>{analysed > 0 ? ` · ${analysed} match${analysed !== 1 ? 'es' : ''} found so far` : ''}</>
    : pending > 0 && analysed === 0
    ? <span className="text-blue-400">Scanning…</span>
    : pending > 0
    ? <><span className="text-blue-400">Scanning</span> · {analysed} match{analysed !== 1 ? 'es' : ''} found so far</>
    : analysed > 0
    ? `${analysed} match${analysed !== 1 ? 'es' : ''} ready${failed > 0 ? ` · ${failed} failed` : ''}`
    : failed > 0
    ? <span className="text-rose-400">{failed} failed</span>
    : footageStatus === 'pending'
    ? <span className="text-muted-foreground/50">Checking for past footage…</span>
    : footageStatus === 'auto_queued'
    ? <span className="text-blue-400">Scanning past competitions…</span>
    : footageStatus === 'no_footage'
    ? <span className="text-muted-foreground/50">No recordings found — paste a link or upload footage</span>
    : footageStatus === 'reused'
    ? <span className="text-muted-foreground/50">Scouted in another tournament — add footage for this event</span>
    : <span className="text-muted-foreground/50">No footage added yet</span>

  const canExpand = allRows.length > 0

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {pending > 0 && !allChunksFailed && (
        <div className="h-0.5 w-full bg-muted overflow-hidden">
          {chunkProgress ? (
            <div
              className="h-full bg-blue-400/70 transition-all duration-700"
              style={{ width: `${chunkProgress.total > 0 ? Math.max(4, (chunkProgress.done / chunkProgress.total) * 100) : 4}%` }}
            />
          ) : (
            <div className="h-full bg-blue-400/60 animate-[shimmer_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
          )}
        </div>
      )}

      <div className="p-4 flex items-center justify-between gap-4">
        {/* Left — clickable to expand */}
        <button
          type="button"
          onClick={() => canExpand && setOpen(o => !o)}
          className={`flex items-center gap-3 min-w-0 flex-1 text-left ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {statusDot}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{opponent.opponentLabel}</p>
              {opponent.userResult && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                  opponent.userResult === 'win'
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/30'
                    : 'bg-rose-950/60 text-rose-400 border-rose-800/30'
                }`}>
                  {opponent.userResult === 'win'
                    ? (opponent.userResultMethod === 'submission' ? 'W — Sub' : opponent.userResultMethod === 'points' ? 'W — Pts' : opponent.userResultMethod === 'dq' ? 'W — DQ' : opponent.userResultMethod === 'walkover' ? 'W — WO' : 'Win')
                    : (opponent.userResultMethod === 'submission' ? 'L — Sub' : opponent.userResultMethod === 'points' ? 'L — Pts' : opponent.userResultMethod === 'dq' ? 'L — DQ' : opponent.userResultMethod === 'walkover' ? 'L — WO' : 'Loss')
                  }
                </span>
              )}
            </div>
            {opponent.seedingNotes && (
              <p className="text-xs text-muted-foreground truncate">{opponent.seedingNotes}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          {canExpand && (
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-muted-foreground/50 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </button>

        {/* Right — actions, never trigger accordion */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {analysed > 0 && (
            <Link
              href={`/tournaments/${tournamentId}/gameplan?opponent=${opponent.id}`}
              className="text-xs px-3 py-1.5 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
            >
              Gameplan →
            </Link>
          )}
          {communityMatchCount > 0 && !importDone && (
            <button
              type="button"
              disabled={importing}
              onClick={() => startImport(async () => {
                await importCommunityFootage(opponent.id, tournamentId)
                setImportDone(true)
              })}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-purple-700/50 bg-purple-950/40 text-purple-300 hover:bg-purple-950/70 transition-colors disabled:opacity-50"
              title={`${communityMatchCount} community analysis${communityMatchCount !== 1 ? 'es' : ''} available`}
            >
              {importing ? (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              )}
              {communityMatchCount} community
            </button>
          )}
          {importDone && (
            <span className="text-xs text-emerald-400 px-2">✓ Imported</span>
          )}
          {/* Hide scout form when auto-discovery is actively queued with no results yet */}
          {footageStatus !== 'pending' && !(footageStatus === 'auto_queued' && allRows.length === 0) && (
            <ScoutForm
              tournamentId={tournamentId}
              opponentId={opponent.id}
              opponentName={opponent.opponentLabel}
              hasMatches={analysed > 0}
            />
          )}
          <EditOpponentButton
            opponentId={opponent.id}
            tournamentId={tournamentId}
            currentName={opponent.opponentLabel}
            currentNotes={opponent.seedingNotes}
          />
          <DeleteOpponentButton opponentId={opponent.id} tournamentId={tournamentId} />
        </div>
      </div>

      {/* Footage list */}
      {open && allRows.length > 0 && (
        <div className="border-t border-border/40 divide-y divide-border/30">
          {allRows.map((m) => {
            const ns = normaliseStatus(m.status)
            return (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CHIP[ns] ?? STATUS_CHIP.pending}`}>
                    {STATUS_LABEL[ns] ?? m.status}
                  </span>
                  <span className="text-sm truncate">{rowTitle(m)}</span>
                  {m.resultWinner && (
                    <ResultBadge winner={m.resultWinner} method={m.resultMethod} technique={m.resultTechnique} />
                  )}
                  <span className="text-xs text-muted-foreground flex-shrink-0">{fmtDate(m.createdAt)}</span>
                </div>
                {m.status === 'analysed' && (
                  <Link
                    href={`/matches/${m.id}?back=/tournaments/${tournamentId}/opponents`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  >
                    View →
                  </Link>
                )}
                {m.status === 'failed' && (
                  <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                    <span className="text-xs text-rose-400 max-w-xs truncate" title={m.failureReason ?? undefined}>
                      {m.failureReason ?? 'Analysis failed'}
                    </span>
                    {m.rowType === 'video' && (
                      <RescanVideoButton videoId={m.id} tournamentId={tournamentId} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* W/L summary — visible when scout job has run */}
      <div className="px-4 py-2.5 border-t border-border/30 flex items-center gap-4 flex-wrap justify-between">
          {opponent.ajpWins != null ? (
            <WLBadge label="AJP" wins={opponent.ajpWins} losses={opponent.ajpLosses ?? 0} url={opponent.ajpProfileUrl} />
          ) : (
            <span className="flex items-center gap-1.5 opacity-30">
              <PlatformBadge label="AJP" />
              <span className="text-[11px] font-mono text-muted-foreground">N/A</span>
            </span>
          )}
          {opponent.smoothcompWins != null ? (
            <WLBadge label="Smoothcomp" wins={opponent.smoothcompWins} losses={opponent.smoothcompLosses ?? 0} url={opponent.smoothcompFedUrl} />
          ) : (
            <span className="flex items-center gap-1.5 opacity-30">
              <PlatformBadge label="Smoothcomp" />
              <span className="text-[11px] font-mono text-muted-foreground">N/A</span>
            </span>
          )}
          {opponent.ibjjfBestResult != null ? (
            opponent.ibjjfProfileUrl ? (
              <a href={opponent.ibjjfProfileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity" title="View IBJJF profile">
                <PlatformBadge label="IBJJF" />
                <span className="text-[11px] font-mono text-amber-400/80">{opponent.ibjjfBestResult}</span>
              </a>
            ) : (
              <span className="flex items-center gap-1.5 opacity-80">
                <PlatformBadge label="IBJJF" />
                <span className="text-[11px] font-mono text-amber-400/80">{opponent.ibjjfBestResult}</span>
              </span>
            )
          ) : (
            <span className="flex items-center gap-1.5 opacity-30">
              <PlatformBadge label="IBJJF" />
              <span className="text-[11px] font-mono text-muted-foreground">N/A</span>
            </span>
          )}
          <RetriggerIntelButton opponentId={opponent.id} tournamentId={tournamentId} />
        </div>

      {/* Post-event result row — always visible when event date has passed */}
      {eventDatePassed && (
        <div className={`px-4 py-3 flex items-center gap-3 ${allRows.length > 0 || open ? 'border-t border-border/40' : ''}`}>
          <OpponentResultWidget
            opponentId={opponent.id}
            tournamentId={tournamentId}
            userResult={opponent.userResult}
            userResultMethod={opponent.userResultMethod}
          />
        </div>
      )}
    </div>
  )
}
