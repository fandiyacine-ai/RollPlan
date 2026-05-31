import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres', 'playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth'],
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.posthog.com/:path*' },
    ]
  },
  skipTrailingSlashRedirect: true,
}

export default nextConfig
