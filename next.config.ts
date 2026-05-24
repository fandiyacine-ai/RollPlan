import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres', 'playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth'],
}

export default nextConfig
