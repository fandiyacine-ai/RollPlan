import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/faq', '/api/(.*)', '/share/(.*)'])

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth()

  // Authenticated user landing on the homepage → send straight to the app
  if (userId && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/player-card', request.url))
  }

  // Unauthenticated user trying to reach a protected route → send to sign-in
  if (!isPublicRoute(request) && !userId) {
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('redirect_url', request.url)
    return NextResponse.redirect(signInUrl)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
