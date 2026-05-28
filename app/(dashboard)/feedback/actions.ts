'use server'

import { db } from '@/lib/db'
import { feedback } from '@/lib/db/schema'
import { getOrCreateDbUserId } from '@/lib/db/get-user'

export async function submitFeedbackAction(data: {
  rating?: number
  category?: string
  message?: string
  page?: string
}): Promise<{ ok: boolean }> {
  if (!data.rating && !data.message?.trim()) return { ok: false }

  try {
    const userId = await getOrCreateDbUserId().catch(() => null)
    await db.insert(feedback).values({
      userId: userId ?? undefined,
      rating: data.rating ?? null,
      category: data.category ?? null,
      message: data.message?.trim() || null,
      page: data.page ?? null,
    })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
