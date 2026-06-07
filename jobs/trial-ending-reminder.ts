import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { subscriptions, users } from '../lib/db/schema'
import { and, eq, gte, lt } from 'drizzle-orm'
import { sendTrialEndingEmail } from '../lib/email/send'

const REMINDER_DAYS_OUT = 3

// Runs daily and emails anyone whose trial ends ~3 days from now. Scoping the
// window to a single day means each trialing subscription gets exactly one
// reminder — no extra "already sent" tracking needed.
export const trialEndingReminder = inngest.createFunction(
  {
    id: 'trial-ending-reminder',
    name: 'Trial Ending Reminder Email',
    triggers: [
      { cron: '0 14 * * *' },                  // 2 PM UTC daily
      { event: 'subscriptions/trial-reminder' }, // manual trigger
    ],
  },
  async ({ step }: { step: any }) => {
    const windowStart = new Date(Date.now() + REMINDER_DAYS_OUT * 24 * 60 * 60 * 1000)
    const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000)

    const candidates = await step.run('find-trials-ending-soon', async () => {
      return db
        .select({ email: users.email, trialEndsAt: subscriptions.trialEndsAt })
        .from(subscriptions)
        .innerJoin(users, eq(users.id, subscriptions.userId))
        .where(and(
          eq(subscriptions.status, 'trialing'),
          gte(subscriptions.trialEndsAt, windowStart),
          lt(subscriptions.trialEndsAt, windowEnd),
        ))
    })

    for (const { email } of candidates) {
      await step.run(`send-reminder-${email}`, async () => {
        await sendTrialEndingEmail(email, REMINDER_DAYS_OUT)
      })
    }

    return { sent: candidates.length }
  }
)
