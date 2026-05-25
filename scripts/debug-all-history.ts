import { db } from '../lib/db'
import { tournamentOpponents, athleteCompetitionHistory } from '../lib/db/schema'

async function main() {
  const opps = await db.select({
    id: tournamentOpponents.id,
    label: tournamentOpponents.opponentLabel,
    smoothcompAthleteId: tournamentOpponents.smoothcompAthleteId,
  }).from(tournamentOpponents).limit(20)
  console.log('All opponents:', JSON.stringify(opps, null, 2))

  const hist = await db.select({
    oppId: athleteCompetitionHistory.tournamentOpponentId,
    fed: athleteCompetitionHistory.federation,
    event: athleteCompetitionHistory.eventName,
  }).from(athleteCompetitionHistory).limit(30)
  console.log('All history:', JSON.stringify(hist, null, 2))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
