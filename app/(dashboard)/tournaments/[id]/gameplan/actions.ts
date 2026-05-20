'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../../../lib/db'
import { gameplans } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'

export async function rateGameplan(
  gameplanId: string,
  rating: 1 | -1 | null,
): Promise<{ error?: string }> {
  try {
    await db
      .update(gameplans)
      .set({ rating })
      .where(eq(gameplans.id, gameplanId))
    revalidatePath('/', 'layout')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
