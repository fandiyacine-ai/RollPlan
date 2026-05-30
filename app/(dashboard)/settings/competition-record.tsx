'use client'

import { useState, useTransition } from 'react'
import { fetchUserIntelAction } from './actions'

const PLATFORM_BADGE: Record<string, string> = {
  AJP:        'bg-orange-900/70 text-orange-300 border-orange-700/50',
  Smoothcomp: 'bg-sky-900/70 text-sky-300 border-sky-700/50',
  IBJJF:      'bg-violet-900/70 text-violet-300 border-violet-700/50',
}

function PBadge({ label }: { label: string }) {
  const cls = PLATFORM_BADGE[label] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700/30'
  return <span className={`text-[9px] font-bold px-1 py-px rounded border flex-shrink-0 ${cls}`}>{label}</span>
}

function WLRow({ label, wins, losses, url }: { label: string; wins: number | null; losses: number | null; url: string | null }) {
  if (wins === null && losses === null) return null
  const inner = (
    <div className="flex items-center gap-2">
      <PBadge label={label} />
      <span className="text-sm tabular-nums">
        <span className="font-bold text-emerald-400">{wins ?? 0}W</span>
        <span className="text-muted-foreground mx-1">–</span>
        <span className="font-bold text-rose-400">{losses ?? 0}L</span>
      </span>
    </div>
  )
  return url ? <a href={url} target="_blank" rel="noopener" className="hover:underline">{inner}</a> : inner
}

function MedalRow({ result, url }: { result: string | null; url: string | null }) {
  if (!result) return null
  const medals = result.split('|').slice(0, 4)
  const MEDAL_COLOR: Record<string, string> = { Gold: 'text-yellow-400', Silver: 'text-zinc-300', Bronze: 'text-amber-600' }
  return (
    <div className="flex items-start gap-2">
      <PBadge label="IBJJF" />
      <div className="space-y-0.5">
        {medals.map((m, i) => {
          const label = m.split(' – ')[0] ?? ''
          const colour = MEDAL_COLOR[label] ?? 'text-muted-foreground'
          const inner = <p key={i} className={`text-xs font-medium ${colour}`}>{m}</p>
          return url ? <a key={i} href={url} target="_blank" rel="noopener" className="hover:underline">{inner}</a> : inner
        })}
      </div>
    </div>
  )
}

export function CompetitionRecordSection({
  ajpWins, ajpLosses, ajpProfileUrl,
  smoothcompWins, smoothcompLosses, smoothcompFedUrl,
  ibjjfBestResult, ibjjfProfileUrl,
  intelStatus,
}: {
  ajpWins: number | null; ajpLosses: number | null; ajpProfileUrl: string | null
  smoothcompWins: number | null; smoothcompLosses: number | null; smoothcompFedUrl: string | null
  ibjjfBestResult: string | null; ibjjfProfileUrl: string | null
  intelStatus: string | null
}) {
  const [, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'queued' | 'error'>(
    intelStatus === 'running' ? 'queued' : 'idle'
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const hasData = ajpWins !== null || smoothcompWins !== null || ibjjfBestResult
  const isRunning = status === 'queued' || intelStatus === 'running'

  function handleFetch() {
    startTransition(async () => {
      setStatus('queued')
      setErrorMsg(null)
      const res = await fetchUserIntelAction()
      if (res.error) {
        setStatus('error')
        setErrorMsg(res.error)
      }
    })
  }

  return (
    <div className="border border-border/60 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Competition Record</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your wins / losses and IBJJF medals pulled from AJP, Smoothcomp, and IBJJF.
          </p>
        </div>
        <button
          onClick={handleFetch}
          disabled={isRunning}
          className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isRunning ? 'Fetching…' : intelStatus === 'done' ? 'Refresh record' : 'Fetch record'}
        </button>
      </div>

      {errorMsg && (
        <p className="text-xs text-rose-400">{errorMsg}</p>
      )}

      {isRunning && !hasData && (
        <p className="text-xs text-muted-foreground/60 animate-pulse">Scanning AJP, Smoothcomp, and IBJJF…</p>
      )}

      {hasData ? (
        <div className="space-y-2.5">
          <WLRow label="AJP" wins={ajpWins} losses={ajpLosses} url={ajpProfileUrl} />
          <WLRow label="Smoothcomp" wins={smoothcompWins} losses={smoothcompLosses} url={smoothcompFedUrl} />
          <MedalRow result={ibjjfBestResult} url={ibjjfProfileUrl} />
        </div>
      ) : intelStatus === 'done' ? (
        <p className="text-xs text-muted-foreground/60">No public record found. If you have a Smoothcomp profile, add the URL above and try again.</p>
      ) : !isRunning ? (
        <p className="text-xs text-muted-foreground/60">Not fetched yet. Click "Fetch record" to pull your competition history.</p>
      ) : null}
    </div>
  )
}
