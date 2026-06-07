'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../../../lib/db'
import { tournaments, tournamentOpponents, videos, matches, gameplans } from '../../../../../lib/db/schema'
import { eq, and, inArray, like, sql, ne, notInArray, isNotNull } from 'drizzle-orm'
import { cloneOpponentMatches } from '../../../../../lib/db/clone-analysis'
import { inngest } from '../../../../../lib/inngest'
import { getOrCreateDbUserId } from '../../../../../lib/db/get-user'
import { checkMonthlyLimit } from '../../../../../lib/db/usage'
import { notifyScoutedAthletes } from '../../../../../lib/db/scouted'
import { scrapeBracket, parseSmootcompBracketUrl, parseSmootcompEventUrl } from '../../../../../lib/smoothcomp/scraper'
import { syncBracketResultsForTournament } from '../../../../../lib/smoothcomp/sync-results'
import { isYouTubeUrl, normalizeYouTubeUrl } from '../../../../../lib/gemini-video'

function parseYouTubeTimestamp(url: string): number {
  try {
    const t = new URL(url).searchParams.get('t')
    if (!t) return 0
    const h = t.match(/(\d+)h/)
    const m = t.match(/(\d+)m/)
    const s = t.match(/(\d+)s/)
    if (h || m || s) {
      return (parseInt(h?.[1] ?? '0') || 0) * 3600
           + (parseInt(m?.[1] ?? '0') || 0) * 60
           + (parseInt(s?.[1] ?? '0') || 0)
    }
    const n = parseInt(t)
    return isNaN(n) ? 0 : n
  } catch { return 0 }
}
import { cloneVideoMatches } from '../../../../../lib/db/clone-analysis'

type AddOpponentResult =
  | { ok: true }
  | { ok: false; type: 'same_tournament' }
  | { ok: false; type: 'dupe'; tournamentName: string }
  | { ok: false; type: 'error'; message: string }

export async function addOpponent(
  tournamentId: string,
  formData: FormData,
): Promise<AddOpponentResult> {
  const name = (formData.get('name') as string)?.trim()
  const force = formData.get('force') === 'true'
  if (!name) return { ok: false, type: 'error', message: 'Opponent name is required' }

  try {
    // Hard block: same name in same tournament (never overridable)
    const sameTournamentDupe = await db
      .select({ id: tournamentOpponents.id })
      .from(tournamentOpponents)
      .where(and(
        sql`lower(${tournamentOpponents.opponentLabel}) = lower(${name})`,
        eq(tournamentOpponents.tournamentId, tournamentId),
      ))
      .limit(1)
    if (sameTournamentDupe.length > 0) {
      return { ok: false, type: 'same_tournament' }
    }

    if (!force) {
      const userId = await getOrCreateDbUserId()
      const dupe = await db
        .select({ tournamentName: tournaments.name })
        .from(tournamentOpponents)
        .innerJoin(tournaments, eq(tournaments.id, tournamentOpponents.tournamentId))
        .where(and(
          sql`lower(${tournamentOpponents.opponentLabel}) = lower(${name})`,
          ne(tournamentOpponents.tournamentId, tournamentId),
          eq(tournaments.userId, userId),
        ))
        .limit(1)

      if (dupe.length > 0) {
        return { ok: false, type: 'dupe', tournamentName: dupe[0].tournamentName }
      }
    }

    const [inserted] = await db.insert(tournamentOpponents).values({
      tournamentId,
      opponentLabel: name,
      seedingNotes: (formData.get('notes') as string)?.trim() || null,
    }).returning({ id: tournamentOpponents.id })

    // Fire multi-federation intel search for any manually added opponent
    if (inserted) {
      try {
        const userId = await getOrCreateDbUserId()
        await inngest.send({
          name: 'opponent-intel/build.run',
          data: {
            opponentId: inserted.id,
            athleteName: name,
            tournamentId,
            userId,
          },
        })
      } catch { /* Inngest not configured — opponent created, intel won't auto-run */ }
    }

    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return { ok: true }
  } catch (err) {
    return { ok: false, type: 'error', message: err instanceof Error ? err.message : 'Failed to add opponent' }
  }
}

export async function rescanVideo(videoId: string, tournamentId: string): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()

    const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
    if (!video || !video.tournamentOpponentId) return { error: 'Video not found' }

    const opponent = await db.query.tournamentOpponents.findFirst({
      where: eq(tournamentOpponents.id, video.tournamentOpponentId),
    })
    if (!opponent) return { error: 'Opponent not found' }

    const tournament = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId) })
    const ruleset = tournament?.ruleset ?? 'ibjjf'
    const format: 'gi' | 'no_gi' = ['adcc', 'ebi', 'nogi', 'no_gi'].includes(ruleset) ? 'no_gi' : 'gi'

    // Delete all existing matches for this video so the scan job doesn't hit the
    // idempotency guard and re-uses the old (poor) analysis. Cascade deletes
    // position_segments, match_events, and insights for those matches automatically.
    await db.delete(matches).where(eq(matches.videoId, videoId))

    // Reset parent video
    await db.update(videos).set({ status: 'uploaded', failureReason: null }).where(eq(videos.id, videoId))

    // Remove stale chunk videos so they get re-created fresh
    await db.delete(videos).where(like(videos.r2Key, `chunk/${videoId}/%`))

    await inngest.send({
      name: 'url/submitted',
      data: {
        videoId: video.id,
        userId,
        athleteName: opponent.opponentLabel,
        format,
        sourceType: 'opponent',
        tournamentOpponentId: opponent.id,
      },
    })

    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function submitScoutUrls(
  tournamentId: string,
  opponentId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const rawUrls = (formData.get('urls') as string) ?? ''
    const urls = rawUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0)

    if (urls.length === 0) return { error: 'At least one URL is required' }
    if (urls.length > 10) return { error: 'Maximum 10 URLs per submission' }

    const opponent = await db.query.tournamentOpponents.findFirst({
      columns: { id: true, opponentLabel: true },
      where: (t, { eq }) => eq(t.id, opponentId),
    })
    if (!opponent) return { error: 'Opponent not found' }

    const athleteName = opponent.opponentLabel
    const format = (formData.get('format') as string) || 'gi'
    const appearanceHint = (formData.get('appearanceHint') as string)?.trim() || undefined

    const userId = await getOrCreateDbUserId()

    const usage = await checkMonthlyLimit(userId)
    if (!usage.allowed) {
      return { error: `You've used all ${usage.limit} free analyses — upgrade for unlimited` }
    }

    const skippedUrls: string[] = []

    for (const url of urls) {
      try { new URL(url) } catch { return { error: `Invalid URL: ${url}` } }

      // Extract &t= timestamp BEFORE normalization strips it — used as chunk offset hint
      const ytTimestampHint = isYouTubeUrl(url) ? parseYouTubeTimestamp(url) : 0
      const storedUrl = isYouTubeUrl(url) ? normalizeYouTubeUrl(url) : url

      // Prevent duplicate scans: skip if this URL is already analysed for this opponent.
      // Stuck records (uploaded/processing) are deleted so the user can re-submit without
      // needing to manually clean up after a cancelled or failed Inngest run.
      const existingRows = await db
        .select({ id: videos.id, status: videos.status })
        .from(videos)
        .where(and(eq(videos.publicUrl, storedUrl), eq(videos.tournamentOpponentId, opponentId)))
      const analysedRow = existingRows.find(r => r.status === 'analysed')
      if (analysedRow) {
        skippedUrls.push(url)
        continue
      }
      // Delete any stuck/failed rows for this URL+opponent before inserting fresh
      const staleIds = existingRows.map(r => r.id)
      if (staleIds.length > 0) {
        await db.delete(videos).where(inArray(videos.id, staleIds))
      }

      // URL dedup: if this YouTube URL was already analysed for ANY opponent cross-user,
      // clone the results silently — no Gemini call needed.
      if (isYouTubeUrl(storedUrl)) {
        const priorVideo = await db
          .select({ id: videos.id })
          .from(videos)
          .where(and(eq(videos.publicUrl, storedUrl), eq(videos.status, 'analysed'), isNotNull(videos.tournamentOpponentId)))
          .limit(1)
          .then(r => r[0] ?? null)
        if (priorVideo) {
          // Check if the prior video actually has analysed matches — if 0 matches, the athlete
          // wasn't found in that video, so cloning would produce a dead 'processing' stub.
          // Fall through to a fresh scan instead.
          const priorMatchCount = await db.select({ id: matches.id })
            .from(matches)
            .where(and(eq(matches.videoId, priorVideo.id), eq(matches.status, 'analysed')))
            .limit(1)
            .then(r => r.length)

          if (priorMatchCount > 0) {
            const [stubVideo] = await db.insert(videos).values({
              userId,
              r2Key: `url/${Date.now()}-${Math.random().toString(36).slice(2)}`,
              originalFilename: storedUrl,
              contentType: 'video/mp4',
              sizeBytes: 0,
              sourceType: 'opponent',
              publicUrl: storedUrl,
              status: 'processing',
              tournamentOpponentId: opponentId,
            }).returning()

            await cloneVideoMatches(priorVideo.id, stubVideo.id, opponentId, userId)
            continue
          }
          // priorMatchCount === 0: athlete not found in prior scan — do a fresh scan below
        }
      }

      const [video] = await db.insert(videos).values({
        userId,
        r2Key: `url/${Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalFilename: storedUrl,
        contentType: 'video/mp4',
        sizeBytes: 0,
        sourceType: 'opponent',
        publicUrl: storedUrl,
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
            ytTimestampHint: ytTimestampHint || undefined,
          },
        })
      } catch {
        // Inngest not configured — record created but scan won't start
      }
    }

    if (skippedUrls.length > 0 && skippedUrls.length === urls.length) {
      return {
        error: `${skippedUrls.length === 1 ? 'This URL has' : 'All URLs have'} already been submitted for ${athleteName}. Delete the existing footage first if you want to re-scan.`,
      }
    }

    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Submission failed' }
  }
}

// Scrape the tournament's Smoothcomp bracket and populate the user's result
// against each scouted opponent (stored on tournamentOpponents.userResult).
// Only writes to userResult when it is currently null — never overwrites manual entries.
export async function syncBracketResults(tournamentId: string): Promise<{ updated: number; error?: string }> {
  const result = await syncBracketResultsForTournament(tournamentId)
  if (!result.error) revalidatePath(`/tournaments/${tournamentId}/opponents`)
  return result
}

export async function saveOpponentResult(
  opponentId: string,
  tournamentId: string,
  userResult: 'win' | 'loss' | null,
  userResultMethod: string | null = null,
): Promise<{ error?: string }> {
  try {
    await db.update(tournamentOpponents).set({
      userResult,
      userResultMethod,
      userResultTechnique: null,
    }).where(eq(tournamentOpponents.id, opponentId))
    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteFootage(videoId: string, tournamentId: string): Promise<{ error?: string }> {
  try {
    await getOrCreateDbUserId()
    // Delete chunks first, then parent — matches cascade from videos
    await db.delete(videos).where(like(videos.r2Key, `chunk/${videoId}/%`))
    await db.delete(videos).where(eq(videos.id, videoId))
    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteOpponent(opponentId: string, tournamentId: string): Promise<{ error?: string }> {
  try {
    // gameplans.opponentId has no onDelete clause — delete it first or the FK blocks the delete.
    // planExecutions cascade from gameplans, so they're cleaned up automatically.
    await db.delete(gameplans).where(eq(gameplans.opponentId, opponentId))
    // Videos and their matches must be explicitly deleted: videos.tournamentOpponentId is
    // onDelete:'set null', so the opponent delete would orphan them instead of removing them.
    // Orphaned 'analysed' videos poison the cross-user YouTube dedup cache — the same URL
    // submitted for a re-added opponent would silently clone wrong results with no Inngest run.
    // matches.videoId is onDelete:'cascade', so deleting videos also removes their matches.
    await db.delete(videos).where(eq(videos.tournamentOpponentId, opponentId))
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

export async function linkBracketUrl(
  tournamentId: string,
  url: string,
): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    const trimmed = url.trim()
    const bracketParsed = parseSmootcompBracketUrl(trimmed)
    const eventId = bracketParsed?.eventId ?? parseSmootcompEventUrl(trimmed)
    if (!eventId) {
      return { error: 'Invalid Smoothcomp URL — paste any URL from your event page on smoothcomp.com' }
    }
    await db.update(tournaments).set({
      smoothcompUrl: trimmed,
      smoothcompEventId: eventId,
    }).where(and(eq(tournaments.id, tournamentId), eq(tournaments.userId, userId)))
    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
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

    // Fetch existing opponents for this tournament (id + athleteId + name)
    const existing = await db
      .select({
        id: tournamentOpponents.id,
        sid: tournamentOpponents.smoothcompAthleteId,
        name: tournamentOpponents.opponentLabel,
        footageStatus: tournamentOpponents.footageStatus,
      })
      .from(tournamentOpponents)
      .where(eq(tournamentOpponents.tournamentId, tournamentId))

    const existingByAthleteId = new Map(existing.filter(e => e.sid).map(e => [e.sid!, e]))
    const existingByNameLower = new Map(existing.map(e => [e.name.toLowerCase(), e]))

    // Separate into: already matched by athleteId, matched by name only (manually added), truly new
    const toLink: Array<{ existingId: string; athlete: typeof athletes[number]; needsDiscovery: boolean }> = []
    const toInsert: typeof athletes = []

    for (const a of athletes) {
      if (existingByAthleteId.has(a.smoothcompAthleteId)) continue // exact match, skip
      const nameMatch = existingByNameLower.get(a.name.toLowerCase())
      if (nameMatch) {
        // Manually-added row: link Smoothcomp data instead of creating a duplicate
        toLink.push({
          existingId: nameMatch.id,
          athlete: a,
          needsDiscovery: nameMatch.footageStatus === 'manual' || nameMatch.footageStatus === 'pending',
        })
      } else {
        toInsert.push(a)
      }
    }

    if (toInsert.length === 0 && toLink.length === 0) return { count: 0 }

    // Link Smoothcomp data onto existing manually-added opponents
    const userId = await getOrCreateDbUserId()
    for (const { existingId, athlete, needsDiscovery } of toLink) {
      if (needsDiscovery) {
        await db.update(tournamentOpponents).set({
          smoothcompAthleteId: athlete.smoothcompAthleteId,
          smoothcompProfileUrl: athlete.profileUrl,
          footageStatus: 'pending',
        }).where(eq(tournamentOpponents.id, existingId))
      } else {
        await db.update(tournamentOpponents).set({
          smoothcompAthleteId: athlete.smoothcompAthleteId,
          smoothcompProfileUrl: athlete.profileUrl,
        }).where(eq(tournamentOpponents.id, existingId))
      }

      if (needsDiscovery) {
        try {
          await inngest.send({
            name: 'smoothcomp/discover.footage',
            data: {
              tournamentId,
              opponentId: existingId,
              profileUrl: athlete.profileUrl,
              athleteId: athlete.smoothcompAthleteId,
              athleteName: athlete.name,
              userId,
            },
          })
          await db.update(tournamentOpponents)
            .set({ footageStatus: 'auto_queued' })
            .where(eq(tournamentOpponents.id, existingId))
        } catch { /* Inngest not configured */ }
      }
    }

    if (toInsert.length === 0) {
      notifyScoutedAthletes(userId, toLink.map(t => t.athlete.smoothcompAthleteId)).catch(() => {})
      return { count: 0 }
    }

    const inserted = await db.insert(tournamentOpponents).values(
      toInsert.map(a => ({
        tournamentId,
        opponentLabel: a.name,
        smoothcompAthleteId: a.smoothcompAthleteId,
        smoothcompProfileUrl: a.profileUrl,
        footageStatus: 'pending' as const,
      }))
    ).returning()

    // Phase 2: fire footage discovery + stat intel for each imported athlete
    for (const opp of inserted) {
      try {
        await inngest.send([
          ...(opp.smoothcompProfileUrl ? [{
            name: 'smoothcomp/discover.footage' as const,
            data: {
              tournamentId,
              opponentId: opp.id,
              profileUrl: opp.smoothcompProfileUrl,
              athleteId: opp.smoothcompAthleteId ?? '',
              athleteName: opp.opponentLabel,
              userId,
            },
          }] : []),
          {
            name: 'opponent-intel/build.run' as const,
            data: {
              opponentId: opp.id,
              athleteName: opp.opponentLabel,
              tournamentId,
              userId,
            },
          },
        ])
        if (opp.smoothcompProfileUrl) {
          await db.update(tournamentOpponents)
            .set({ footageStatus: 'auto_queued' })
            .where(eq(tournamentOpponents.id, opp.id))
        }
      } catch {
        // Inngest not configured — opponent created, discovery/intel won't auto-run
      }
    }

    notifyScoutedAthletes(userId, [
      ...toLink.map(t => t.athlete.smoothcompAthleteId),
      ...inserted.map(o => o.smoothcompAthleteId),
    ]).catch(() => {})

    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return { count: toInsert.length }
  } catch (err) {
    return { count: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function retriggerIntel(opponentId: string, tournamentId: string): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    const opponent = await db.query.tournamentOpponents.findFirst({
      where: eq(tournamentOpponents.id, opponentId),
    })
    if (!opponent) return { error: 'Opponent not found' }

    await inngest.send({
      name: 'opponent-intel/build.run',
      data: { opponentId, athleteName: opponent.opponentLabel, tournamentId, userId },
    })
    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// Returns the number of cross-user analysed matches available for each smoothcompAthleteId.
// Excludes matches already imported to the current user's opponents.
export async function getCommunityMatchCounts(
  smoothcompAthleteIds: string[],
  currentUserId: string,
  currentOpponentIds: string[],
): Promise<Record<string, number>> {
  if (smoothcompAthleteIds.length === 0) return {}

  // Opponent IDs owned by other users with these athlete IDs
  const otherOpponents = await db
    .select({ id: tournamentOpponents.id, athleteId: tournamentOpponents.smoothcompAthleteId })
    .from(tournamentOpponents)
    .innerJoin(tournaments, eq(tournaments.id, tournamentOpponents.tournamentId))
    .where(and(
      inArray(tournamentOpponents.smoothcompAthleteId, smoothcompAthleteIds),
      ne(tournaments.userId, currentUserId),
    ))

  if (otherOpponents.length === 0) return {}

  const otherOpponentIds = otherOpponents.map(o => o.id)

  // Count analysed matches for those opponents, excluding any already cloned to this user
  const rows = await db
    .select({ tournamentOpponentId: matches.tournamentOpponentId })
    .from(matches)
    .where(and(
      inArray(matches.tournamentOpponentId, otherOpponentIds),
      eq(matches.status, 'analysed'),
    ))

  // Build athleteId → count map
  const opponentToAthlete = new Map(otherOpponents.map(o => [o.id, o.athleteId!]))
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const athleteId = opponentToAthlete.get(row.tournamentOpponentId ?? '')
    if (athleteId) counts[athleteId] = (counts[athleteId] ?? 0) + 1
  }
  return counts
}

// Import all community-analysed matches for an opponent into this user's opponent.
// Deduplicates: won't clone if already imported (same sourceVideoId already present).
export async function importCommunityFootage(
  targetOpponentId: string,
  tournamentId: string,
): Promise<{ imported: number; error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()

    const targetOpponent = await db.query.tournamentOpponents.findFirst({
      where: eq(tournamentOpponents.id, targetOpponentId),
    })
    if (!targetOpponent?.smoothcompAthleteId) return { imported: 0, error: 'No Smoothcomp athlete ID on this opponent' }

    // Find source opponents (other users, same athlete ID)
    const sourceOpponents = await db
      .select({ id: tournamentOpponents.id })
      .from(tournamentOpponents)
      .innerJoin(tournaments, eq(tournaments.id, tournamentOpponents.tournamentId))
      .where(and(
        eq(tournamentOpponents.smoothcompAthleteId, targetOpponent.smoothcompAthleteId),
        ne(tournaments.userId, userId),
      ))

    if (sourceOpponents.length === 0) return { imported: 0 }

    // Get video IDs already imported to this opponent to avoid duplicates
    const existingVideoIds = await db
      .select({ videoId: matches.videoId })
      .from(matches)
      .where(eq(matches.tournamentOpponentId, targetOpponentId))
      .then(rows => new Set(rows.map(r => r.videoId)))

    let imported = 0
    for (const src of sourceOpponents) {
      // Find analysed matches not already present in target
      const srcMatches = await db
        .select().from(matches)
        .where(and(
          eq(matches.tournamentOpponentId, src.id),
          eq(matches.status, 'analysed'),
          notInArray(matches.videoId, existingVideoIds.size > 0 ? [...existingVideoIds] : ['__none__']),
        ))

      if (srcMatches.length === 0) continue
      const { cloned } = await cloneOpponentMatches(src.id, targetOpponentId, userId)
      imported += cloned
    }

    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return { imported }
  } catch (err) {
    return { imported: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
