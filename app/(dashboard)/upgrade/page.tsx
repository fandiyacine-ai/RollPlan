import Link from 'next/link'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { getSubscriptionStatus } from '@/lib/subscription'
import { UpgradeOffer } from './upgrade-offer'
import { ManageSubscription } from './manage-subscription'

export const dynamic = 'force-dynamic'

export default async function UpgradePage() {
  const userId = await getOrCreateDbUserId().catch(() => null)
  const tier = userId ? await getSubscriptionStatus(userId) : 'free'

  return (
    <div className="max-w-sm mx-auto py-10 px-4 space-y-8">
      {/* Back */}
      <Link href="/player-card" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-block">
        ← Back
      </Link>

      {tier === 'pro' || tier === 'trial' ? <ManageSubscription tier={tier} /> : <UpgradeOffer />}
    </div>
  )
}
