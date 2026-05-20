import { db } from '../lib/db'
import { matches, videos, tournamentOpponents } from '../lib/db/schema'
import { eq, ilike, like, inArray, and } from 'drizzle-orm'

async function main() {
  // Find Dario's tournament opponent record(s)
  const opps = await db.select({ id: tournamentOpponents.id, label: tournamentOpponents.opponentLabel })
    .from(tournamentOpponents)
    .where(ilike(tournamentOpponents.opponentLabel, '%dario%'))

  console.log('Opponents found:', opps)
  if (opps.length === 0) { console.log('No Dario opponent found'); return }

  const oppIds = opps.map(o => o.id)

  // Find all matches for Dario (cascade deletes segments/events/insights)
  const darioMatches = await db.select({ id: matches.id, opponentLabel: matches.opponentLabel, videoId: matches.videoId })
    .from(matches)
    .where(inArray(matches.tournamentOpponentId, oppIds))

  console.log('Matches to delete:', darioMatches.map(m => `${m.id} vs ${m.opponentLabel}`))

  if (darioMatches.length === 0) {
    console.log('No matches found — nothing to delete')
  } else {
    const deleted = await db.delete(matches)
      .where(inArray(matches.tournamentOpponentId, oppIds))
      .returning({ id: matches.id, opponentLabel: matches.opponentLabel })
    console.log('Deleted matches:', deleted)
  }

  // Find parent videos associated with Dario's opponent (not chunks)
  const parentVideos = await db.select({ id: videos.id, r2Key: videos.r2Key, status: videos.status })
    .from(videos)
    .where(and(
      inArray(videos.tournamentOpponentId, oppIds),
      eq(videos.status, 'analysed'),
    ))

  console.log('Parent videos to reset:', parentVideos)

  // Delete chunk videos for each parent
  for (const pv of parentVideos) {
    const deletedChunks = await db.delete(videos)
      .where(like(videos.r2Key, `chunk/${pv.id}/%`))
      .returning({ id: videos.id, r2Key: videos.r2Key })
    console.log(`Deleted ${deletedChunks.length} chunks for parent ${pv.id}`)
  }

  // Reset parent video status to uploaded so re-scan can run
  if (parentVideos.length > 0) {
    const resetParents = await db.update(videos)
      .set({ status: 'uploaded' })
      .where(inArray(videos.id, parentVideos.map(v => v.id)))
      .returning({ id: videos.id, r2Key: videos.r2Key, status: videos.status })
    console.log('Reset parent videos:', resetParents)
  }

  console.log('\nDone — re-run the scan from the UI to reprocess.')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
