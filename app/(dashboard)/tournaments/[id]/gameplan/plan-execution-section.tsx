'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchOwnMatches, linkMatchToGameplan, unlinkMatchFromGameplan, type OwnMatch } from './plan-execution-actions'

function resultLabel(m: OwnMatch): string {
  if (!m.resultWinner) return 'No result'
  const isWin = m.resultWinner === 'user'
  if (m.resultMethod === 'submission') return isWin ? `Won — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}` : `Lost — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}`
  if (m.resultMethod === 'points') return isWin ? 'Won — Points' : 'Lost — Points'
  if (m.resultMethod === 'walkover') return isWin ? 'Won — Walkover' : 'Lost — Walkover'
  return isWin ? 'Won' : 'Lost'
}

export function PlanExecutionSection({
  gameplanId,
  linkedMatchId,
}: {
  gameplanId: string
  linkedMatchId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [ownMatches, setOwnMatches] = useState<OwnMatch[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)

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
    await linkMatchToGameplan(gameplanId, matchId)
    setOpen(false)
    router.refresh()
    setPending(false)
  }

  async function handleUnlink() {
    setPending(true)
    await unlinkMatchFromGameplan(gameplanId)
    router.refresh()
    setPending(false)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Post-match review</p>
        {linkedMatchId && (
          <button
            type="button"
            onClick={handleUnlink}
            disabled={pending}
            className="text-xs text-muted-foreground hover:text-rose-400 transition-colors disabled:opacity-50"
          >
            Unlink
          </button>
        )}
      </div>

      {linkedMatchId ? (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400/70 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Match linked.{' '}
            <a href={`/matches/${linkedMatchId}`} className="underline underline-offset-2 hover:text-foreground">
              View your match →
            </a>
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Link one of your own analysed matches to compare against this gameplan.
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
