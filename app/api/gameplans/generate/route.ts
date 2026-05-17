import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '../../../../lib/inngest'

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, opponentId } = await req.json()
    if (!tournamentId || !opponentId) {
      return NextResponse.json({ error: 'tournamentId and opponentId are required' }, { status: 400 })
    }

    await inngest.send({ name: 'gameplan/requested', data: { tournamentId, opponentId } })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
