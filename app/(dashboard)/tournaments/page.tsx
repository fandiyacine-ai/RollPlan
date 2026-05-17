import { db } from '../../../lib/db'
import { tournaments } from '../../../lib/db/schema'
import { desc } from 'drizzle-orm'
import Link from 'next/link'
import { CreateTournamentForm, DeleteTournamentButton } from './create-form'

export const dynamic = 'force-dynamic'

const RULESET_LABEL: Record<string, string> = {
  ibjjf: 'IBJJF', ajp: 'AJP', adcc: 'ADCC', ebi: 'EBI', other: 'Other',
}

const STATUS_BADGE: Record<string, string> = {
  upcoming: 'bg-blue-950 text-blue-400 border border-blue-800/50',
  completed: 'bg-emerald-950 text-emerald-400 border border-emerald-800/50',
  cancelled: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default async function TournamentsPage() {
  const allTournaments = await db
    .select()
    .from(tournaments)
    .orderBy(desc(tournaments.createdAt))

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tournaments</h1>
        <CreateTournamentForm />
      </div>

      {allTournaments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">No tournaments yet</p>
          <p className="text-sm mt-1">Create one to start scouting opponents and generating gameplans.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allTournaments.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}/opponents`}
              className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {RULESET_LABEL[t.ruleset] ?? t.ruleset}
                    {t.division ? ` · ${t.division}` : ''}
                    {t.eventDate ? ` · ${new Date(t.eventDate).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[t.status] ?? 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  <DeleteTournamentButton id={t.id} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
