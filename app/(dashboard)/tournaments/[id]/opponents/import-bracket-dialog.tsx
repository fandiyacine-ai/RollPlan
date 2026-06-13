'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchBracketAthletes, importSelectedOpponents, linkBracketUrl } from './actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

type Athlete = { name: string; smoothcompAthleteId: string; profileUrl: string }

type State =
  | { phase: 'idle' }
  | { phase: 'capture-url' }
  | { phase: 'linking' }
  | { phase: 'loading' }
  | { phase: 'unpublished' }
  | { phase: 'selecting'; athletes: Athlete[] }
  | { phase: 'importing' }
  | { phase: 'done'; count: number }
  | { phase: 'error'; message: string }

export function ImportBracketDialog({ tournamentId, hasBracketUrl = true, userSmootcompAthleteId }: { tournamentId: string; hasBracketUrl?: boolean; userSmootcompAthleteId?: string | null }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bracketUrlInput, setBracketUrlInput] = useState('')
  const [urlLinked, setUrlLinked] = useState(false)
  const router = useRouter()

  async function loadBracket() {
    setState({ phase: 'loading' })
    const result = await fetchBracketAthletes(tournamentId)
    if (result.error) {
      setState({ phase: 'error', message: result.error })
    } else if (!result.bracketIsPublished) {
      setState({ phase: 'unpublished' })
    } else {
      setSelected(new Set(result.athletes.filter(a => a.smoothcompAthleteId !== userSmootcompAthleteId).map(a => a.smoothcompAthleteId)))
      setState({ phase: 'selecting', athletes: result.athletes })
    }
  }

  async function handleLinkAndImport() {
    if (!bracketUrlInput.trim()) return
    setState({ phase: 'linking' })
    const result = await linkBracketUrl(tournamentId, bracketUrlInput)
    if (result.error) {
      setState({ phase: 'error', message: result.error })
    } else {
      setUrlLinked(true)
      await loadBracket()
    }
  }

  async function handleOpen(o: boolean) {
    setOpen(o)
    if (o && state.phase === 'idle') {
      if (!hasBracketUrl) {
        setState({ phase: 'capture-url' })
        return
      }
      setState({ phase: 'loading' })
      const result = await fetchBracketAthletes(tournamentId)
      if (result.error) {
        setState({ phase: 'error', message: result.error })
      } else if (!result.bracketIsPublished) {
        setState({ phase: 'unpublished' })
      } else {
        // Default: all athletes selected except the user themselves
        setSelected(new Set(result.athletes.filter(a => a.smoothcompAthleteId !== userSmootcompAthleteId).map(a => a.smoothcompAthleteId)))
        setState({ phase: 'selecting', athletes: result.athletes })
      }
    }
    if (!o) {
      if (urlLinked) router.refresh()
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
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Import from bracket</Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Import opponents from bracket</DialogTitle>
        </DialogHeader>

        {state.phase === 'capture-url' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Paste your Smoothcomp bracket URL to import opponents directly from your draw.
            </p>
            <input
              type="url"
              placeholder="https://smoothcomp.com/en/event/…/bracket/…"
              value={bracketUrlInput}
              onChange={e => setBracketUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLinkAndImport() }}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Any URL from your Smoothcomp event page works.</p>
          </div>
        )}

        {state.phase === 'linking' && (
          <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-sm">Linking bracket…</p>
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
              {userSmootcompAthleteId && state.athletes.some(a => a.smoothcompAthleteId === userSmootcompAthleteId)
                ? <> You've been <span className="font-medium text-foreground/70">automatically excluded</span>.</>
                : <> <span className="font-medium text-foreground/70">Uncheck yourself</span> before importing.</>
              }
            </p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {state.athletes.map(a => {
                const isMe = userSmootcompAthleteId != null && a.smoothcompAthleteId === userSmootcompAthleteId
                return (
                  <label
                    key={a.smoothcompAthleteId}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isMe ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={!isMe && selected.has(a.smoothcompAthleteId)}
                      onChange={() => { if (!isMe) toggle(a.smoothcompAthleteId) }}
                      disabled={isMe}
                      className="w-4 h-4 rounded border-border accent-foreground cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-medium">{a.name}</span>
                    {isMe && <span className="ml-auto text-xs text-muted-foreground italic">That's you</span>}
                  </label>
                )
              })}
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
            <p className="text-sm font-semibold text-blue-400">
              {state.count === 0 ? 'All opponents already added.' : `${state.count} opponent${state.count !== 1 ? 's' : ''} imported.`}
            </p>
            <p className="text-xs text-muted-foreground">
              Add scouting footage for each opponent so the AI can build your gameplans.
            </p>
          </div>
        )}

        <DialogFooter>
          {state.phase === 'capture-url' && (
            <>
              <DialogClose>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button onClick={handleLinkAndImport} disabled={!bracketUrlInput.trim()}>
                Link &amp; Import
              </Button>
            </>
          )}
          {(state.phase === 'done' || state.phase === 'unpublished' || state.phase === 'error') && (
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
