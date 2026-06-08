import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { DevSharePreview } from './preview'

export default async function DevSharePreviewPage() {
  const { userId: clerkId } = await auth()
  const isAdmin = !!process.env.ADMIN_CLERK_USER_ID && clerkId === process.env.ADMIN_CLERK_USER_ID
  if (!isAdmin) notFound()

  return <DevSharePreview />
}
