import { db } from './db'
import { subscriptions } from './db/schema'
import { eq } from 'drizzle-orm'

export type SubscriptionTier = 'free' | 'pro' | 'trial'

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionTier> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  })

  if (!row) return 'free'

  const now = new Date()

  if (row.status === 'trialing') {
    if (row.trialEndsAt && row.trialEndsAt > now) return 'trial'
    return 'free'
  }

  if (row.status === 'active') {
    if (row.currentPeriodEnd && row.currentPeriodEnd > now) return 'pro'
    return 'free'
  }

  return 'free'
}

export async function getOrCreateStripeCustomerId(
  userId: string,
  email: string,
): Promise<string> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  })
  if (row?.stripeCustomerId) return row.stripeCustomerId

  const stripe = await import('stripe').then(m => new m.default(process.env.STRIPE_SECRET_KEY!))
  const customer = await stripe.customers.create({ email, metadata: { userId } })

  await db.insert(subscriptions).values({
    userId,
    stripeCustomerId: customer.id,
    status: 'free',
  })

  return customer.id
}
