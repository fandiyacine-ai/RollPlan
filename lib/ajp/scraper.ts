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
// AJP Tour has no public athlete search directory — the /en/profiles path returns 404.
// Athletes are discovered only via bracket scraping (smoothcomp-process-bracket job).
// This function is a no-op stub; profile linking for manually-added opponents
// requires a bracket import or explicit profile URL from the user.
export async function searchAjpAthleteByName(name: string): Promise<AjpAthleteRef | null> {
  void name
  return null
}
