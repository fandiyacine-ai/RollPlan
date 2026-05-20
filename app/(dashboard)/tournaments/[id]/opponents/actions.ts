'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../../../lib/db'
import { tournaments, tournamentOpponents, videos, matches } from '../../../../../lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { inngest } from '../../../../../lib/inngest'
import { getOrCreateDbUserId } from '../../../../../lib/db/get-user'
import { checkMonthlyLimit } from '../../../../../lib/db/usage'
import { scrapeBracket, parseSmootcompBracketUrl } from '../../../../../lib/smoothcomp/scraper'

export async function addOpponent(tournamentId: string, formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) throw new Error('Opponent name is required')

  await db.insert(tournamentOpponents).values({
    tournamentId,
    opponentLabel: name,
    seedingNotes: (formData.get('notes') as string)?.trim() || null,
  })

  revalidatePath(`/tournaments/${tournamentId}/opponents`)
}

export async function submitScoutUrls(tournamentId: string, opponentId: string, formData: FormData) {
  const rawUrls = (formData.get('urls') as string) ?? ''
  const urls = rawUrls
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0)

  if (urls.length === 0) throw new Error('At least one URL is required')
  if (urls.length > 10) throw new Error('Maximum 10 URLs per submission')

  const opponent = await db.query.tournamentOpponents.findFirst({
    where: (t, { eq }) => eq(t.id, opponentId),
  })
  if (!opponent) throw new Error('Opponent not found')

  const athleteName = opponent.opponentLabel
  const format = (formData.get('format') as string) || 'gi'
  const appearanceHint = (formData.get('appearanceHint') as string)?.trim() || undefined

  const userId = await getOrCreateDbUserId()

  const usage = await checkMonthlyLimit(userId)
  if (!usage.allowed) {
    throw new Error(`You've used all ${usage.limit} free analyses for this month. Upgrade to continue.`)
  }

  const skippedUrls: string[] = []

  for (const url of urls) {
    try { new URL(url) } catch { throw new Error(`Invalid URL: ${url}`) }

    // Prevent duplicate scans: skip if this URL is already queued or analysed for this opponent
    const existing = await db.query.videos.findFirst({
      where: (v) => and(eq(v.publicUrl, url), eq(v.tournamentOpponentId, opponentId)),
    })
    if (existing && existing.status !== 'failed') {
      skippedUrls.push(url)
      continue
    }

    const [video] = await db.insert(videos).values({
      userId,
      r2Key: `url/${Date.now()}-${Math.random().toString(36).slice(2)}`,
      originalFilename: url,
      contentType: 'video/mp4',
      sizeBytes: 0,
      sourceType: 'opponent',
      publicUrl: url,
      status: 'uploaded',
      tournamentOpponentId: opponentId,
    }).returning()

    try {
      await inngest.send({
        name: 'url/submitted',
        data: {
          videoId: video.id,
          userId,
          athleteName,
          format,
          sourceType: 'opponent',
          tournamentOpponentId: opponentId,
          appearanceHint,
        },
      })
    } catch {
      // Inngest not configured — record created but scan won't start
    }
  }

  if (skippedUrls.length > 0 && skippedUrls.length === urls.length) {
    throw new Error(
      `${skippedUrls.length === 1 ? 'This URL has' : 'All URLs have'} already been submitted for ${athleteName}. Delete the existing footage first if you want to re-scan.`
    )
  }

  revalidatePath(`/tournaments/${tournamentId}/opponents`)
}

// Scrape the tournament's Smoothcomp bracket and correct match resultWinner values
// where the bracket result disagrees with what the LLM extracted.
export async function syncBracketResults(tournamentId: string): Promise<{ updated: number; error?: string }> {
  try {
    const tournament = await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
    })
    if (!tournament?.smoothcompUrl) return { updated: 0, error: 'No Smoothcomp URL linked to this tournament' }
    if (!parseSmootcompBracketUrl(tournament.smoothcompUrl)) {
      return { updated: 0, error: 'A specific bracket URL is required (smoothcomp.com/en/event/…/bracket/…). Edit the tournament to add it.' }
    }

    const bracket = await scrapeBracket(tournament.smoothcompUrl)
    if (!bracket) return { updated: 0, error: 'Failed to load bracket page' }
    if (!bracket.bracketIsPublished) return { updated: 0, error: 'Bracket is not published yet' }

    const opponents = await db.query.tournamentOpponents.findMany({
      where: and(
        eq(tournamentOpponents.tournamentId, tournamentId),
        // Only opponents with a known Smoothcomp athlete ID can be cross-checked
      ),
    })

    let updated = 0

    for (const opp of opponents) {
      // Find all bracket matches involving this opponent, matched by smoothcompAthleteId or name
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
        if (!bm.winnerAthleteId && !bm.athlete1 && !bm.athlete2) continue

        // Determine if this opponent (the scouted athlete) won or lost
        const oppIsAthlete1 = bm.athlete1?.smoothcompAthleteId === opp.smoothcompAthleteId ||
          bm.athlete1?.name.toLowerCase() === opp.opponentLabel.toLowerCase()
        const oppSmId = oppIsAthlete1 ? bm.athlete1?.smoothcompAthleteId : bm.athlete2?.smoothcompAthleteId
        const oppName = oppIsAthlete1 ? bm.athlete1?.name : bm.athlete2?.name

        // The other athlete in the bracket match is who our user competed against
        const theirOpponentName = oppIsAthlete1 ? bm.athlete2?.name : bm.athlete1?.name
        const theirOpponentSmId = oppIsAthlete1 ? bm.athlete2?.smoothcompAthleteId : bm.athlete1?.smoothcompAthleteId

        if (!theirOpponentName && !theirOpponentSmId) continue

        // Did the scouted opponent (from our user's perspective) win this bracket match?
        const scoutedOpponentWon = bm.winnerAthleteId
          ? bm.winnerAthleteId === oppSmId
          : false

        // From user's perspective: if the scouted opponent won → resultWinner = 'opponent'
        const correctWinner = scoutedOpponentWon ? 'opponent' : 'user'
        const correctMethod = bm.method ?? null
        const correctTechnique = bm.technique ?? null

        // Find DB matches for this opponent where opponentLabel fuzzy-matches the bracket opponent
        const opponentMatches = await db.query.matches.findMany({
          where: eq(matches.tournamentOpponentId, opp.id),
        })

        for (const m of opponentMatches) {
          if (m.status !== 'analysed') continue

          // Only update if the match opponent label matches the bracket's other athlete
          const matchOpponent = m.opponentLabel?.toLowerCase() ?? ''
          const bracketOpponent = theirOpponentName?.toLowerCase() ?? ''
          if (
            bracketOpponent &&
            !matchOpponent.includes(bracketOpponent) &&
            !bracketOpponent.includes(matchOpponent)
          ) continue

          if (m.resultWinner === correctWinner && m.resultMethod === correctMethod) continue

          await db.update(matches).set({
            resultWinner: correctWinner,
            ...(correctMethod ? { resultMethod: correctMethod } : {}),
            ...(correctTechnique ? { resultTechnique: correctTechnique } : {}),
          }).where(eq(matches.id, m.id))

          updated++
        }
      }
    }

    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return { updated }
  } catch (err) {
    return { updated: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteOpponent(opponentId: string, tournamentId: string): Promise<{ error?: string }> {
  try {
    await db.delete(tournamentOpponents).where(eq(tournamentOpponents.id, opponentId))
    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateOpponent(opponentId: string, tournamentId: string, formData: FormData): Promise<void> {
  const name = (formData.get('name') as string)?.trim()
  if (!name) throw new Error('Opponent name is required')

  await db.update(tournamentOpponents).set({
    opponentLabel: name,
    seedingNotes: (formData.get('notes') as string)?.trim() || null,
  }).where(eq(tournamentOpponents.id, opponentId))

  revalidatePath(`/tournaments/${tournamentId}/opponents`)
}

export async function fetchBracketAthletes(tournamentId: string): Promise<{
  athletes: Array<{ name: string; smoothcompAthleteId: string; profileUrl: string }>
  bracketIsPublished: boolean
  error?: string
}> {
  try {
    const tournament = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId) })
    if (!tournament?.smoothcompUrl) return { athletes: [], bracketIsPublished: false, error: 'No bracket URL linked to this tournament' }
    if (!parseSmootcompBracketUrl(tournament.smoothcompUrl)) {
      return { athletes: [], bracketIsPublished: false, error: 'A specific bracket URL is required (smoothcomp.com/en/event/…/bracket/…)' }
    }

    const bracket = await scrapeBracket(tournament.smoothcompUrl)
    if (!bracket) return { athletes: [], bracketIsPublished: false, error: 'Failed to load the bracket page' }
    if (!bracket.bracketIsPublished) return { athletes: [], bracketIsPublished: false }

    return { athletes: bracket.athletes, bracketIsPublished: true }
  } catch (err) {
    return { athletes: [], bracketIsPublished: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function importSelectedOpponents(
  tournamentId: string,
  athletes: Array<{ name: string; smoothcompAthleteId: string; profileUrl: string }>
): Promise<{ count: number; error?: string }> {
  try {
    if (athletes.length === 0) return { count: 0 }

    // Skip athletes already in the tournament
    const existing = await db.select({ sid: tournamentOpponents.smoothcompAthleteId })
      .from(tournamentOpponents)
      .where(eq(tournamentOpponents.tournamentId, tournamentId))

    const existingIds = new Set(existing.map(e => e.sid).filter(Boolean))

    const toInsert = athletes.filter(a => !existingIds.has(a.smoothcompAthleteId))
    if (toInsert.length === 0) return { count: 0 }

    await db.insert(tournamentOpponents).values(
      toInsert.map(a => ({
        tournamentId,
        opponentLabel: a.name,
        smoothcompAthleteId: a.smoothcompAthleteId,
        smoothcompProfileUrl: a.profileUrl,
        footageStatus: 'pending' as const,
      }))
    )

    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return { count: toInsert.length }
  } catch (err) {
    return { count: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
