import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { InstagramIcon } from '@/components/icons/instagram'

export const metadata = {
  title: 'Privacy Policy',
  description: 'How RollPlan collects, uses, and protects your data — including footage, profile information, and AI analysis results.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated 15 June 2026</p>
        </div>

        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-0 [&_p]:text-muted-foreground [&_li]:text-muted-foreground">

          <section>
            <p className="text-foreground/90">
              RollPlan ("RollPlan", "we", "us") provides AI-powered analysis of Brazilian Jiu-Jitsu match footage,
              opponent scouting, and gameplan generation. This policy explains what information we collect when
              you use RollPlan, how we use it, and the choices and rights you have.
            </p>
          </section>

          <section>
            <h2>Information we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-foreground">Account information</strong> — when you sign up, our authentication provider (Clerk) collects your name, email address, and profile photo.</li>
              <li><strong className="text-foreground">Profile details</strong> — belt rank, weight class, gym, training goals, and other information you choose to add to your profile.</li>
              <li><strong className="text-foreground">Match footage</strong> — video files you upload, or the URLs of publicly accessible videos (e.g. YouTube) that you submit for analysis or opponent scouting.</li>
              <li><strong className="text-foreground">AI-generated analysis</strong> — position breakdowns, timelines, coaching notes, gameplans, and training plans generated from your footage and profile.</li>
              <li><strong className="text-foreground">Tournament &amp; opponent data</strong> — tournament names, brackets, and opponent records you add manually or import from public sources such as Smoothcomp, IBJJF, or AJP.</li>
              <li><strong className="text-foreground">Payment information</strong> — if you subscribe to a paid plan, billing is handled entirely by Stripe. We never see or store your card details.</li>
              <li><strong className="text-foreground">Usage data</strong> — basic technical data (such as which features you use and how many analyses you run) needed to operate the service and manage our AI processing costs.</li>
            </ul>
          </section>

          <section>
            <h2>How we use your information</h2>
            <p>We use the information above to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Run the AI analysis that powers match breakdowns, opponent scouting, gameplans, Match Day, and your training plan.</li>
              <li>Operate your account, including authentication, billing, and enforcing usage limits on the Free plan.</li>
              <li>Personalise AI output using your profile (belt, goals, style) so reports are relevant to you.</li>
              <li>Maintain and improve RollPlan, including fixing bugs and understanding which features are useful.</li>
              <li>Respond to support requests sent to us by email.</li>
            </ul>
            <p>We do not sell your personal data, and we do not use your footage or analysis to train AI models beyond the processing needed to generate your results.</p>
          </section>

          <section>
            <h2>AI processing</h2>
            <p>
              Video you submit for analysis is sent to Google Gemini for processing. Gemini reads the video
              in-flight to generate position breakdowns, timelines, and coaching notes — RollPlan does not
              re-host or permanently store the raw bytes of public YouTube videos you link to. Footage you
              upload directly is stored securely (see "Where your data is stored" below) so you can re-watch
              it alongside your analysis.
            </p>
          </section>

          <section>
            <h2>Where your data is stored</h2>
            <p>RollPlan relies on a small number of trusted infrastructure providers to operate:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Clerk</strong> — account authentication and login.</li>
              <li><strong className="text-foreground">Supabase</strong> — our application database (profile, match, and analysis data).</li>
              <li><strong className="text-foreground">Cloudflare R2</strong> — secure storage for footage you upload directly.</li>
              <li><strong className="text-foreground">Google Gemini</strong> — AI video and text analysis.</li>
              <li><strong className="text-foreground">Stripe</strong> — subscription billing and payment processing.</li>
            </ul>
            <p>Each provider only receives the data it needs to perform its function, and each maintains its own security and compliance standards.</p>
          </section>

          <section>
            <h2>Your rights</h2>
            <p>
              You can review and update your profile information at any time from Settings. You own your data
              and can request deletion of your account and all associated data at any time by emailing{' '}
              <a href="mailto:support@rollplan.ai" className="underline underline-offset-2 hover:text-foreground">support@rollplan.ai</a>.
              Depending on where you live, you may also have the right to access, correct, export, or restrict
              processing of your personal data — contact us and we'll action your request promptly.
            </p>
          </section>

          <section>
            <h2>Data retention</h2>
            <p>
              We retain your account, footage, and analysis data for as long as your account is active, so you
              can keep building a history of your matches and progress. If you delete your account, we delete
              your personal data and uploaded footage within a reasonable period, except where we're required
              to retain billing records for legal or tax purposes.
            </p>
          </section>

          <section>
            <h2>Cookies</h2>
            <p>
              RollPlan uses essential cookies set by our authentication provider (Clerk) to keep you signed in.
              We do not use third-party advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2>Children's privacy</h2>
            <p>
              RollPlan is not directed at children under 16. If you believe a child has created an account
              without appropriate parental consent, please contact us and we'll remove it.
            </p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>
              We may update this policy from time to time as RollPlan evolves. We'll update the "Last updated"
              date above when we do. Continued use of RollPlan after a change means you accept the updated policy.
            </p>
          </section>

          <section>
            <h2>Contact us</h2>
            <p>
              Questions about this policy or your data? Email{' '}
              <a href="mailto:support@rollplan.ai" className="underline underline-offset-2 hover:text-foreground">support@rollplan.ai</a>
              {' '}— we read every message.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground max-w-2xl mx-auto">
        <div className="flex items-center gap-5">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
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
