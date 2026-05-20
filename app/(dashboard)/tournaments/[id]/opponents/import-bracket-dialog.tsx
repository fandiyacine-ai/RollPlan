'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchBracketAthletes, importSelectedOpponents } from './actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

type Athlete = { name: string; smoothcompAthleteId: string; profileUrl: string }

type State =
  | { phase: 'idle' }
  | { phase: 'no-url' }
  | { phase: 'loading' }
  | { phase: 'unpublished' }
  | { phase: 'selecting'; athletes: Athlete[] }
  | { phase: 'importing' }
  | { phase: 'done'; count: number }
  | { phase: 'error'; message: string }

export function ImportBracketDialog({ tournamentId, hasBracketUrl = true }: { tournamentId: string; hasBracketUrl?: boolean }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const router = useRouter()

  async function handleOpen(o: boolean) {
    setOpen(o)
    if (o && state.phase === 'idle') {
      if (!hasBracketUrl) {
        setState({ phase: 'no-url' })
        return
      }
      setState({ phase: 'loading' })
      const result = await fetchBracketAthletes(tournamentId)
      if (result.error) {
        setState({ phase: 'error', message: result.error })
      } else if (!result.bracketIsPublished) {
        setState({ phase: 'unpublished' })
      } else {
        // Default: all athletes selected
        setSelected(new Set(result.athletes.map(a => a.smoothcompAthleteId)))
        setState({ phase: 'selecting', athletes: result.athletes })
      }
    }
    if (!o) {
      // Reset so re-opening re-fetches (bracket may have been published)
      setState({ phase: 'idle' })
      setSelected(new Set())
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleImport() {
    if (state.phase !== 'selecting') return
    const toImport = state.athletes.filter(a => selected.has(a.smoothcompAthleteId))
    if (toImport.length === 0) { setOpen(false); return }
    setState({ phase: 'importing' })
    const result = await importSelectedOpponents(tournamentId, toImport)
    if (result.error) {
      setState({ phase: 'error', message: result.error })
    } else {
      setState({ phase: 'done', count: result.count })
      router.refresh()
    }
  }

  const selectedCount = selected.size

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">Import from bracket</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Import opponents from bracket</DialogTitle>
        </DialogHeader>

        {state.phase === 'no-url' && (
          <div className="py-6 space-y-3">
            <p className="text-sm font-medium">No bracket URL linked</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To import opponents from Smoothcomp, add a bracket URL to this tournament first.
              Go to your tournament settings and paste a URL like{' '}
              <span className="font-mono text-foreground/70">smoothcomp.com/en/event/…/bracket/…</span>
            </p>
            <a
              href={`/tournaments/${tournamentId}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Edit tournament settings
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </a>
          </div>
        )}

        {state.phase === 'loading' && (
          <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-sm">Loading bracket…</p>
          </div>
        )}

        {state.phase === 'unpublished' && (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium">Bracket not published yet</p>
            <p className="text-xs text-muted-foreground">
              The bracket hasn't been released on Smoothcomp. Add opponents manually for now, or come back once it's published.
            </p>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="py-4">
            <p className="text-sm text-destructive">{state.message}</p>
          </div>
        )}

        {state.phase === 'selecting' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {state.athletes.length} athlete{state.athletes.length !== 1 ? 's' : ''} found in your bracket.
              {' '}<span className="font-medium text-foreground/70">Uncheck yourself</span> before importing.
            </p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {state.athletes.map(a => (
                <label
                  key={a.smoothcompAthleteId}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(a.smoothcompAthleteId)}
                    onChange={() => toggle(a.smoothcompAthleteId)}
                    className="w-4 h-4 rounded border-border accent-foreground cursor-pointer"
                  />
                  <span className="text-sm font-medium">{a.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {state.phase === 'importing' && (
          <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-sm">Importing…</p>
          </div>
        )}

        {state.phase === 'done' && (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-semibold text-emerald-400">
              {state.count === 0 ? 'All opponents already added.' : `${state.count} opponent${state.count !== 1 ? 's' : ''} imported.`}
            </p>
            <p className="text-xs text-muted-foreground">
              Add scouting footage for each opponent so the AI can build your gameplans.
            </p>
          </div>
        )}

        <DialogFooter>
          {(state.phase === 'done' || state.phase === 'unpublished' || state.phase === 'error' || state.phase === 'no-url') && (
            <DialogClose>
              <Button variant="outline" type="button">Close</Button>
            </DialogClose>
          )}
          {state.phase === 'selecting' && (
            <>
              <DialogClose>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button onClick={handleImport} disabled={selectedCount === 0}>
                Import {selectedCount > 0 ? `${selectedCount} opponent${selectedCount !== 1 ? 's' : ''}` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
