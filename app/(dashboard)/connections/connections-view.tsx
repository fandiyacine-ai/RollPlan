'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  sendConnectionRequestAction,
  respondToConnectionRequestAction,
  blockUserAction,
  type ConnectionCandidate,
  type PendingRequest,
  type ConnectionRecord,
} from './actions'

const RESULT_LABEL: Record<string, { label: string; className: string }> = {
  win:  { label: 'You won',  className: 'text-blue-500' },
  loss: { label: 'You lost', className: 'text-rose-500' },
  draw: { label: 'Draw',     className: 'text-muted-foreground' },
}

function WLBadge({ label, wins, losses }: { label: string; wins: number | null; losses: number | null }) {
  if (wins === null && losses === null) return null
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {label} <span className="font-semibold text-blue-500">{wins ?? 0}W</span>–<span className="font-semibold text-rose-500">{losses ?? 0}L</span>
    </span>
  )
}

function CandidateRow({ candidate }: { candidate: ConnectionCandidate }) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const result = RESULT_LABEL[candidate.result] ?? null

  function send() {
    setError(null)
    startTransition(async () => {
      const res = await sendConnectionRequestAction(candidate.opponentUserId, candidate.tournamentId)
      if (res.error) setError(res.error)
      else { setSent(true); router.refresh() }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{candidate.opponentLabel}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          You faced them at {candidate.tournamentName}
          {result && <> · <span className={result.className}>{result.label}</span></>}
        </p>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
      <button
        onClick={send}
        disabled={pending || sent}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-foreground text-background disabled:opacity-50 transition-opacity"
      >
        {sent ? 'Request sent' : pending ? 'Sending…' : 'Connect'}
      </button>
    </div>
  )
}

function PendingRow({ request }: { request: PendingRequest }) {
  const [pending, startTransition] = useTransition()
  const [handled, setHandled] = useState(false)
  const router = useRouter()

  function respond(accept: boolean) {
    startTransition(async () => {
      await respondToConnectionRequestAction(request.connectionId, accept)
      setHandled(true)
      router.refresh()
    })
  }

  if (handled) return null

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{request.fromLabel} wants to connect</p>
        {request.tournamentName && (
          <p className="text-xs text-muted-foreground mt-0.5">You faced them at {request.tournamentName}</p>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <button
          onClick={() => respond(true)}
          disabled={pending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-foreground text-background disabled:opacity-50 transition-opacity"
        >
          Accept
        </button>
        <button
          onClick={() => respond(false)}
          disabled={pending}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Ignore
        </button>
      </div>
    </div>
  )
}

function AcceptedRow({ connection }: { connection: ConnectionRecord }) {
  const [pending, startTransition] = useTransition()
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const router = useRouter()

  function block() {
    startTransition(async () => {
      await blockUserAction(connection.otherUserId)
      setBlocked(true)
      router.refresh()
    })
  }

  if (blocked) return null

  const r = connection.record
  const hasRecord = r.ajpWins !== null || r.smoothcompWins !== null || r.ibjjfBestResult

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{connection.otherLabel}</p>
        {confirmingBlock ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">Block this person?</span>
            <button onClick={block} disabled={pending} className="text-xs font-semibold text-destructive">Block</button>
            <button onClick={() => setConfirmingBlock(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmingBlock(true)} className="flex-shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors">
            Block
          </button>
        )}
      </div>

      {hasRecord && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          <WLBadge label="AJP" wins={r.ajpWins} losses={r.ajpLosses} />
          <WLBadge label="Smoothcomp" wins={r.smoothcompWins} losses={r.smoothcompLosses} />
          {r.ibjjfBestResult && <span className="text-xs text-muted-foreground">IBJJF: {r.ibjjfBestResult.split('|')[0]}</span>}
        </div>
      )}

      {connection.upcomingTournaments.length > 0 ? (
        <div className="mt-2 space-y-0.5">
          <p className="text-xs text-muted-foreground/70 uppercase tracking-wide font-semibold">Upcoming</p>
          {connection.upcomingTournaments.map(t => (
            <p key={t.id} className="text-xs text-muted-foreground">
              {t.name}{t.eventDate && <span className="text-muted-foreground/60"> · {new Date(t.eventDate).toLocaleDateString()}</span>}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/60 mt-2">No upcoming tournaments listed.</p>
      )}
    </div>
  )
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {title}{typeof count === 'number' && count > 0 ? ` (${count})` : ''}
      </h2>
      <div className="rounded-xl border border-border/60 bg-muted/30 divide-y divide-border/40 overflow-hidden">
        {children}
      </div>
    </section>
  )
}

export function ConnectionsView({
  candidates,
  pendingReceived,
  accepted,
}: {
  candidates: ConnectionCandidate[]
  pendingReceived: PendingRequest[]
  accepted: ConnectionRecord[]
}) {
  const nothingYet = candidates.length === 0 && pendingReceived.length === 0 && accepted.length === 0

  if (nothingYet) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
        <p className="text-sm font-medium text-foreground">No connections yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          When you compete and we can confirm a head-to-head against another RollPlan athlete who's open to
          connecting, you'll be able to send them a connection request right here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {pendingReceived.length > 0 && (
        <Section title="Requests" count={pendingReceived.length}>
          {pendingReceived.map(r => <PendingRow key={r.connectionId} request={r} />)}
        </Section>
      )}

      {candidates.length > 0 && (
        <Section title="People you've faced" count={candidates.length}>
          {candidates.map(c => <CandidateRow key={`${c.tournamentId}-${c.opponentUserId}`} candidate={c} />)}
        </Section>
      )}

      {accepted.length > 0 && (
        <Section title="Your connections" count={accepted.length}>
          {accepted.map(a => <AcceptedRow key={a.connectionId} connection={a} />)}
        </Section>
      )}
    </div>
  )
}
