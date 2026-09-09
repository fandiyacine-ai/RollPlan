import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { InstagramIcon } from '@/components/icons/instagram'

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of RollPlan, including subscriptions, your content, and AI-generated analysis.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <Link href="/"><Wordmark /></Link>
        <Link href="/player-card" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to app
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-3">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated 15 June 2026</p>
        </div>

        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-0 [&_p]:text-muted-foreground [&_li]:text-muted-foreground">

          <section>
            <p className="text-foreground/90">
              These terms govern your use of RollPlan, an AI-powered BJJ match analysis, opponent scouting,
              and gameplan tool. By creating an account or using RollPlan, you agree to these terms. If you
              don't agree, please don't use the service.
            </p>
          </section>

          <section>
            <h2>RollPlan is in beta</h2>
            <p>
              RollPlan is under active development. Core features work reliably, but the AI analysis isn't
              perfect — position labels, match results, and other AI-generated content can be wrong, and you
              may encounter rough edges or downtime. We provide tools to correct AI mistakes inline, but
              RollPlan's output is a coaching aid, not a guarantee of accuracy, and should not be your only
              source of preparation for a competition.
            </p>
          </section>

          <section>
            <h2>Accounts</h2>
            <p>
              You need an account to use RollPlan. You're responsible for keeping your login credentials
              secure and for all activity that happens under your account. You must be at least 16 years
              old to create an account.
            </p>
          </section>

          <section>
            <h2>Subscriptions &amp; billing</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>The Free plan includes a limited number of analyses per calendar month, reset on the 1st.</li>
              <li>The Pro plan removes monthly limits and is billed monthly or yearly via Stripe.</li>
              <li>You can cancel your subscription at any time from Settings — your plan remains active until the end of the current billing period.</li>
              <li>Prices are shown in EUR and may change with reasonable notice; changes won't apply retroactively to a period you've already paid for.</li>
            </ul>
          </section>

          <section>
            <h2>Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Upload or submit footage you don't have the right to use or share.</li>
              <li>Use RollPlan to harass, defame, or infringe the rights of any athlete, including opponents whose public footage you scout.</li>
              <li>Attempt to abuse, scrape, or overload the service beyond normal use, or circumvent usage limits.</li>
              <li>Use RollPlan for any unlawful purpose.</li>
            </ul>
          </section>

          <section>
            <h2>Your content</h2>
            <p>
              You retain ownership of the footage, profile information, and any notes you add to RollPlan.
              By submitting footage or a video URL, you grant RollPlan a limited license to process that
              content (including sending it to Google Gemini) solely to generate your analysis, gameplans,
              and related features. You can delete your content at any time, and deleting your account
              removes your stored footage and data as described in our{' '}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2>Opponent &amp; tournament data</h2>
            <p>
              Opponent scouting features analyse publicly available competition footage and results (including
              data imported from Smoothcomp, IBJJF, and AJP brackets). This data is used only to generate
              gameplans and scouting reports for your own use and should be treated respectfully —
              it's there to help you prepare, not to be redistributed or used to harass other athletes.
            </p>
          </section>

          <section>
            <h2>Intellectual property</h2>
            <p>
              The RollPlan name, logo, design, and underlying software are owned by RollPlan. Nothing in
              these terms grants you rights to our branding or code beyond what's needed to use the service
              as intended.
            </p>
          </section>

          <section>
            <h2>Termination</h2>
            <p>
              You can stop using RollPlan and delete your account at any time. We may suspend or terminate
              accounts that violate these terms, abuse the service, or pose a security risk, with notice
              where reasonably possible.
            </p>
          </section>

          <section>
            <h2>Disclaimers &amp; limitation of liability</h2>
            <p>
              RollPlan is provided "as is" without warranties of any kind. AI-generated analysis, gameplans,
              and win-probability estimates are coaching aids, not professional advice, and may contain
              errors. To the maximum extent permitted by law, RollPlan is not liable for any indirect,
              incidental, or consequential damages arising from your use of the service, including decisions
              made based on AI-generated content.
            </p>
          </section>

          <section>
            <h2>Changes to these terms</h2>
            <p>
              We may update these terms as RollPlan evolves. We'll update the "Last updated" date above
              when we do. Continued use of RollPlan after a change means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2>Contact us</h2>
            <p>
              Questions about these terms? Email{' '}
              <a href="mailto:support@rollplan.ai" className="underline underline-offset-2 hover:text-foreground">support@rollplan.ai</a>
              {' '}— we read every message.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground max-w-2xl mx-auto">
        <div className="flex items-center gap-5">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          <a
            href="https://www.instagram.com/rollplan.ai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RollPlan on Instagram"
            className="hover:text-foreground transition-colors"
          >
            <InstagramIcon className="w-4 h-4" />
          </a>
        </div>
      </footer>
    </div>
  )
}
