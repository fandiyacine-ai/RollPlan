import { db } from '../db'
import { tournaments, tournamentOpponents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { scrapeBracket, parseSmootcompBracketUrl } from './scraper'

// Cross-references a scraped bracket against a tournament's scouted opponents
// and writes a confirmed userResult ('win'/'loss' + method/technique) only when
// it can prove the user actually fought that specific person — never inferred
// from a shared division alone. This confirmed result is the trust anchor for
// "earned post-competition connections" (see ROADMAP): two RollPlan users only
// get offered a connection when one side has *proof* they faced each other.
//
// Shared by the manual "Sync results" button (opponents/actions.ts) and the
// automated post-event job (jobs/smoothcomp-sync-bracket-results.ts).
export async function syncBracketResultsForTournament(tournamentId: string): Promise<{ updated: number; error?: string }> {
  try {
    const tournament = await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
    })
    if (!tournament?.smoothcompUrl) return { updated: 0, error: 'No Smoothcomp URL linked to this tournament' }
    if (!parseSmootcompBracketUrl(tournament.smoothcompUrl)) {
      return { updated: 0, error: 'A specific bracket URL is required (smoothcomp.com/en/event/…/bracket/…)' }
    }

    const bracket = await scrapeBracket(tournament.smoothcompUrl)
    if (!bracket) return { updated: 0, error: 'Failed to load bracket page' }
    if (!bracket.bracketIsPublished) return { updated: 0, error: 'Bracket is not published yet' }

    const opponents = await db.query.tournamentOpponents.findMany({
      where: eq(tournamentOpponents.tournamentId, tournamentId),
    })

    // Build a set of all scouted opponent names (lower-case) and smoothcomp IDs
    // to filter out bracket matches that are between two scouted opponents
    // (those matches don't involve the user — the user only fights one at a time)
    const scoutedNames = new Set(opponents.map(o => o.opponentLabel.toLowerCase()))
    const scoutedSmIds = new Set(opponents.map(o => o.smoothcompAthleteId).filter(Boolean) as string[])

    let updated = 0

    for (const opp of opponents) {
      // Skip opponents that already have a manually-set result
      if (opp.userResult) continue

      const bracketMatches = bracket.matches.filter(m =>
        (opp.smoothcompAthleteId && (
          m.athlete1?.smoothcompAthleteId === opp.smoothcompAthleteId ||
          m.athlete2?.smoothcompAthleteId === opp.smoothcompAthleteId
        )) || (
          m.athlete1?.name.toLowerCase() === opp.opponentLabel.toLowerCase() ||
          m.athlete2?.name.toLowerCase() === opp.opponentLabel.toLowerCase()
        )
      )

      for (const bm of bracketMatches) {
        if (!bm.winnerAthleteId) continue

        const oppIsAthlete1 = bm.athlete1?.smoothcompAthleteId === opp.smoothcompAthleteId ||
          bm.athlete1?.name.toLowerCase() === opp.opponentLabel.toLowerCase()
        const oppSmId = oppIsAthlete1 ? bm.athlete1?.smoothcompAthleteId : bm.athlete2?.smoothcompAthleteId

        const otherAthlete = oppIsAthlete1 ? bm.athlete2 : bm.athlete1
        if (!otherAthlete) continue

        const otherIsScoutedOpponent =
          (otherAthlete.smoothcompAthleteId && scoutedSmIds.has(otherAthlete.smoothcompAthleteId)) ||
          scoutedNames.has(otherAthlete.name.toLowerCase())
        const otherIsThisOpponent =
          (opp.smoothcompAthleteId && otherAthlete.smoothcompAthleteId === opp.smoothcompAthleteId) ||
          otherAthlete.name.toLowerCase() === opp.opponentLabel.toLowerCase()

        if (otherIsScoutedOpponent && !otherIsThisOpponent) continue

        const scoutedOpponentWon = bm.winnerAthleteId === oppSmId
        const userResult = scoutedOpponentWon ? 'loss' : 'win'
        const userResultMethod = bm.method ?? null
        const userResultTechnique = bm.technique ?? null

        await db.update(tournamentOpponents).set({
          userResult,
          ...(userResultMethod ? { userResultMethod } : {}),
          ...(userResultTechnique ? { userResultTechnique } : {}),
        }).where(eq(tournamentOpponents.id, opp.id))

        updated++
        break // one result per opponent
      }
    }

    return { updated }
  } catch (err) {
    return { updated: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
