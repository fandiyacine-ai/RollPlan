import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
async function main() {
  const rows = await db.select({ name: tournamentOpponents.opponentLabel, best: tournamentOpponents.ibjjfBestResult }).from(tournamentOpponents)
  for (const r of rows) console.log(r.name, '→', r.best ?? '(none)')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
