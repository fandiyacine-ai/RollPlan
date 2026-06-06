import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event

  if (webhookSecret) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } else {
    // Allow unsigned webhooks in development (no webhook secret set)
    event = JSON.parse(body) as Stripe.Event
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const userId = session.metadata?.userId
        if (!userId) break

        const subscriptionId = session.subscription as string
        const sub = await stripe.subscriptions.retrieve(subscriptionId)

        await upsertSubscription(userId, session.customer as string, sub)
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription
        const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer
        const userId = customer.metadata?.userId
        if (!userId) break

        await upsertSubscription(userId, sub.customer as string, sub)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await db
          .update(subscriptions)
          .set({ status: 'canceled', updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, sub.id))
        break
      }
    }
  } catch (err) {
    console.error('[stripe-webhook]', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function upsertSubscription(
  userId: string,
  customerId: string,
  sub: Stripe.Subscription,
) {
  const item = sub.items.data[0]
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null

  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  })

  if (existing) {
    await db
      .update(subscriptions)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: item?.price.id ?? null,
        status: sub.status,
        trialEndsAt: trialEnd,
        currentPeriodEnd: periodEnd ?? null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId))
  } else {
    await db.insert(subscriptions).values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: item?.price.id ?? null,
      status: sub.status,
      trialEndsAt: trialEnd,
      currentPeriodEnd: periodEnd ?? null,
    })
  }
}
