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
      const parsed = parseSmootcompBracketUrl(rawScUrl)
      if (!parsed) {
        return { error: 'Invalid Smoothcomp URL — paste the bracket URL from your division page (e.g. smoothcomp.com/en/event/…/bracket/…)' }
      }
      smoothcompUrl = rawScUrl
      smoothcompEventId = parsed.eventId
    }

    const [tour] = await db.insert(tournaments).values({
      userId,
      name,
      eventDate: (formData.get('eventDate') as string) || null,
      division: (formData.get('division') as string)?.trim() || null,
      ruleset: (formData.get('ruleset') as string) || 'ibjjf',
      notes: (formData.get('notes') as string)?.trim() || null,
      smoothcompUrl,
      smoothcompEventId,
    }).returning()

    revalidatePath('/tournaments')
    return { tournamentId: tour.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
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
