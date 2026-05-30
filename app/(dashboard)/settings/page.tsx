import { db } from '../../../lib/db'
import { users } from '../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'
import { SettingsForm } from './settings-form'
import { CompetitionRecordSection } from './competition-record'
import Link from 'next/link'

export const metadata = { title: 'Settings — RollPlan' }

export default async function SettingsPage() {
  const userId = await getOrCreateDbUserId()

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your profile context is used by the AI when generating gameplans and coaching notes.
        </p>
      </div>

      <SettingsForm
        defaultBelt={user?.belt}
        defaultStyle={user?.primaryStyle}
        defaultWeightClassKg={user?.weightClassKg}
        defaultGym={user?.gym}
        defaultGoals={user?.goals}
        defaultSmootcompProfileUrl={user?.smoothcompProfileUrl}
      />

      <div className="mt-12">
        <CompetitionRecordSection
          ajpWins={user?.ajpWins ?? null}
          ajpLosses={user?.ajpLosses ?? null}
          ajpProfileUrl={user?.ajpProfileUrl ?? null}
          smoothcompWins={user?.smoothcompWins ?? null}
          smoothcompLosses={user?.smoothcompLosses ?? null}
          smoothcompFedUrl={user?.smoothcompFedUrl ?? null}
          ibjjfBestResult={user?.ibjjfBestResult ?? null}
          ibjjfProfileUrl={user?.ibjjfProfileUrl ?? null}
          intelStatus={user?.intelStatus ?? null}
        />
      </div>

      <div className="mt-10 pt-8 border-t border-border/60">
        <p className="text-xs text-muted-foreground">
          Have questions?{' '}
          <Link href="/faq" className="underline underline-offset-2 hover:text-foreground">
            Read the FAQ
          </Link>
        </p>
      </div>
    </div>
  )
}
