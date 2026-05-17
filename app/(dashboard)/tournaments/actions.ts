'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../lib/db'
import { tournaments } from '../../../lib/db/schema'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'

export async function createTournament(
  formData: FormData
): Promise<{ error?: string; tournamentId?: string }> {
  try {
    const userId = await getOrCreateDbUserId()

    const name = (formData.get('name') as string)?.trim()
    if (!name) return { error: 'Tournament name is required' }

    const [tour] = await db.insert(tournaments).values({
      userId,
      name,
      eventDate: (formData.get('eventDate') as string) || null,
      division: (formData.get('division') as string)?.trim() || null,
      ruleset: (formData.get('ruleset') as string) || 'ibjjf',
      notes: (formData.get('notes') as string)?.trim() || null,
    }).returning()

    revalidatePath('/tournaments')
    return { tournamentId: tour.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
