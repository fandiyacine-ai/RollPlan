import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { db } from '@/lib/db'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const userId = await getOrCreateDbUserId()

  const row = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  })

  if (!row?.stripeCustomerId) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
  }

  const origin = req.headers.get('origin') ?? 'https://rollplan-production.up.railway.app'

  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${origin}/player-card`,
  })

  return NextResponse.json({ url: session.url })
}
