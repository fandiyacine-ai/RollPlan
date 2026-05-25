import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { inArray } from 'drizzle-orm'
import { inngest } from '../lib/inngest'

const NAMES = ['Nihate Pahati', 'Milla Bahia', 'Zakriya Ismail Fandi']

async function main() {
  const opps = await db.select({
    id: tournamentOpponents.id,
    label: tournamentOpponents.opponentLabel,
    smoothcompAthleteId: tournamentOpponents.smoothcompAthleteId,
  }).from(tournamentOpponents).where(inArray(tournamentOpponents.opponentLabel, NAMES))

  console.log('Found:', opps.map(o => `${o.label} (${o.smoothcompAthleteId ?? 'no ID'})`))

  // Clear Nihate's wrong child profile so the job searches fresh
  const nihate = opps.find(o => o.label === 'Nihate Pahati')
  if (nihate?.smoothcompAthleteId) {
    await db.update(tournamentOpponents)
      .set({ smoothcompAthleteId: null, smoothcompProfileUrl: null })
      .where(inArray(tournamentOpponents.id, [nihate.id]))
    console.log('Cleared Nihate smoothcompAthleteId')
  }

  for (const opp of opps) {
    const result = await inngest.send({
      name: 'opponent-intel/build.run',
      data: { opponentId: opp.id, athleteName: opp.label, tournamentId: '', userId: '' },
    })
    console.log('Fired for', opp.label, ':', result.ids[0])
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
