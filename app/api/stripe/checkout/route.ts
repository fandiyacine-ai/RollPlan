import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { getOrCreateStripeCustomerId } from '@/lib/subscription'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const { priceId } = await req.json() as { priceId?: string }

  const price = priceId ?? process.env.STRIPE_PRICE_MONTHLY!
  if (!price) {
    return NextResponse.json({ error: 'Missing priceId' }, { status: 400 })
  }

  const userId = await getOrCreateDbUserId()

  const userRow = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const customerId = await getOrCreateStripeCustomerId(userId, userRow.email)

  const origin = req.headers.get('origin') ?? 'https://rollplan-production.up.railway.app'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { userId },
    },
    metadata: { userId },
    success_url: `${origin}/player-card?upgraded=1`,
    cancel_url: `${origin}/player-card`,
  })

  return NextResponse.json({ url: session.url })
}
