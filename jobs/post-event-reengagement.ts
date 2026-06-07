import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournaments, users } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { createNotification } from '../lib/db/notifications'
import { findEligibleConnections } from '../lib/db/connections'
import { sendPostEventCheckinEmail } from '../lib/email/send'

// Fires once per tournament, right after the automated bracket sync completes
// (see smoothcomp-sync-bracket-results.ts — that job only emits this event once
// per tournament, which is what keeps this one from double-sending).
//
// Single re-engagement touchpoint, in priority order:
//   1. Specific hook — "You faced [Name] at [Tournament], and they're on
//      RollPlan too" — only when a *confirmed* head-to-head result exists
//      against an opted-in RollPlan user (see findEligibleConnections). Falls
//      back to a warm general "How did [Tournament] go?" otherwise — claiming
//      a fight that didn't happen reads as "this app doesn't understand my
//      sport" and kills credibility (see ROADMAP honesty constraint).
//   2. Feedback capture happens in-app via the existing PostEventBanner — this
//      touchpoint's job is just to bring idle users back to it.
//   3. Connect CTA — folded into the specific hook itself, since the only case
//      where it's honest to mention a name is also the only case where a
//      connection request is possible.
export const postEventReengagement = inngest.createFunction(
  {
    id: 'post-event-reengagement',
    name: 'Post-Event Re-engagement (feedback + connections)',
    triggers: [{ event: 'tournament/post-event-sync.completed' }],
  },
  async ({ event, step }: {
    event: { data: { tournamentId: string; userId: string; updated: number } }
    step: any
  }) => {
    const { tournamentId, userId } = event.data

    const context = await step.run('load-context', async () => {
      const [tournament, user] = await Promise.all([
        db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId) }),
        db.query.users.findFirst({ where: eq(users.id, userId) }),
      ])
      if (!tournament || !user || user.email.endsWith('@unknown.local')) return null

      const eligible = await findEligibleConnections(userId)
      const match = eligible.find(e => e.tournamentId === tournamentId)
      return {
        tournamentName: tournament.name,
        email: user.email,
        matchLabel: match?.opponentLabel ?? null,
      }
    })

    if (!context) return { sent: false }

    const { tournamentName, email, matchLabel } = context

    const hookTitle = matchLabel
      ? `You faced ${matchLabel} at ${tournamentName} — and they're on RollPlan`
      : `How did ${tournamentName} go?`
    const hookBody = matchLabel
      ? `${matchLabel} is also on RollPlan. Tell us how the match went, and if you'd like, send a connection request to see each other's upcoming tournaments and competition record. Your scouting and prep stay private either way.`
      : `Tell us how it went — wins and losses both help us sharpen your prep for next time.`

    await step.run('notify', async () => {
      await createNotification(userId, 'post_event_checkin', hookTitle, hookBody, `/tournaments/${tournamentId}/opponents`)
    })

    await step.run('email', async () => {
      await sendPostEventCheckinEmail(email, hookTitle, hookBody, tournamentId).catch(() => {})
    })

    return { sent: true, withConnectionHook: !!matchLabel }
  }
)
