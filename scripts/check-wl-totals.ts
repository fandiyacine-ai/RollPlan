import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'

async function main() {
  const opps = await db.select({
    label: tournamentOpponents.opponentLabel,
    smoothcompAthleteId: tournamentOpponents.smoothcompAthleteId,
    ajpWins: tournamentOpponents.ajpWins,
    ajpLosses: tournamentOpponents.ajpLosses,
    ajpProfileUrl: tournamentOpponents.smoothcompProfileUrl,
    smoothcompWins: tournamentOpponents.smoothcompWins,
    smoothcompLosses: tournamentOpponents.smoothcompLosses,
    smoothcompFedUrl: tournamentOpponents.smoothcompFedUrl,
    ibjjfWins: tournamentOpponents.ibjjfWins,
    ibjjfLosses: tournamentOpponents.ibjjfLosses,
    ibjjfProfileUrl: tournamentOpponents.ibjjfProfileUrl,
  }).from(tournamentOpponents)

  for (const o of opps) {
    console.log(`\n${o.label} (AJP ID: ${o.smoothcompAthleteId ?? 'none'})`)
    if (o.ajpWins != null) console.log(`  AJP: ${o.ajpWins}W/${o.ajpLosses ?? 0}L → ${o.ajpProfileUrl}`)
    if (o.smoothcompWins != null) console.log(`  SC: ${o.smoothcompWins}W/${o.smoothcompLosses ?? 0}L → ${o.smoothcompFedUrl}`)
    if (o.ibjjfWins != null) console.log(`  IBJJF: ${o.ibjjfWins}W/${o.ibjjfLosses ?? 0}L → ${o.ibjjfProfileUrl}`)
    if (o.ajpWins == null && o.smoothcompWins == null && o.ibjjfWins == null) console.log('  (no W/L data yet)')
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
