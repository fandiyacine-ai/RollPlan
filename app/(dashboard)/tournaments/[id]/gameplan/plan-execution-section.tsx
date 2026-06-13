'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchOwnMatches, linkMatchToGameplan, unlinkMatchFromGameplan, fetchExecutionDebrief, type OwnMatch } from './plan-execution-actions'
import type { ExecutionDebrief } from '../../../../../lib/ai/schemas/execution-debrief'

function resultLabel(m: OwnMatch): string {
  if (!m.resultWinner) return 'No result'
  const isWin = m.resultWinner === 'user'
  if (m.resultMethod === 'submission') return isWin ? `Won — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}` : `Lost — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}`
  if (m.resultMethod === 'points') return isWin ? 'Won — Points' : 'Lost — Points'
  if (m.resultMethod === 'walkover') return isWin ? 'Won — Walkover' : 'Lost — Walkover'
  return isWin ? 'Won' : 'Lost'
}

const VERDICT_CONFIG = {
  executed_well:       { label: 'Executed well',       colour: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40' },
  partially_executed:  { label: 'Partially executed',  colour: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40' },
  not_executed:        { label: 'Not executed',         colour: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40' },
  insufficient_data:   { label: 'Insufficient data',   colour: 'text-zinc-500 bg-muted border-border' },
}

const EXECUTION_LABEL = { yes: 'Executed', partial: 'Partial', no: 'Not executed' } as const
const EXECUTION_COLOUR = {
  yes:     'text-blue-600 dark:text-blue-400',
  partial: 'text-amber-600 dark:text-amber-400',
  no:      'text-rose-500 dark:text-rose-400',
} as const

function DebriefDisplay({ debrief }: { debrief: ExecutionDebrief }) {
  const verdict = VERDICT_CONFIG[debrief.verdict]
  return (
    <div className="space-y-4">
      {/* Verdict + summary */}
      <div className="space-y-2">
        <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${verdict.colour}`}>
          {verdict.label}
        </span>
        <p className="text-sm text-foreground/80 leading-relaxed">{debrief.summary}</p>
      </div>

      {/* Opening + primary chain comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: 'Opening', data: debrief.opening },
          { label: 'Primary chain', data: debrief.primary_chain },
        ].map(({ label, data }) => (
          <div key={label} className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Planned: </span>{data.planned}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Actual: </span>{data.what_happened}
            </p>
            <p className={`text-[11px] font-semibold ${EXECUTION_COLOUR[data.execution]}`}>
              {EXECUTION_LABEL[data.execution]}
            </p>
          </div>
        ))}
      </div>

      {/* What worked / What to improve */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            What worked
          </p>
          <ul className="space-y-1">
            {debrief.what_worked.map((item, i) => (
              <li key={i} className="text-xs text-foreground/80 leading-snug">{item}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
            What to improve
          </p>
          <ul className="space-y-1">
            {debrief.what_to_improve.map((item, i) => (
              <li key={i} className="text-xs text-foreground/80 leading-snug">{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Key learnings */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Key learnings</p>
        <ul className="space-y-1">
          {debrief.key_learnings.map((item, i) => (
            <li key={i} className="text-xs text-foreground/80 leading-snug flex items-start gap-2">
              <span className="text-muted-foreground/40 flex-shrink-0 mt-0.5">→</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function PlanExecutionSection({
  gameplanId,
  linkedMatchId,
  initialDebrief,
}: {
  gameplanId: string
  linkedMatchId: string | null
  initialDebrief: ExecutionDebrief | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [ownMatches, setOwnMatches] = useState<OwnMatch[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [debrief, setDebrief] = useState<ExecutionDebrief | null>(initialDebrief)

  const isGeneratingDebrief = linkedMatchId !== null && debrief === null

  // Poll every 5s while debrief is generating
  useEffect(() => {
    if (!isGeneratingDebrief) return
    const interval = setInterval(async () => {
      const result = await fetchExecutionDebrief(gameplanId)
      if (result) {
        setDebrief(result)
        clearInterval(interval)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [isGeneratingDebrief, gameplanId])

  async function handleOpenPicker() {
    setOpen(true)
    if (!ownMatches) {
      setLoading(true)
      const ms = await fetchOwnMatches()
      setOwnMatches(ms)
      setLoading(false)
    }
  }

  async function handleLink(matchId: string) {
    setPending(true)
    setDebrief(null)  // reset while new debrief generates
    await linkMatchToGameplan(gameplanId, matchId)
    setOpen(false)
    router.refresh()
    setPending(false)
  }

  async function handleUnlink() {
    setPending(true)
    setDebrief(null)
    await unlinkMatchFromGameplan(gameplanId)
    router.refresh()
    setPending(false)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Post-match review</p>
        {linkedMatchId && (
          <div className="flex items-center gap-3">
            <a
              href={`/matches/${linkedMatchId}`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              View match
            </a>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={pending}
              className="text-xs text-muted-foreground hover:text-rose-400 transition-colors disabled:opacity-50"
            >
              Unlink
            </button>
          </div>
        )}
      </div>

      {linkedMatchId ? (
        <>
          {isGeneratingDebrief ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Generating debrief…
            </div>
          ) : debrief ? (
            <DebriefDisplay debrief={debrief} />
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Link one of your own analysed matches to get a structured "Did the plan work?" debrief.
          </p>
          {!open && (
            <button
              type="button"
              onClick={handleOpenPicker}
              className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Link my match result
            </button>
          )}
        </>
      )}

      {open && !linkedMatchId && (
        <div className="space-y-2">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {ownMatches && ownMatches.length === 0 && (
            <p className="text-xs text-muted-foreground">No analysed matches found yet.</p>
          )}
          {ownMatches && ownMatches.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {ownMatches.map(m => (
                <button
                  key={m.id}
                  type="button"
                  disabled={pending}
                  onClick={() => handleLink(m.id)}
                  className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <span className="text-sm font-medium truncate">vs. {m.opponentLabel}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{resultLabel(m)}</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
