import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '../../../../lib/inngest'
import { getOrCreateDbUserId } from '../../../../lib/db/get-user'
import { db } from '../../../../lib/db'
import { gameplans } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { GENERATE_GAMEPLAN_PROMPT_VERSION } from '../../../../lib/ai/prompts/generate-gameplan'

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, opponentId } = await req.json()
    if (!tournamentId || !opponentId) {
      return NextResponse.json({ error: 'tournamentId and opponentId are required' }, { status: 400 })
    }

    const userId = await getOrCreateDbUserId()

    // Write a generating placeholder immediately so the page can show in-progress state
    const existing = await db.query.gameplans.findFirst({ where: eq(gameplans.opponentId, opponentId) })
    if (existing) {
      await db.update(gameplans).set({ status: 'generating' }).where(eq(gameplans.id, existing.id))
    } else {
      await db.insert(gameplans).values({
        tournamentId,
        opponentId,
        structuredPlan: {},
        promptVersion: GENERATE_GAMEPLAN_PROMPT_VERSION,
        status: 'generating',
        evidence: {},
      })
    }

    await inngest.send({ name: 'gameplan/requested', data: { tournamentId, opponentId, userId } })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
