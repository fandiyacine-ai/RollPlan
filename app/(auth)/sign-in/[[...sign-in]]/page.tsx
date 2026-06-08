import { SignIn } from '@clerk/nextjs'
import { AuthShell, CLERK_APPEARANCE } from '../../auth-shell'

export default function SignInPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to keep building your gameplans and tracking your matches.">
      <SignIn forceRedirectUrl="/player-card" appearance={CLERK_APPEARANCE} />
    </AuthShell>
  )
}
