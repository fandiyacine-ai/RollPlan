import { chromium, type Browser } from 'playwright'

// AJP Tour (ajptour.com) runs on Smoothcomp's platform.
// Athlete IDs and profile structure are identical to smoothcomp.com.
// Use this to find an athlete's Smoothcomp-compatible profile when they
// were not discovered via a bracket scrape (e.g. manually added opponent).

const AJP_BASE = 'https://ajptour.com'

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
]

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, args: BROWSER_ARGS })
}

export type AjpAthleteRef = {
  name: string
  athleteId: string
  profileUrl: string
}

// Search ajptour.com for an athlete by name.
// Returns a Smoothcomp-compatible profile URL (same platform, same IDs).
// The returned profile URL can be passed directly to scrapeAthleteProfile()
// from lib/smoothcomp/scraper.ts.
export async function searchAjpAthleteByName(name: string): Promise<AjpAthleteRef | null> {
  const browser = await launchBrowser()
  try {
    const ctx = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    const page = await ctx.newPage()

    const encoded = encodeURIComponent(name)
    // AJP uses Smoothcomp's profile search — try multiple path variations
    await page.goto(`${AJP_BASE}/en/profiles?name=${encoded}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })
    await page.waitForTimeout(3000)

    const result = await page.evaluate((args: { targetName: string }) => {
      const { targetName } = args
      const nameParts = targetName.toLowerCase().split(' ').filter(p => p.length > 1)
      const threshold = Math.ceil(nameParts.length * 0.6)

      // AJP uses same Smoothcomp profile links: /en/profile/{id}
      const links = Array.from(document.querySelectorAll(
        'a[href*="/en/profile/"], a[href*="/profile/"]'
      ))

      for (const el of links) {
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (text.length < 2) continue
        const textLower = text.toLowerCase()
        const matchCount = nameParts.filter(p => textLower.includes(p)).length
        if (matchCount >= threshold) {
          const href = (el as HTMLAnchorElement).href
          const m = href.match(/\/profile\/(\d+)/)
          if (!m) continue
          return { name: text, athleteId: m[1], profileUrl: href }
        }
      }
      return null
    }, { targetName: name })

    return result
  } catch {
    return null
  } finally {
    await browser.close()
  }
}
