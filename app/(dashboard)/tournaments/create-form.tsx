'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createTournament, deleteTournament, updateTournament } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { searchCatalogAction, type CatalogEntry } from './catalog-actions'
import { countryFlag, giNoGi } from '../../../lib/tournament-utils'
import { RulesetBadge } from '@/components/ruleset-badge'

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

// Label, placeholder, and hint for the bracket URL field vary by federation.
// The DB column is always smoothcompUrl — Smoothcomp auto-import works for any
// Smoothcomp-hosted event regardless of ruleset.
const BRACKET_URL_CONFIG: Record<string, { label: string; placeholder: string; hint: string }> = {
  ibjjf: {
    label: 'IBJJF Bracket URL',
    placeholder: 'ibjjf.com/tournaments/...',
    hint: 'Link to your IBJJF bracket. Smoothcomp-hosted IBJJF events will auto-import opponents when the bracket is published.',
  },
  ajp: {
    label: 'AJP Tour Bracket URL',
    placeholder: 'ajptour.com/en/event/...',
    hint: 'Link to your AJP event page. Smoothcomp-hosted AJP events will auto-import opponents when the bracket is published.',
  },
  adcc: {
    label: 'Event URL',
    placeholder: 'adcombat.com/...',
    hint: 'Optional link to your event page for reference.',
  },
  ebi: {
    label: 'Event URL',
    placeholder: 'flograppling.com/...',
    hint: 'Optional link to your event page for reference.',
  },
  other: {
    label: 'Smoothcomp URL',
    placeholder: 'smoothcomp.com/en/event/29941/…',
    hint: "Paste any URL from your event on Smoothcomp. Once the bracket is published we'll auto-import your opponents.",
  },
}

function getBracketUrlConfig(ruleset: string) {
  return BRACKET_URL_CONFIG[ruleset] ?? BRACKET_URL_CONFIG.other
}

// ── Event catalog picker ──────────────────────────────────────────────────────

function EventCatalogPicker({ onSelect }: { onSelect: (e: CatalogEntry) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const userLocale = typeof navigator !== 'undefined' ? navigator.language : undefined

  const search = useCallback(async (q: string) => {
    setLoading(true)
    const data = await searchCatalogAction(q, userLocale)
    setResults(data)
    setLoading(false)
  }, [userLocale])

  // Load upcoming events on mount
  useEffect(() => { search('') }, [search])

  // Debounced search on query change
  useEffect(() => {
    const timer = setTimeout(() => search(query), 300)
    return () => clearTimeout(timer)
  }, [query, search])

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        placeholder="Search events — IBJJF, AJP, ADCC, Smoothcomp…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
        {loading && (
          <p className="text-xs text-muted-foreground px-3 py-4 text-center">Loading…</p>
        )}
        {!loading && results.map((ev) => {
          const flag = countryFlag(ev.location)
          const format = giNoGi(ev.ruleset, ev.name)
          const dateStr = ev.eventDate
            ? new Date(ev.eventDate + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
            : null
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => onSelect(ev)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border/40 transition-colors group"
            >
              {/* Name row */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-semibold leading-snug">
                  {flag && <span className="mr-1">{flag}</span>}
                  {ev.name}
                </p>
                <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    format === 'nogi' ? 'bg-orange-500 text-white' : 'bg-sky-500 text-white'
                  }`}>
                    {format === 'nogi' ? 'No-Gi' : 'Gi'}
                  </span>
                  <RulesetBadge ruleset={ev.ruleset} />
                </div>
              </div>
              {/* Meta row */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                {(ev.location || dateStr) && (
                  <span className="flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    {ev.location ?? 'Location TBC'}
                  </span>
                )}
                {dateStr && (
                  <span className="flex items-center gap-1">
                    <span className="opacity-30">·</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {dateStr}
                  </span>
                )}
                {ev.userCount > 0 && (
                  <span className="flex items-center gap-1 text-primary/50">
                    <span className="opacity-30">·</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    {ev.userCount} preparing
                  </span>
                )}
              </div>
            </button>
          )
        })}
        {!loading && results.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-4 text-center">No events found — enter manually below.</p>
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
  const [prefilled, setPrefilled] = useState<CatalogEntry | null>(null)
  const router = useRouter()

  function handleReset() {
    setStep('pick')
    setPrefilled(null)
    setError(null)
    setPending(false)
    setRuleset('ibjjf')
  }

  function handleSelectEvent(ev: CatalogEntry) {
    setPrefilled(ev)
    setRuleset(ev.ruleset)
    setStep('form')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) handleReset() }}>
      <Button size="sm" onClick={() => setOpen(true)}>+ New Tournament</Button>
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
                <RulesetBadge ruleset={prefilled.ruleset} />
                <span className="font-medium truncate">{prefilled.name}</span>
              </div>
            )}
            <form
              id="create-tournament-form"
              action={async (fd) => {
                fd.set('ruleset', ruleset)
                if (prefilled?.id) fd.set('canonicalTournamentId', prefilled.id)
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
                  <Input name="eventDate" type="date" defaultValue={prefilled?.eventDate ?? ''} />
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

              {(() => {
                const urlCfg = getBracketUrlConfig(ruleset)
                return (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {urlCfg.label} <span className="text-muted-foreground/50 font-normal">(optional)</span>
                    </label>
                    <Input
                      name="smoothcompUrl"
                      type="url"
                      defaultValue={prefilled?.smoothcompUrl ?? ''}
                      placeholder={urlCfg.placeholder}
                    />
                    <p className="text-xs text-muted-foreground/60">{urlCfg.hint}</p>
                  </div>
                )
              })()}

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
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Edit tournament"
        className="text-muted-foreground hover:text-foreground"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </Button>
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

          {(() => {
            const urlCfg = getBracketUrlConfig(ruleset)
            return (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {urlCfg.label} <span className="text-muted-foreground/50 font-normal">(optional)</span>
                </label>
                <Input name="smoothcompUrl" type="url" defaultValue={tournament.smoothcompUrl ?? ''} placeholder={urlCfg.placeholder} />
                <p className="text-xs text-muted-foreground/60">{urlCfg.hint}</p>
              </div>
            )
          })()}

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
