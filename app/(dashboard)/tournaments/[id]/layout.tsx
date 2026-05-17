import { db } from '../../../../lib/db'
import { tournaments } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'

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
  const tournament = await db.query.tournaments.findFirst({ where: eq(tournaments.id, id) })
  if (!tournament) notFound()

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/tournaments" className="text-xs text-muted-foreground hover:text-foreground inline-block mb-3">
          ← Tournaments
        </Link>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
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
