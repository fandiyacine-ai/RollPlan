'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../lib/db'
import { tournaments } from '../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'
import { parseSmootcompBracketUrl, parseSmootcompEventUrl } from '../../../lib/smoothcomp/scraper'

export async function createTournament(
  formData: FormData
): Promise<{ error?: string; tournamentId?: string }> {
  try {
    const userId = await getOrCreateDbUserId()

    const name = (formData.get('name') as string)?.trim()
    if (!name) return { error: 'Tournament name is required' }

    const rawScUrl = (formData.get('smoothcompUrl') as string)?.trim() || null
    let smoothcompUrl: string | null = null
    let smoothcompEventId: string | null = null

    if (rawScUrl) {
      // Accept either a specific bracket URL (/event/xxx/bracket/yyy)
      // or any event URL (/event/xxx/...) — bracket ID is not required at creation time
      const bracketParsed = parseSmootcompBracketUrl(rawScUrl)
      const eventId = bracketParsed?.eventId ?? parseSmootcompEventUrl(rawScUrl)
      if (!eventId) {
        return { error: 'Invalid Smoothcomp URL — paste any URL from your event page on smoothcomp.com' }
      }
      smoothcompUrl = rawScUrl
      smoothcompEventId = eventId
    }

    const rawCanonicalId = (formData.get('canonicalTournamentId') as string)?.trim() || null

    const [tour] = await db.insert(tournaments).values({
      userId,
      name,
      eventDate: (formData.get('eventDate') as string) || null,
      division: (formData.get('division') as string)?.trim() || null,
      ruleset: (formData.get('ruleset') as string) || 'ibjjf',
      notes: (formData.get('notes') as string)?.trim() || null,
      smoothcompUrl,
      smoothcompEventId,
      canonicalTournamentId: rawCanonicalId,
    }).returning()

    revalidatePath('/tournaments')
    return { tournamentId: tour.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function updateTournament(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()

    const name = (formData.get('name') as string)?.trim()
    if (!name) return { error: 'Tournament name is required' }

    const rawScUrl = (formData.get('smoothcompUrl') as string)?.trim() || null
    let smoothcompUrl: string | null = null
    let smoothcompEventId: string | null = null

    if (rawScUrl) {
      const bracketParsed = parseSmootcompBracketUrl(rawScUrl)
      const eventId = bracketParsed?.eventId ?? parseSmootcompEventUrl(rawScUrl)
      if (!eventId) {
        return { error: 'Invalid Smoothcomp URL — paste any URL from your event page on smoothcomp.com' }
      }
      smoothcompUrl = rawScUrl
      smoothcompEventId = eventId
    }

    await db
      .update(tournaments)
      .set({
        name,
        eventDate: (formData.get('eventDate') as string) || null,
        division: (formData.get('division') as string)?.trim() || null,
        ruleset: (formData.get('ruleset') as string) || 'ibjjf',
        notes: (formData.get('notes') as string)?.trim() || null,
        status: (formData.get('status') as string) || 'upcoming',
        smoothcompUrl,
        smoothcompEventId,
      })
      .where(and(eq(tournaments.id, id), eq(tournaments.userId, userId)))

    revalidatePath('/tournaments')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function saveTournamentOutcome(
  id: string,
  outcome: string,
  notes: string,
): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    await db
      .update(tournaments)
      .set({ outcome, postEventNotes: notes || null, status: 'completed' })
      .where(and(eq(tournaments.id, id), eq(tournaments.userId, userId)))
    revalidatePath(`/tournaments/${id}/opponents`)
    revalidatePath('/tournaments')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteTournament(id: string): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    await db.delete(tournaments).where(and(eq(tournaments.id, id), eq(tournaments.userId, userId)))
    revalidatePath('/tournaments')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
