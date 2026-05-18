import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../lib/db'
import { matches } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../../../lib/db/get-user'

function generateToken(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => chars[b % chars.length])
    .join('')
}

async function getOwnedMatch(matchId: string, userId: string) {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
  if (!match) return null
  if (match.userId !== userId) return null
  return match
}

// POST — generate token if none, return current state
export async function POST(req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params
    const userId = await getOrCreateDbUserId()
    const match = await getOwnedMatch(matchId, userId)
    if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const token = match.shareToken ?? generateToken()
    if (!match.shareToken) {
      await db.update(matches).set({ shareToken: token }).where(eq(matches.id, matchId))
    }

    return NextResponse.json({ shareToken: token, shareIncludesVideo: match.shareIncludesVideo ?? false })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// PATCH — update includesVideo setting
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params
    const userId = await getOrCreateDbUserId()
    const match = await getOwnedMatch(matchId, userId)
    if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { includesVideo } = await req.json()
    await db.update(matches).set({ shareIncludesVideo: !!includesVideo }).where(eq(matches.id, matchId))

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// DELETE — revoke: clear token and immediately generate a new one
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params
    const userId = await getOrCreateDbUserId()
    const match = await getOwnedMatch(matchId, userId)
    if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newToken = generateToken()
    await db.update(matches).set({ shareToken: newToken }).where(eq(matches.id, matchId))

    return NextResponse.json({ shareToken: newToken, shareIncludesVideo: match.shareIncludesVideo ?? false })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
