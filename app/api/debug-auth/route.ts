import { auth } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const hdrs = await headers()
  const clerkStatus = hdrs.get('x-clerk-auth-status')
  const clerkMessage = hdrs.get('x-clerk-auth-message')
  const clerkReason = hdrs.get('x-clerk-auth-reason')

  let authResult: Record<string, unknown> = {}
  let authError: string | null = null
  try {
    const a = await auth()
    authResult = { userId: a.userId, sessionId: (a as Record<string, unknown>).sessionId ?? null }
  } catch (e) {
    authError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    clerkHeaders: {
      'x-clerk-auth-status': clerkStatus,
      'x-clerk-auth-message': clerkMessage,
      'x-clerk-auth-reason': clerkReason,
    },
    auth: authResult,
    authError,
    publishableKeyPrefix: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.slice(0, 20) ?? 'NOT SET',
    secretKeyPrefix: process.env.CLERK_SECRET_KEY?.slice(0, 10) ?? 'NOT SET',
  })
}
