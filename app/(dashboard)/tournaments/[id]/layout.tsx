import { db } from '../../../../lib/db'
import { tournaments } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EditTournamentButton } from '../create-form'
import { TournamentNav } from './tournament-nav'

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
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/tournaments" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50 hover:text-muted-foreground inline-block mb-3 transition-colors">
          ← Tournaments
        </Link>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-black tracking-tight uppercase">{tournament.name}</h1>
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
        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold">{RULESET_LABEL[tournament.ruleset] ?? tournament.ruleset}</span>
          {tournament.division && <><span className="opacity-30">·</span><span>{tournament.division}</span></>}
          {tournament.eventDate && <><span className="opacity-30">·</span><span>{new Date(tournament.eventDate).toLocaleDateString()}</span></>}
        </p>
      </div>

      <TournamentNav id={id} />

      {children}
    </div>
  )
}
