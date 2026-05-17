'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '../../../lib/db'
import { tournaments } from '../../../lib/db/schema'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'

export async function createTournament(formData: FormData) {
  const userId = await getOrCreateDbUserId()

  const name = (formData.get('name') as string)?.trim()
  if (!name) throw new Error('Tournament name is required')

  const [tour] = await db.insert(tournaments).values({
    userId,
    name,
    eventDate: (formData.get('eventDate') as string) || null,
    division: (formData.get('division') as string)?.trim() || null,
    ruleset: (formData.get('ruleset') as string) || 'ibjjf',
    notes: (formData.get('notes') as string)?.trim() || null,
  }).returning()

  revalidatePath('/tournaments')
  redirect(`/tournaments/${tour.id}/opponents`)
}
