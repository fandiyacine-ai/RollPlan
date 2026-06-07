'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../lib/db'
import { users } from '../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'
import { currentUser } from '@clerk/nextjs/server'
import { inngest } from '../../../lib/inngest'

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
    const rawSmootcompUrl = (formData.get('smoothcompProfileUrl') as string | null)?.trim() || null

    const belt = rawBelt && VALID_BELTS.includes(rawBelt as Belt) ? (rawBelt as Belt) : null
    const primaryStyle = rawStyle && VALID_STYLES.includes(rawStyle as Style) ? (rawStyle as Style) : null

    let smoothcompAthleteId: string | null = null
    let smoothcompProfileUrl: string | null = null
    if (rawSmootcompUrl) {
      try {
        const parsed = new URL(rawSmootcompUrl)
        const match = parsed.pathname.match(/\/athlete\/(\d+)/)
        smoothcompAthleteId = match?.[1] ?? null
        smoothcompProfileUrl = rawSmootcompUrl
      } catch {
        // invalid URL — ignore silently
      }
    }

    await db.update(users).set({
      belt,
      primaryStyle,
      gym,
      goals,
      weightClassKg: weightClassKg && !isNaN(weightClassKg) ? weightClassKg : null,
      smoothcompProfileUrl,
      smoothcompAthleteId,
      updatedAt: new Date(),
    }).where(eq(users.id, userId))

    revalidatePath('/settings')
    revalidatePath('/player-card')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setOpenToConnectionsAction(open: boolean): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    await db.update(users).set({ openToConnections: open }).where(eq(users.id, userId))
    revalidatePath('/settings')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function fetchUserIntelAction(): Promise<{ error?: string; queued?: boolean }> {
  try {
    const userId = await getOrCreateDbUserId()
    const clerkUser = await currentUser()
    if (!clerkUser) return { error: 'Not signed in' }

    const firstName = clerkUser.firstName ?? ''
    const lastName = clerkUser.lastName ?? ''
    const athleteName = `${firstName} ${lastName}`.trim()
    if (!athleteName) return { error: 'Add your name in your Clerk profile first' }

    await inngest.send({ name: 'user/fetch-intel', data: { userId, athleteName } })
    revalidatePath('/settings')
    return { queued: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
