import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { ne } from 'drizzle-orm'

async function main() {
  const result = await db.update(tournamentOpponents)
    .set({
      smoothcompAthleteId: null,
      smoothcompProfileUrl: null,
      smoothcompFedUrl: null,
      smoothcompWins: null,
      smoothcompLosses: null,
      ajpWins: null,
      ajpLosses: null,
      ibjjfWins: null,
      ibjjfLosses: null,
      ibjjfProfileUrl: null,
      ibjjfBestResult: null,
    })
    .where(ne(tournamentOpponents.opponentLabel, 'Nihate Pahati'))
  console.log('Reset complete:', result)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
