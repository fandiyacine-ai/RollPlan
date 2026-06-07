import { resend, EMAIL_FROM } from './resend'
import { emailLayout } from './layout'

const APP_URL = 'https://rollplan.ai'

// Specific users excluded from all lifecycle email communication on request.
const EMAIL_EXCLUSION_LIST = new Set([
  'tommi.lundell@kapsi.fi',
  'joonas.juokslahti@gmail.com',
])

// All sends are best-effort: a failed email must never break the user-facing
// flow that triggered it (signup, checkout, cancellation).
async function send(to: string, subject: string, html: string) {
  if (EMAIL_EXCLUSION_LIST.has(to.toLowerCase())) {
    console.log('[email] excluded recipient — skipping send:', to, subject)
    return
  }
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping send:', subject)
    return
  }
  try {
    await resend.emails.send({ from: EMAIL_FROM, to, subject, html })
  } catch (err) {
    console.error('[email] send failed:', subject, err instanceof Error ? err.message : err)
  }
}

export async function sendWelcomeEmail(to: string) {
  const html = emailLayout({
    preheader: 'Upload your first match and get an AI breakdown in minutes.',
    title: 'Welcome to RollPlan',
    body: `
      <p style="margin:0 0 12px 0;">You're in. RollPlan turns your match footage into a coach-style breakdown — what you did well, where you got caught, and what to drill next.</p>
      <p style="margin:0 0 12px 0;">Quick start:</p>
      <ul style="margin:0; padding-left:20px;">
        <li style="margin-bottom:6px;">Upload a match — yours or an opponent you're scouting</li>
        <li style="margin-bottom:6px;">Get an AI brief: attack, danger, and pattern in one glance</li>
        <li style="margin-bottom:6px;">Build a gameplan before your next tournament</li>
      </ul>
    `,
    ctaLabel: 'Upload your first match',
    ctaUrl: `${APP_URL}/upload`,
  })
  await send(to, 'Welcome to RollPlan — let’s break down your game', html)
}

export async function sendUpgradeEmail(to: string) {
  const html = emailLayout({
    preheader: 'Your Pro features are live — unlimited tournaments, gameplans, and more.',
    title: 'You’re on RollPlan Pro',
    body: `
      <p style="margin:0 0 12px 0;">Thanks for upgrading — your Pro features are live right now:</p>
      <ul style="margin:0; padding-left:20px;">
        <li style="margin-bottom:6px;">Unlimited tournaments and video analysis</li>
        <li style="margin-bottom:6px;">Full AI gameplans, no blur</li>
        <li style="margin-bottom:6px;">AI training plans tailored to your matches</li>
        <li style="margin-bottom:6px;">Match narration + Ask AI on every match</li>
      </ul>
      <p style="margin:12px 0 0 0;">Manage your billing anytime from Settings.</p>
    `,
    ctaLabel: 'Open RollPlan',
    ctaUrl: `${APP_URL}/gameplans`,
  })
  await send(to, 'You’re on RollPlan Pro — here’s what’s unlocked', html)
}

export async function sendCancellationEmail(to: string) {
  const html = emailLayout({
    preheader: 'Your subscription has been canceled. You’ll keep Pro access until the period ends.',
    title: 'Your subscription was canceled',
    body: `
      <p style="margin:0 0 12px 0;">We've canceled your RollPlan Pro subscription — you'll keep access until the end of your current billing period, then your account moves to the free plan.</p>
      <p style="margin:0 0 12px 0;">If something didn't work for you, reply to this email and tell us — it goes straight to the person building RollPlan.</p>
      <p style="margin:0;">You can resubscribe anytime from Settings.</p>
    `,
    ctaLabel: 'Manage subscription',
    ctaUrl: `${APP_URL}/settings`,
  })
  await send(to, 'Your RollPlan subscription was canceled', html)
}

export async function sendCapReachedEmail(to: string, limit: number) {
  const html = emailLayout({
    preheader: `You've used all ${limit} free analyses — upgrade for unlimited.`,
    title: 'Free video cap hit (5/5)',
    body: `
      <p style="margin:0 0 12px 0;">You've used all ${limit} free analyses for this month — nice work staying active.</p>
      <p style="margin:0 0 12px 0;">Upgrade to RollPlan Pro for unlimited video analysis, full AI gameplans, training plans, and Ask AI on every match.</p>
    `,
    ctaLabel: 'Upgrade for unlimited',
    ctaUrl: `${APP_URL}/upgrade`,
  })
  await send(to, `You've used all ${limit} free analyses — upgrade for unlimited`, html)
}

export async function sendScoutedEmail(to: string, copy: { subject: string; title: string; body: string }) {
  const html = emailLayout({
    preheader: copy.body,
    title: copy.title,
    body: `
      <p style="margin:0 0 12px 0;">${copy.body}</p>
      <p style="margin:0;">Add your next opponent and let the AI build your gameplan.</p>
    `,
    ctaLabel: 'Scout your next opponent',
    ctaUrl: `${APP_URL}/tournaments`,
  })
  await send(to, copy.subject, html)
}

export async function sendTrialEndingEmail(to: string, daysLeft: number) {
  const html = emailLayout({
    preheader: `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    title: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    body: `
      <p style="margin:0 0 12px 0;">Your RollPlan Pro trial wraps up soon. After it ends, you'll move to the free plan unless you add a payment method.</p>
      <p style="margin:0 0 12px 0;">Keep your Pro features — unlimited tournaments, full AI gameplans, training plans, and Ask AI — by confirming your subscription before the trial ends.</p>
    `,
    ctaLabel: 'Keep Pro access',
    ctaUrl: `${APP_URL}/upgrade`,
  })
  await send(to, `Your RollPlan trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, html)
}

export async function sendPostEventCheckinEmail(to: string, title: string, body: string, tournamentId: string) {
  const html = emailLayout({
    preheader: body,
    title,
    body: `<p style="margin:0;">${body}</p>`,
    ctaLabel: 'Tell us how it went',
    ctaUrl: `${APP_URL}/tournaments/${tournamentId}/opponents`,
  })
  await send(to, title, html)
}

export async function sendConnectionRequestEmail(to: string, requesterLabel: string, tournamentName: string) {
  const html = emailLayout({
    preheader: `${requesterLabel} wants to connect with you on RollPlan.`,
    title: `${requesterLabel} wants to connect`,
    body: `
      <p style="margin:0 0 12px 0;">You faced ${requesterLabel} at ${tournamentName} — and they'd like to connect on RollPlan. If you accept, you'll be able to see each other's upcoming tournaments and competition record.</p>
      <p style="margin:0;">Your gameplans, scouted match footage, and AI analysis stay completely private either way — connections never see your prep work.</p>
    `,
    ctaLabel: 'Review request',
    ctaUrl: `${APP_URL}/connections`,
  })
  await send(to, `${requesterLabel} wants to connect on RollPlan`, html)
}

export async function sendConnectionAcceptedEmail(to: string, otherLabel: string) {
  const html = emailLayout({
    preheader: `You and ${otherLabel} are now connected on RollPlan.`,
    title: `You and ${otherLabel} are connected!`,
    body: `
      <p style="margin:0 0 12px 0;">You can now see each other's upcoming tournaments and public competition record.</p>
      <p style="margin:0;">As always, your gameplans, scouted match footage, and AI analysis stay completely private — only you can see your prep work.</p>
    `,
    ctaLabel: 'View connections',
    ctaUrl: `${APP_URL}/connections`,
  })
  await send(to, `You and ${otherLabel} are connected on RollPlan`, html)
}
