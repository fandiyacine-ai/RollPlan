'use server'

import { db } from '@/lib/db'
import { notifications } from '@/lib/db/schema'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { eq, isNull, desc, and } from 'drizzle-orm'

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string | null
  linkUrl: string | null
  readAt: Date | null
  createdAt: Date
}

export async function getNotificationsAction(): Promise<{
  items: NotificationItem[]
  unreadCount: number
}> {
  try {
    const userId = await getOrCreateDbUserId()
    const items = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        linkUrl: notifications.linkUrl,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(20)

    const unreadCount = items.filter(n => !n.readAt).length
    return { items, unreadCount }
  } catch {
    return { items: [], unreadCount: 0 }
  }
}

export async function markAllReadAction(): Promise<void> {
  try {
    const userId = await getOrCreateDbUserId()
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  } catch {}
}
