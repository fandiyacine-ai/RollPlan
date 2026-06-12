import type { Metadata } from 'next'
import { Inter, Space_Grotesk, Bebas_Neue } from 'next/font/google'
import Script from 'next/script'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { PostHogProvider } from './providers/posthog-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-brand', weight: ['400', '500', '600', '700'] })
const bebasNeue = Bebas_Neue({ subsets: ['latin'], variable: '--font-display', weight: '400' })

const SITE_URL = 'https://rollplan.ai'
const SITE_NAME = 'RollPlan'
const SITE_DESCRIPTION = 'Upload your BJJ footage and get an AI-powered match breakdown — every position, transition, and turning point traced to the exact timestamp. Scout opponents and get an AI gameplan with win probability.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'RollPlan — AI BJJ Match Analysis',
    template: '%s | RollPlan',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'BJJ video analysis',
    'jiu jitsu match analysis',
    'AI BJJ coach',
    'BJJ video review software',
    'BJJ opponent scouting',
    'BJJ gameplan',
    'grappling analytics',
  ],
  authors: [{ name: 'RollPlan' }],
  alternates: { canonical: '/' },
  icons: {
    apple: '/RollPlan-logo.png',
  },
  openGraph: {
    title: 'RollPlan — AI BJJ Match Analysis',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RollPlan — AI BJJ Match Analysis',
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={`${spaceGrotesk.variable} ${bebasNeue.variable}`}>
        <Script src="https://www.googletagmanager.com/gtag/js?id=AW-18229553848" strategy="afterInteractive" />
        <Script id="google-tag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-18229553848');
          `}
        </Script>
        <body className={inter.className}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <PostHogProvider>
              {children}
              <Toaster position="bottom-right" richColors />
            </PostHogProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
