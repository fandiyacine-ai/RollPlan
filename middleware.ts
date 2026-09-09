import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/faq',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/api/(.*)',
  '/share/(.*)',
  '/sitemap.xml',
  '/robots.txt',
  '/opengraph-image(.*)',
])

// Railway's proxy forwards the real host/protocol via X-Forwarded-* headers, but
// request.url/request.nextUrl.origin resolve to the container's internal address
// (e.g. http://localhost:8080). Prefer the forwarded headers so redirect targets
// point back at the domain the user actually requested.
function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
    return `${forwardedProto}://${forwardedHost}`
  }
  return request.nextUrl.origin
}

export default clerkMiddleware(async (auth, request) => {
  const origin = getRequestOrigin(request)

  // Dev-only bypass: set DEV_BYPASS_AUTH=true in .env.local for localhost UX review
  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
    if (request.nextUrl.pathname === '/') {
      return NextResponse.redirect(new URL('/player-card', origin))
    }
    return NextResponse.next()
  }

  const { userId } = await auth()

  // Authenticated user landing on the homepage → send straight to the app
  if (userId && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/player-card', origin))
  }

  // Unauthenticated user trying to reach a protected route → send to sign-in
  if (!isPublicRoute(request) && !userId) {
    const signInUrl = new URL('/sign-in', origin)
    const redirectTarget = new URL(request.nextUrl.pathname + request.nextUrl.search, origin)
    signInUrl.searchParams.set('redirect_url', redirectTarget.toString())
    return NextResponse.redirect(signInUrl)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
