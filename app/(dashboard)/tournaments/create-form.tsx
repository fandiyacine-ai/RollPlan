'use client'

import { useState } from 'react'
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

export function CreateTournamentForm() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ruleset, setRuleset] = useState('ibjjf')
  const router = useRouter()

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setError(null); setPending(false) } }}>
      <DialogTrigger>
        <Button size="sm">+ New Tournament</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Tournament</DialogTitle>
        </DialogHeader>
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
              placeholder="e.g. AJP Grand Slam Abu Dhabi"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Event Date</label>
              <Input
                name="eventDate"
                type="date"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ruleset</label>
              <Select value={ruleset} onValueChange={(v) => { if (v !== null) setRuleset(v) }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULESET_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Division</label>
            <Input
              name="division"
              placeholder="e.g. Adult Male Black Belt –85 kg"
            />
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
              placeholder="smoothcomp.com/en/event/29941/…"
            />
            <p className="text-xs text-muted-foreground/60">
              Paste any URL from your event on Smoothcomp. Once the bracket is published we&apos;ll auto-import your opponents.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </form>
        <DialogFooter>
          <DialogClose>
            <Button variant="outline" type="button">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="create-tournament-form" disabled={pending}>
            {pending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
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
