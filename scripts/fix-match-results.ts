import { db } from '../lib/db'
import { matches, tournamentOpponents } from '../lib/db/schema'
import { eq, ilike, inArray, and } from 'drizzle-orm'

async function main() {
  const opps = await db.select({ id: tournamentOpponents.id })
    .from(tournamentOpponents)
    .where(ilike(tournamentOpponents.opponentLabel, '%dario%'))

  const oppIds = opps.map(o => o.id)
  if (oppIds.length === 0) { console.log('No Dario opponent found'); return }

  // Revert Toni Holm back to AI-extracted values so re-scan can overwrite correctly
  const toni = await db.update(matches)
    .set({ resultWinner: 'opponent', resultMethod: 'points' })
    .where(and(
      inArray(matches.tournamentOpponentId, oppIds),
      ilike(matches.opponentLabel, '%toni holm%'),
    ))
    .returning({ id: matches.id, opponentLabel: matches.opponentLabel, resultWinner: matches.resultWinner, resultMethod: matches.resultMethod })

  console.log('Reverted Toni Holm:', JSON.stringify(toni, null, 2))
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
