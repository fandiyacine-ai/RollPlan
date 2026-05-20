import { db } from './index'
import { notifications } from './schema'

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body?: string | null,
  linkUrl?: string | null,
): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId,
      type,
      title,
      body: body ?? null,
      linkUrl: linkUrl ?? null,
    })
  } catch (err) {
    console.error('[notifications] create failed', err)
  }
}
