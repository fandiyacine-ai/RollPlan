'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../lib/db'
import { users } from '../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'

type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black' | 'grey' | 'yellow' | 'orange' | 'green'
type Style = 'gi' | 'no_gi' | 'both'

const VALID_BELTS: Belt[] = ['white', 'blue', 'purple', 'brown', 'black', 'grey', 'yellow', 'orange', 'green']
const VALID_STYLES: Style[] = ['gi', 'no_gi', 'both']

export async function updateProfile(_prev: { error?: string }, formData: FormData): Promise<{ error?: string; success?: boolean }> {
  try {
    const userId = await getOrCreateDbUserId()

    const rawBelt = formData.get('belt') as string | null
    const rawStyle = formData.get('primaryStyle') as string | null
    const gym = (formData.get('gym') as string | null)?.trim() || null
    const goals = (formData.get('goals') as string | null)?.trim() || null
    const rawWeight = formData.get('weightClassKg') as string | null
    const weightClassKg = rawWeight && rawWeight !== '' ? parseInt(rawWeight, 10) : null

    const belt = rawBelt && VALID_BELTS.includes(rawBelt as Belt) ? (rawBelt as Belt) : null
    const primaryStyle = rawStyle && VALID_STYLES.includes(rawStyle as Style) ? (rawStyle as Style) : null

    await db.update(users).set({
      belt,
      primaryStyle,
      gym,
      goals,
      weightClassKg: weightClassKg && !isNaN(weightClassKg) ? weightClassKg : null,
      updatedAt: new Date(),
    }).where(eq(users.id, userId))

    revalidatePath('/settings')
    revalidatePath('/player-card')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
