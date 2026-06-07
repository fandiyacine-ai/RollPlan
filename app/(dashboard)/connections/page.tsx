import Link from 'next/link'
import { getConnectionsPageData } from './actions'
import { ConnectionsView } from './connections-view'

export const metadata = { title: 'Connections — RollPlan' }

export default async function ConnectionsPage() {
  const { candidates, pendingReceived, accepted } = await getConnectionsPageData()

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
        <p className="text-muted-foreground text-sm mt-1">
          People you've actually faced in competition, who are also on RollPlan and open to connecting.
          Your gameplans, scouted footage, and AI analysis stay private — connections only ever see your
          upcoming tournaments and public competition record.
        </p>
      </div>

      <ConnectionsView candidates={candidates} pendingReceived={pendingReceived} accepted={accepted} />

      <div className="mt-10 pt-8 border-t border-border/60">
        <p className="text-xs text-muted-foreground">
          Want to be discoverable to people you've competed against?{' '}
          <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
            Turn on connections in Settings
          </Link>
        </p>
      </div>
    </div>
  )
}
