import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  await db.update(tournamentOpponents)
    .set({ smoothcompWins: null, smoothcompLosses: null, smoothcompFedUrl: null })
    .where(eq(tournamentOpponents.opponentLabel, 'Yacine Fandi'))
  console.log('Cleared wrong Smoothcomp data for Yacine Fandi')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
