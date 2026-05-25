import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { inArray } from 'drizzle-orm'

// Clear wrong Smoothcomp W/L data that came from unverified profiles
const CLEAR_SC = ['Yacine Fandi', 'Nihate Pahati']

async function main() {
  const opps = await db.select({ id: tournamentOpponents.id, label: tournamentOpponents.opponentLabel })
    .from(tournamentOpponents)
    .where(inArray(tournamentOpponents.opponentLabel, CLEAR_SC))

  for (const opp of opps) {
    await db.update(tournamentOpponents)
      .set({
        smoothcompAthleteId: null,
        smoothcompProfileUrl: null,
        smoothcompFedUrl: null,
        smoothcompWins: null,
        smoothcompLosses: null,
      })
      .where(inArray(tournamentOpponents.id, [opp.id]))
    console.log(`Cleared SC data for ${opp.label}`)
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
