import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
async function main() {
  const rows = await db.select({
    name: tournamentOpponents.opponentLabel,
    ajpW: tournamentOpponents.ajpWins,
    ajpL: tournamentOpponents.ajpLosses,
    ajpUrl: tournamentOpponents.smoothcompProfileUrl,
    scW: tournamentOpponents.smoothcompWins,
    scL: tournamentOpponents.smoothcompLosses,
    scUrl: tournamentOpponents.smoothcompFedUrl,
    ibW: tournamentOpponents.ibjjfWins,
    ibL: tournamentOpponents.ibjjfLosses,
    ibUrl: tournamentOpponents.ibjjfProfileUrl,
  }).from(tournamentOpponents)
  for (const r of rows) {
    console.log(r.name)
    if (r.ajpW !== null) console.log('  AJP:', r.ajpW + 'W/' + r.ajpL + 'L', r.ajpUrl ?? '')
    if (r.scW !== null) console.log('  SC: ', r.scW + 'W/' + r.scL + 'L', r.scUrl ?? '')
    if (r.ibW !== null) console.log('  IBJ:', r.ibW + 'W/' + r.ibL + 'L', r.ibUrl ?? '')
    if (r.ajpW === null && r.scW === null && r.ibW === null) console.log('  no data')
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
