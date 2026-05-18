'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../../../lib/db'
import { tournamentOpponents, videos } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { inngest } from '../../../../../lib/inngest'
import { getOrCreateDbUserId } from '../../../../../lib/db/get-user'

export async function addOpponent(tournamentId: string, formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) throw new Error('Opponent name is required')

  await db.insert(tournamentOpponents).values({
    tournamentId,
    opponentLabel: name,
    seedingNotes: (formData.get('notes') as string)?.trim() || null,
  })

  revalidatePath(`/tournaments/${tournamentId}/opponents`)
}

export async function submitScoutUrls(tournamentId: string, opponentId: string, formData: FormData) {
  const rawUrls = (formData.get('urls') as string) ?? ''
  const urls = rawUrls
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0)

  if (urls.length === 0) throw new Error('At least one URL is required')
  if (urls.length > 10) throw new Error('Maximum 10 URLs per submission')

  const opponent = await db.query.tournamentOpponents.findFirst({
    where: (t, { eq }) => eq(t.id, opponentId),
  })
  if (!opponent) throw new Error('Opponent not found')

  const athleteName = opponent.opponentLabel
  const format = (formData.get('format') as string) || 'gi'
  const appearanceHint = (formData.get('appearanceHint') as string)?.trim() || undefined

  const userId = await getOrCreateDbUserId()

  for (const url of urls) {
    try { new URL(url) } catch { throw new Error(`Invalid URL: ${url}`) }

    const [video] = await db.insert(videos).values({
      userId,
      r2Key: `url/${Date.now()}-${Math.random().toString(36).slice(2)}`,
      originalFilename: url,
      contentType: 'video/mp4',
      sizeBytes: 0,
      sourceType: 'opponent',
      publicUrl: url,
      status: 'uploaded',
      tournamentOpponentId: opponentId,
    }).returning()

    try {
      await inngest.send({
        name: 'url/submitted',
        data: {
          videoId: video.id,
          userId,
          athleteName,
          format,
          sourceType: 'opponent',
          tournamentOpponentId: opponentId,
          appearanceHint,
        },
      })
    } catch {
      // Inngest not configured — record created but scan won't start
    }
  }

  revalidatePath(`/tournaments/${tournamentId}/opponents`)
}

export async function deleteOpponent(opponentId: string, tournamentId: string): Promise<{ error?: string }> {
  try {
    await db.delete(tournamentOpponents).where(eq(tournamentOpponents.id, opponentId))
    revalidatePath(`/tournaments/${tournamentId}/opponents`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
