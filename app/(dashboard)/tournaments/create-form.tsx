'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createTournament, deleteTournament, updateTournament } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { UPCOMING_EVENTS, searchEvents, type CatalogEvent } from '../../../lib/data/upcoming-events'

export function DeleteTournamentButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Delete this tournament and all its opponents? This cannot be undone.')) return
        setPending(true)
        await deleteTournament(id)
        router.refresh()
      }}
      disabled={pending}
      aria-label="Delete tournament"
      className="text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </Button>
  )
}

const RULESET_OPTIONS = [
  { value: 'ibjjf', label: 'IBJJF' },
  { value: 'ajp', label: 'AJP' },
  { value: 'adcc', label: 'ADCC' },
  { value: 'ebi', label: 'EBI' },
  { value: 'other', label: 'Other' },
]

// ── Event catalog picker ──────────────────────────────────────────────────────

const RULESET_BADGE: Record<string, string> = {
  ibjjf: 'bg-blue-950/60 text-blue-400 border-blue-800/30',
  ajp:   'bg-purple-950/60 text-purple-400 border-purple-800/30',
  adcc:  'bg-amber-950/60 text-amber-400 border-amber-800/30',
  ebi:   'bg-rose-950/60 text-rose-400 border-rose-800/30',
  other: 'bg-zinc-800 text-zinc-400 border-zinc-700/30',
}

function EventCatalogPicker({ onSelect }: { onSelect: (e: CatalogEvent) => void }) {
  const [query, setQuery] = useState('')
  const results = searchEvents(query).slice(0, 8)

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        placeholder="Search events — IBJJF, ADCC, AJP…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {results.map((ev, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(ev)}
            className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{ev.name}</p>
              <p className="text-xs text-muted-foreground">{ev.location} · {new Date(ev.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 uppercase ${RULESET_BADGE[ev.ruleset]}`}>
              {ev.ruleset}
            </span>
          </button>
        ))}
        {results.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-4 text-center">No events found — you can still enter manually below.</p>
        )}
      </div>
    </div>
  )
}

// ── Create tournament form ────────────────────────────────────────────────────

export function CreateTournamentForm() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'pick' | 'form'>('pick')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ruleset, setRuleset] = useState('ibjjf')
  const [prefilled, setPrefilled] = useState<CatalogEvent | null>(null)
  const router = useRouter()

  function handleReset() {
    setStep('pick')
    setPrefilled(null)
    setError(null)
    setPending(false)
    setRuleset('ibjjf')
  }

  function handleSelectEvent(ev: CatalogEvent) {
    setPrefilled(ev)
    setRuleset(ev.ruleset)
    setStep('form')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) handleReset() }}>
      <DialogTrigger>
        <Button size="sm">+ New Tournament</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'pick' ? 'New Tournament' : (
              <button type="button" onClick={() => setStep('pick')} className="flex items-center gap-2 group">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-foreground transition-colors">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                <span>New Tournament</span>
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === 'pick' && (
          <>
            <EventCatalogPicker onSelect={handleSelectEvent} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border/60" />
              <span>or</span>
              <div className="flex-1 h-px bg-border/60" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep('form')} className="w-full">
              Enter manually
            </Button>
          </>
        )}

        {step === 'form' && (
          <>
            {prefilled && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${RULESET_BADGE[prefilled.ruleset]}`}>
                  {prefilled.ruleset}
                </span>
                <span className="font-medium truncate">{prefilled.name}</span>
              </div>
            )}
            <form
              id="create-tournament-form"
              action={async (fd) => {
                fd.set('ruleset', ruleset)
                setPending(true)
                setError(null)
                const result = await createTournament(fd)
                if (result.error) {
                  setError(result.error)
                  setPending(false)
                } else if (result.tournamentId) {
                  setOpen(false)
                  router.push(`/tournaments/${result.tournamentId}/opponents`)
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input
                  name="name"
                  required
                  defaultValue={prefilled?.name ?? ''}
                  placeholder="e.g. AJP Grand Slam Abu Dhabi"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Event Date</label>
                  <Input name="eventDate" type="date" defaultValue={prefilled?.date ?? ''} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Ruleset</label>
                  <Select value={ruleset} onValueChange={(v) => { if (v !== null) setRuleset(v) }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RULESET_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Division</label>
                <Input name="division" placeholder="e.g. Adult Male Black Belt –85 kg" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Any context about this tournament"
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Smoothcomp Bracket URL <span className="text-muted-foreground/50 font-normal">(optional)</span></label>
                <Input
                  name="smoothcompUrl"
                  type="url"
                  defaultValue={prefilled?.smoothcompUrl ?? ''}
                  placeholder="smoothcomp.com/en/event/29941/…"
                />
                <p className="text-xs text-muted-foreground/60">
                  Paste any URL from your event on Smoothcomp. Once the bracket is published we&apos;ll auto-import your opponents.
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
            <DialogFooter>
              <DialogClose>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button type="submit" form="create-tournament-form" disabled={pending}>
                {pending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

type TournamentData = {
  id: string
  name: string
  eventDate: string | null
  division: string | null
  ruleset: string
  notes: string | null
  status: string
  smoothcompUrl: string | null
}

const STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function EditTournamentButton({ tournament }: { tournament: TournamentData }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ruleset, setRuleset] = useState(tournament.ruleset)
  const [status, setStatus] = useState(tournament.status)
  const router = useRouter()

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setError(null); setPending(false) } }}>
      <DialogTrigger onClick={e => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit tournament"
          className="text-muted-foreground hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tournament</DialogTitle>
        </DialogHeader>
        <form
          id="edit-tournament-form"
          action={async (fd) => {
            fd.set('ruleset', ruleset)
            fd.set('status', status)
            setPending(true)
            setError(null)
            const result = await updateTournament(tournament.id, fd)
            if (result.error) {
              setError(result.error)
              setPending(false)
            } else {
              setOpen(false)
              router.refresh()
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input name="name" required defaultValue={tournament.name} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Event Date</label>
              <Input name="eventDate" type="date" defaultValue={tournament.eventDate ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ruleset</label>
              <Select value={ruleset} onValueChange={(v) => { if (v) setRuleset(v) }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULESET_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Division</label>
              <Input name="division" defaultValue={tournament.division ?? ''} placeholder="e.g. Adult Male Black Belt –85 kg" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onValueChange={(v) => { if (v) setStatus(v) }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={tournament.notes ?? ''}
              placeholder="Any context about this tournament"
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Smoothcomp URL <span className="text-muted-foreground/50 font-normal">(optional)</span></label>
            <Input name="smoothcompUrl" type="url" defaultValue={tournament.smoothcompUrl ?? ''} placeholder="smoothcomp.com/en/event/…" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <DialogClose>
            <Button variant="outline" type="button">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="edit-tournament-form" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
