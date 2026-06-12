import type { MetadataRoute } from 'next'

const SITE_URL = 'https://rollplan.ai'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/share',
        '/connections',
        '/drills',
        '/feedback',
        '/game-day',
        '/gameplans',
        '/matches',
        '/notifications',
        '/onboarding',
        '/player-card',
        '/settings',
        '/tournaments',
        '/upgrade',
        '/upload',
        '/usage',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
