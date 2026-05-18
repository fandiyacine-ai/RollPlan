import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '../../../../lib/inngest'
import { getOrCreateDbUserId } from '../../../../lib/db/get-user'

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, opponentId } = await req.json()
    if (!tournamentId || !opponentId) {
      return NextResponse.json({ error: 'tournamentId and opponentId are required' }, { status: 400 })
    }

    const userId = await getOrCreateDbUserId()
    await inngest.send({ name: 'gameplan/requested', data: { tournamentId, opponentId, userId } })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
