'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { triggerTrainingPlan, getTrainingPlanStatus } from './actions'
import type { TrainingPlan } from '../../../lib/ai/schemas/training-plan'

const FOCUS_COLORS: Record<string, string> = {
  defence: 'text-rose-400 bg-rose-400/10',
  offence: 'text-emerald-400 bg-emerald-400/10',
  transitions: 'text-amber-400 bg-amber-400/10',
}

function YoutubeLink({ query }: { query: string }) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-rose-500">
        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
      </svg>
      {query}
    </a>
  )
}

export function TrainingPlanSection({
  initialPlan,
  generatedAt,
}: {
  initialPlan: TrainingPlan | null
  generatedAt: Date | null
}) {
  const [state, setState] = useState<'idle' | 'queued' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  // Poll every 3 s while queued; refresh as soon as the plan is ready in DB
  useEffect(() => {
    if (state !== 'queued') return
    let cancelled = false
    const interval = setInterval(async () => {
      const { ready } = await getTrainingPlanStatus()
      if (ready && !cancelled) {
        clearInterval(interval)
        router.refresh()
      }
    }, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [state, router])

  async function handleGenerate() {
    setState('queued')
    setErrorMsg(null)
    const result = await triggerTrainingPlan()
    if (result.error) {
      setState('error')
      setErrorMsg(result.error)
    }
    // Don't router.refresh() immediately — the poll loop above handles it
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-medium text-muted-foreground">Training plan</h2>
          {generatedAt && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Generated {fmtDate(new Date(generatedAt))}
            </p>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={state === 'queued'}
          className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {state === 'queued' ? (
            <>
              <svg className="animate-spin w-2.5 h-2.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Queued…
            </>
          ) : initialPlan ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {state === 'queued' && !initialPlan && (
        <div className="px-4 py-6 text-center space-y-1">
          <p className="text-xs text-muted-foreground">Analysing your matches…</p>
          <p className="text-[10px] text-muted-foreground/60">This takes ~30 seconds. Refresh in a moment.</p>
        </div>
      )}

      {state === 'error' && (
        <div className="px-4 py-3">
          <p className="text-xs text-rose-400">{errorMsg ?? 'Something went wrong'}</p>
        </div>
      )}

      {!initialPlan && state !== 'queued' && (
        <div className="px-4 py-6 text-center space-y-2">
          <p className="text-xs text-muted-foreground">No training plan yet</p>
          <p className="text-[10px] text-muted-foreground/60">Generate a personalised drill plan based on your match data and upcoming opponents.</p>
        </div>
      )}

      {initialPlan && state !== 'queued' && (
        <div className="divide-y divide-border/40">
          {initialPlan.drills.map((drill, i) => (
            <div key={i} className="px-4 py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{drill.title}</p>
                <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${FOCUS_COLORS[drill.focus_area] ?? 'text-muted-foreground bg-muted/20'}`}>
                  {drill.focus_area}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{drill.evidence}</p>
              <p className="text-[11px] text-foreground/80 leading-relaxed">{drill.drill_description}</p>
              <YoutubeLink query={drill.youtube_search} />
            </div>
          ))}
          {initialPlan.summary && (
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground italic leading-relaxed">{initialPlan.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
