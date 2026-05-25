import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'

async function main() {
  const rows = await db.select({
    label: tournamentOpponents.opponentLabel,
    ajpWins: tournamentOpponents.ajpWins,
    scId: tournamentOpponents.smoothcompAthleteId,
    ibjjfUrl: tournamentOpponents.ibjjfProfileUrl,
  }).from(tournamentOpponents)
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
