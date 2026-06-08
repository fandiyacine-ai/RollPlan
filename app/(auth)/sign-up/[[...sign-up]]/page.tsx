import { SignUp } from '@clerk/nextjs'
import { AuthShell, CLERK_APPEARANCE } from '../../auth-shell'

export default function SignUpPage() {
  return (
    <AuthShell title="Train smarter with RollPlan" subtitle="AI match analysis and opponent gameplans for competition BJJ.">
      <SignUp forceRedirectUrl="/player-card" appearance={CLERK_APPEARANCE} />
    </AuthShell>
  )
}
