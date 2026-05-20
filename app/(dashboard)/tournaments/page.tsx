import { db } from '../../../lib/db'
import { tournaments, canonicalTournaments } from '../../../lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { CreateTournamentForm, DeleteTournamentButton, EditTournamentButton } from './create-form'
import { countryFlag, giNoGi } from '../../../lib/tournament-utils'

export const dynamic = 'force-dynamic'

const RULESET_BADGE: Record<string, { label: string; colour: string }> = {
  ibjjf:  { label: 'IBJJF',  colour: 'bg-blue-950/60 text-blue-400 border-blue-800/40' },
  ajp:    { label: 'AJP',    colour: 'bg-purple-950/60 text-purple-400 border-purple-800/40' },
  adcc:   { label: 'ADCC',   colour: 'bg-amber-950/60 text-amber-400 border-amber-800/40' },
  ebi:    { label: 'EBI',    colour: 'bg-rose-950/60 text-rose-400 border-rose-800/40' },
  nogi:   { label: 'No-Gi',  colour: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  other:  { label: 'Other',  colour: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
}

const STATUS_BADGE: Record<string, string> = {
  upcoming:  'bg-blue-950/60 text-blue-400 border border-blue-800/40',
  completed: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40',
  cancelled: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T12:00:00').getTime() - Date.now()) / 86400000)
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function TournamentsPage() {
  const allTournaments = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      eventDate: tournaments.eventDate,
      division: tournaments.division,
      ruleset: tournaments.ruleset,
      notes: tournaments.notes,
      status: tournaments.status,
      smoothcompUrl: tournaments.smoothcompUrl,
      location: canonicalTournaments.location,
    })
    .from(tournaments)
    .leftJoin(canonicalTournaments, eq(tournaments.canonicalTournamentId, canonicalTournaments.id))
    .orderBy(desc(tournaments.createdAt))

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Step guide */}
      <div className="bg-card border border-border/60 rounded-xl p-5">
        <div className="flex items-start gap-3">
          {[
            { n: '1', title: 'Create a tournament', body: 'Name the event, ruleset, and division you\'re competing in.' },
            { n: '2', title: 'Name your opponents', body: 'Add the athletes you might face and submit their match footage.' },
            { n: '3', title: 'AI builds your gameplan', body: 'Get a tailored gameplan for each opponent based on their footage.' },
          ].map((step, i) => (
            <div key={step.n} className="contents">
              <div className="flex-1 text-center">
                <p className="text-primary font-bold text-base">{step.n}</p>
                <p className="font-medium text-sm mt-1">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{step.body}</p>
              </div>
              {i < 2 && <div className="pt-4 text-muted-foreground/50 font-light text-lg select-none">→</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Your tournaments</h1>
        <CreateTournamentForm />
      </div>

      {allTournaments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No tournaments yet</p>
          <p className="text-sm mt-1">Create one to start scouting opponents and generating gameplans.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {allTournaments.map((t) => {
            const rb = RULESET_BADGE[t.ruleset] ?? RULESET_BADGE.other
            const format = giNoGi(t.ruleset, t.name)
            const flag = countryFlag(t.location ?? null)
            const days = t.status === 'upcoming' ? daysUntil(t.eventDate) : null
            return (
              <Link
                key={t.id}
                href={`/tournaments/${t.id}/opponents`}
                className="block rounded-xl border border-border/60 bg-card px-4 py-3.5 hover:bg-muted/30 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: name + meta */}
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {flag && <span className="text-base leading-none">{flag}</span>}
                      <p className="font-semibold text-sm leading-snug">{t.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${rb.colour}`}>
                        {rb.label}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                        format === 'nogi'
                          ? 'bg-orange-950/40 text-orange-400 border-orange-800/30'
                          : 'bg-blue-950/40 text-blue-400 border-blue-800/30'
                      }`}>
                        {format === 'nogi' ? 'No-Gi' : 'Gi'}
                      </span>
                      {t.division && (
                        <span className="text-xs text-muted-foreground truncate">{t.division}</span>
                      )}
                      {t.eventDate && (
                        <span className="text-xs text-muted-foreground">{fmtDate(t.eventDate)}</span>
                      )}
                    </div>
                  </div>

                  {/* Right: countdown + status + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {days !== null && days >= 0 && days <= 60 && (
                      <span className={`text-xs font-bold tabular-nums ${
                        days === 0 ? 'text-rose-400' : days <= 7 ? 'text-rose-400' : days <= 30 ? 'text-amber-400' : 'text-muted-foreground'
                      }`}>
                        {days === 0 ? 'Today!' : `${days}d`}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[t.status] ?? 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <EditTournamentButton tournament={t} />
                    <DeleteTournamentButton id={t.id} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
