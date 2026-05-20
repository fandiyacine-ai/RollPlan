import { db } from '../../../../lib/db'
import { tournaments } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EditTournamentButton } from '../create-form'

const RULESET_LABEL: Record<string, string> = {
  ibjjf: 'IBJJF', ajp: 'AJP', adcc: 'ADCC', ebi: 'EBI', other: 'Other',
}

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let tournament: Awaited<ReturnType<typeof db.query.tournaments.findFirst>>
  try {
    tournament = await db.query.tournaments.findFirst({ where: eq(tournaments.id, id) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return (
      <div className="p-4 rounded-lg border border-rose-800/50 bg-rose-950/20 text-sm text-rose-400">
        <p className="font-semibold mb-1">DB error (layout: tournaments query)</p>
        <pre className="text-xs whitespace-pre-wrap break-all">{msg}</pre>
      </div>
    )
  }
  if (!tournament) notFound()

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/tournaments" className="text-xs text-muted-foreground hover:text-foreground inline-block mb-3">
          ← Tournaments
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <EditTournamentButton tournament={{
            id: tournament.id,
            name: tournament.name,
            eventDate: tournament.eventDate ?? null,
            division: tournament.division ?? null,
            ruleset: tournament.ruleset,
            notes: tournament.notes ?? null,
            status: tournament.status,
            smoothcompUrl: tournament.smoothcompUrl ?? null,
          }} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {RULESET_LABEL[tournament.ruleset] ?? tournament.ruleset}
          {tournament.division ? ` · ${tournament.division}` : ''}
          {tournament.eventDate ? ` · ${new Date(tournament.eventDate).toLocaleDateString()}` : ''}
        </p>
      </div>

      <nav className="flex gap-1 border-b pb-0">
        {[
          { href: `/tournaments/${id}/opponents`, label: 'Opponents' },
          { href: `/tournaments/${id}/gameplan`, label: 'Gameplan' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-sm px-4 py-2 font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-foreground/30 transition-colors -mb-px"
          >
            {label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  )
}
