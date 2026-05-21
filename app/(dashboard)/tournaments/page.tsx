import { db } from '../../../lib/db'
import { tournaments, canonicalTournaments } from '../../../lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { CreateTournamentForm, DeleteTournamentButton, EditTournamentButton } from './create-form'
import { countryFlag, giNoGi } from '../../../lib/tournament-utils'
import { RulesetBadge } from '@/components/ruleset-badge'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<string, string> = {
  upcoming:  'bg-muted text-muted-foreground border border-border',
  completed: 'bg-muted text-muted-foreground border border-border',
  cancelled: 'bg-muted text-muted-foreground border border-border',
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
      <div className="border border-dashed border-border/60 rounded-xl p-5 bg-muted/20">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-3">
          {[
            { n: '1', title: 'Create a tournament', body: 'Name the event, ruleset, and division you\'re competing in.' },
            { n: '2', title: 'Name your opponents', body: 'Add the athletes you might face and submit their match footage.' },
            { n: '3', title: 'AI builds your gameplan', body: 'Get a tailored gameplan for each opponent based on their footage.' },
          ].map((step, i) => (
            <div key={step.n} className="contents">
              <div className="flex-1 sm:text-center flex sm:block items-start gap-3">
                <p className="text-primary font-bold text-base shrink-0 w-5">{step.n}</p>
                <div>
                  <p className="font-medium text-sm">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.body}</p>
                </div>
              </div>
              {i < 2 && <div className="hidden sm:block pt-4 text-muted-foreground/40 font-light text-lg select-none">→</div>}
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
                      <p className="font-semibold text-sm leading-snug line-clamp-2">{t.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <RulesetBadge ruleset={t.ruleset} />
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
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
