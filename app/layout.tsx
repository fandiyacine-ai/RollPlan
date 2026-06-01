import type { Metadata } from 'next'
import { Inter, Space_Grotesk, Bebas_Neue } from 'next/font/google'
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
        <body className={inter.className}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
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
