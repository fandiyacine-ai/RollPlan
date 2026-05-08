import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">RollPlan</h1>
        <p className="text-xl text-muted-foreground">
          Evidence-backed competition gameplans for serious BJJ competitors.
          Every claim traced to a timestamp in your footage.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }))}>
            Get Started
          </Link>
          <Link href="/sign-in" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
            Sign In
          </Link>
        </div>
      </div>
    </main>
  )
}
