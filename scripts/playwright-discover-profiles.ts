// Playwright-based profile discovery for athletes not indexed by search APIs.
// Flow: Google → event page URLs → participants API → athlete ID.
// Saves verified profiles + W/L totals directly to DB.

import { chromium } from 'playwright'
import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { eq } from 'drizzle-orm'

const ATHLETES: Array<{ name: string; smoothcomp?: true; ajp?: true }> = [
  { name: 'Nihate Pahati', smoothcomp: true },
  { name: 'Zakriya Ismail Fandi', smoothcomp: true },
]

// ── name verification helpers ──────────────────────────────────────────────

const SC_BASE = 'https://smoothcomp.com'

async function verifySmoothcompProfile(athleteId: string, expectedName: string): Promise<boolean> {
  try {
    const evResp = await fetch(`${SC_BASE}/en/profile/${athleteId}/events?page=1`, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        Referer: `${SC_BASE}/en/profile/${athleteId}`,
        Origin: SC_BASE,
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!evResp.ok) return false
    const evData = await evResp.json() as { data?: Array<{ info: { id: number }; upcomingEvent: boolean }> }
    const firstEvent = evData.data?.find(ev => !ev.upcomingEvent)
    if (!firstEvent) return false

    const pResp = await fetch(`${SC_BASE}/en/event/${firstEvent.info.id}/participants`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!pResp.ok) return false
    const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }

    const nameParts = expectedName.toLowerCase().split(/\s+/).filter(p => p.length > 1)
    const threshold = nameParts.length <= 3 ? nameParts.length : Math.ceil(nameParts.length * 2 / 3)

    for (const participant of pData.participants ?? []) {
      for (const reg of participant.registrations ?? []) {
        if (String(reg.user_id) !== athleteId) continue
        const fullName = `${reg.firstname} ${reg.lastname}`.toLowerCase()
        const matchCount = nameParts.filter(p => fullName.includes(p)).length
        if (matchCount >= threshold) { console.log(`    verified: "${reg.firstname} ${reg.lastname}"`); return true }
      }
    }
    return false
  } catch { return false }
}

async function findIdFromSmoothcompEvent(eventId: string, expectedName: string): Promise<string | null> {
  try {
    const pResp = await fetch(`${SC_BASE}/en/event/${eventId}/participants`, {

      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!pResp.ok) return null
    const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }

    const nameParts = expectedName.toLowerCase().split(/\s+/).filter(p => p.length > 1)
    const threshold = nameParts.length <= 3 ? nameParts.length : Math.ceil(nameParts.length * 2 / 3)

    for (const participant of pData.participants ?? []) {
      for (const reg of participant.registrations ?? []) {
        const fullName = `${reg.firstname} ${reg.lastname}`.toLowerCase()
        const matchCount = nameParts.filter(p => fullName.includes(p)).length
        if (matchCount >= threshold) {
          console.log(`    found in event ${eventId}: "${reg.firstname} ${reg.lastname}" → user_id=${reg.user_id}`)
          return String(reg.user_id)
        }
      }
    }
    return null
  } catch { return null }
}

// ── smoothcomp W/L fetcher ─────────────────────────────────────────────────

async function fetchSmWL(athleteId: string): Promise<{ wins: number; losses: number }> {
  let wins = 0, losses = 0

  const headers = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Referer: `${SC_BASE}/en/profile/${athleteId}`,
    Origin: SC_BASE,
  }

  const fetchPage = async (p: number) => {
    const resp = await fetch(`${SC_BASE}/en/profile/${athleteId}/events?page=${p}`, { headers, signal: AbortSignal.timeout(15000) })
    if (!resp.ok) return null
    return resp.json() as Promise<any>
  }

  const firstPage = await fetchPage(1)
  if (!firstPage) { console.log(`    events API failed for athlete ${athleteId}`); return { wins, losses } }

  const allEvents = [...firstPage.data]
  for (let p = 2; p <= firstPage.last_page; p++) {
    const page = await fetchPage(p)
    if (page) allEvents.push(...page.data)
  }

  for (const ev of allEvents) {
    if (ev.upcomingEvent) continue
    for (const reg of ev.registrations ?? []) {
      if (!reg.published && reg.matches.length === 0) continue
      wins += reg.matches.filter((m: any) => m.is_winner).length
      losses += reg.matches.filter((m: any) => !m.is_winner).length
    }
  }
  return { wins, losses }
}

// ── Playwright search ──────────────────────────────────────────────────────

async function findSmoothcompViaPlaywright(name: string): Promise<{ baseUrl: string; athleteId: string } | null> {
  const browser = await chromium.launch({
    headless: false, // headed mode avoids bot detection
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  try {
    for (const [engine, urlFn] of [
      ['DuckDuckGo', (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}&kl=us-en`],
      ['Bing', (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`],
    ] as Array<[string, (q: string) => string]>) {
      const parts = name.trim().split(/\s+/)
      const searchQueries = [
        `"${name}" site:smoothcomp.com`,
        `${name} site:smoothcomp.com`,
        ...(parts.length >= 3 ? [`"${parts[0]} ${parts[parts.length-1]}" site:smoothcomp.com`, `${parts[0]} ${parts[parts.length-1]} site:smoothcomp.com`] : []),
        ...(parts.length >= 2 ? [`${parts[parts.length-1]} site:smoothcomp.com`] : []),
      ]
      for (const query of searchQueries) {
        console.log(`  searching ${engine}: ${query}`)
        try { await page.goto(urlFn(query), { timeout: 20000 }) } catch { continue }
        await page.waitForLoadState('domcontentloaded').catch(() => {})
        await page.waitForTimeout(1500)

        // Extract all smoothcomp.com URLs from search result links
        const rawLinks = await page.$$eval('a[href]', (els) =>
          els.map(el => (el as HTMLAnchorElement).href).filter(h => h.includes('smoothcomp.com'))
        )
        const links = [...new Set(rawLinks)]

        console.log(`    found ${links.length} smoothcomp URLs`)
        if (links.length > 0) console.log(`    sample: ${links.slice(0, 3).join(' | ')}`)

        // Only look at smoothcomp.com main domain links (no subdomains)
        const scLinks = links.filter(l => /^https?:\/\/smoothcomp\.com\//.test(l))

        // First try direct profile URLs
        for (const link of scLinks) {
          const m = link.match(/^https?:\/\/smoothcomp\.com\/[a-z]{0,5}\/profile\/(\d+)/)
          if (m) {
            console.log(`    checking profile ${m[1]}…`)
            const ok = await verifySmoothcompProfile(m[1], name)
            if (ok) { await browser.close(); return { baseUrl: SC_BASE, athleteId: m[1] } }
          }
        }

        // Then try event URLs → participants API
        const eventsSeen = new Set<string>()
        for (const link of scLinks) {
          const m = link.match(/^https?:\/\/smoothcomp\.com\/[a-z]{0,5}\/event\/(\d+)/)
          if (m && !eventsSeen.has(m[1])) {
            eventsSeen.add(m[1])
            console.log(`    checking event ${m[1]}…`)
            const athleteId = await findIdFromSmoothcompEvent(m[1], name)
            if (athleteId) { await browser.close(); return { baseUrl: SC_BASE, athleteId } }
          }
        }

      }
    }

    // Try smoothcomp.com's own athlete search
    console.log('  trying smoothcomp.com internal search…')
    await page.goto('https://smoothcomp.com/en/athletes')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const searchInput = await page.$('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i], input[placeholder*="athlete" i]')
    if (searchInput) {
      await searchInput.fill(name)
      await page.waitForTimeout(2500)

      const profileLinks = await page.$$eval('a[href*="smoothcomp.com/en/profile/"]', (els) =>
        els.map(el => (el as HTMLAnchorElement).href)
          .filter(h => /^https?:\/\/smoothcomp\.com\//.test(h))
      )
      console.log(`    smoothcomp athlete search found ${profileLinks.length} profile links`)
      for (const link of profileLinks) {
        const m = link.match(/^https?:\/\/smoothcomp\.com\/[a-z]{0,5}\/profile\/(\d+)/)
        if (m) {
          const ok = await verifySmoothcompProfile(m[1], name)
          if (ok) { await browser.close(); return { baseUrl: SC_BASE, athleteId: m[1] } }
        }
      }
    }

    await browser.close()
    return null
  } catch (e) {
    await browser.close()
    throw e
  }
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  for (const athlete of ATHLETES) {
    const opp = await db.select({ id: tournamentOpponents.id })
      .from(tournamentOpponents)
      .where(eq(tournamentOpponents.opponentLabel, athlete.name))
      .limit(1)
    if (!opp[0]) { console.log(`${athlete.name}: not found in DB`); continue }
    const id = opp[0].id

    if (athlete.smoothcomp) {
      console.log(`\n${athlete.name}: looking for Smoothcomp profile…`)
      const profile = await findSmoothcompViaPlaywright(athlete.name)
      if (!profile) {
        console.log(`  → not found`)
        continue
      }
      console.log(`  → profile ${profile.athleteId} at smoothcomp.com`)

      const wl = await fetchSmWL(profile.athleteId)
      console.log(`  → W/L: ${wl.wins}W/${wl.losses}L`)

      const fedUrl = `${SC_BASE}/en/profile/${profile.athleteId}`
      await db.update(tournamentOpponents)
        .set({
          smoothcompWins: wl.wins,
          smoothcompLosses: wl.losses,
          smoothcompFedUrl: fedUrl,
        })
        .where(eq(tournamentOpponents.id, id))
      console.log(`  → saved`)
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
