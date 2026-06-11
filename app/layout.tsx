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

export const metadata: Metadata = {
  title: 'RollPlan — AI BJJ Match Analysis',
  description: 'Upload your BJJ footage. AI maps every position, event, and turning point — all traced to timestamps.',
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
