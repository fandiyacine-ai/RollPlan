// Directly compute W/L totals from APIs and write to DB — bypasses Inngest
import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { eq } from 'drizzle-orm'

async function fetchAjpAllEvents(athleteId: string) {
  const firstPage = await fetch(`https://ajptour.com/en/profile/${athleteId}/events?page=1`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', Referer: `https://ajptour.com/en/profile/${athleteId}`, Origin: 'https://ajptour.com' },
    signal: AbortSignal.timeout(15000),
  }).then(r => r.json()) as any

  const allEvents = [...firstPage.data]
  for (let p = 2; p <= firstPage.last_page; p++) {
    const page = await fetch(`https://ajptour.com/en/profile/${athleteId}/events?page=${p}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', Referer: `https://ajptour.com/en/profile/${athleteId}`, Origin: 'https://ajptour.com' },
      signal: AbortSignal.timeout(15000),
    }).then(r => r.json()) as any
    allEvents.push(...page.data)
  }
  return allEvents as any[]
}

async function computeAjpWL(athleteId: string): Promise<{ wins: number; losses: number }> {
  const events = await fetchAjpAllEvents(athleteId)
  let wins = 0, losses = 0
  for (const ev of events) {
    if (ev.upcomingEvent) continue
    for (const reg of ev.registrations ?? []) {
      if (!reg.published && reg.matches.length === 0) continue
      wins += reg.matches.filter((m: any) => m.is_winner).length
      losses += reg.matches.filter((m: any) => !m.is_winner).length
    }
  }
  return { wins, losses }
}

async function computeIbjjfWL(name: string): Promise<{ wins: number; losses: number; slug: string } | null> {
  const searchResp = await fetch('https://bjjmetrics.com/search_ibjjf_matches_names', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ name }), signal: AbortSignal.timeout(15000),
  })
  const searchData = await searchResp.json() as any
  if (!searchData.success || !searchData.names?.length) return null
  const exactName = searchData.names[0].name

  const matchesResp = await fetch('https://bjjmetrics.com/get_ibjjf_matches', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ name: exactName }), signal: AbortSignal.timeout(15000),
  })
  const matchesData = await matchesResp.json() as any
  if (!matchesData.success || !matchesData.matches?.length) return null

  const wins = matchesData.matches.filter((m: any) => m.winner_name === exactName).length
  const losses = matchesData.matches.filter((m: any) => m.loser_name === exactName).length
  return { wins, losses, slug: exactName.toLowerCase().replace(/\s+/g, '-') }
}

async function computeSmWL(athleteId: string): Promise<{ wins: number; losses: number }> {
  const firstPage = await fetch(`https://smoothcomp.com/en/profile/${athleteId}/events?page=1`, {
    headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0', Referer: `https://smoothcomp.com/en/profile/${athleteId}`, Origin: 'https://smoothcomp.com' },
    signal: AbortSignal.timeout(15000),
  }).then(r => r.json()) as any

  const allEvents = [...firstPage.data]
  for (let p = 2; p <= firstPage.last_page; p++) {
    const page = await fetch(`https://smoothcomp.com/en/profile/${athleteId}/events?page=${p}`, {
      headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0', Referer: `https://smoothcomp.com/en/profile/${athleteId}`, Origin: 'https://smoothcomp.com' },
      signal: AbortSignal.timeout(15000),
    }).then(r => r.json()) as any
    allEvents.push(...page.data)
  }

  let wins = 0, losses = 0
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

const ATHLETES = [
  { name: 'Nihate Pahati',        ajpId: '285643',  scId: '1313442',  ibjjfBestResult: null },
  { name: 'Yacine Fandi',         ajpId: '139720',  scId: null,        ibjjfBestResult: 'Silver Medal – Masters Europe 2024' },
  { name: 'Milla Bahia',          ajpId: null,       scId: null,        ibjjfBestResult: null },
  { name: 'Zakriya Ismail Fandi', ajpId: '227853',  scId: '2425320',  ibjjfBestResult: null },
]

async function main() {
  for (const athlete of ATHLETES) {
    const opp = await db.select({ id: tournamentOpponents.id })
      .from(tournamentOpponents).where(eq(tournamentOpponents.opponentLabel, athlete.name)).limit(1)
    if (!opp[0]) { console.log(`${athlete.name}: not found in DB`); continue }
    const id = opp[0].id

    const update: Record<string, any> = {}

    // AJP
    if (athlete.ajpId) {
      console.log(`${athlete.name}: fetching AJP (${athlete.ajpId})…`)
      const wl = await computeAjpWL(athlete.ajpId)
      update.smoothcompAthleteId = athlete.ajpId
      update.smoothcompProfileUrl = `https://ajptour.com/en/profile/${athlete.ajpId}`
      update.ajpWins = wl.wins
      update.ajpLosses = wl.losses
      console.log(`  AJP: ${wl.wins}W/${wl.losses}L`)
    }

    // Smoothcomp
    if (athlete.scId) {
      console.log(`${athlete.name}: fetching Smoothcomp (${athlete.scId})…`)
      const wl = await computeSmWL(athlete.scId)
      update.smoothcompWins = wl.wins
      update.smoothcompLosses = wl.losses
      update.smoothcompFedUrl = `https://smoothcomp.com/en/profile/${athlete.scId}`
      console.log(`  SC: ${wl.wins}W/${wl.losses}L`)
    }

    // IBJJF
    if (athlete.ibjjfBestResult) {
      update.ibjjfBestResult = athlete.ibjjfBestResult
      console.log(`${athlete.name}: IBJJF best result: ${athlete.ibjjfBestResult}`)
    } else {
      console.log(`${athlete.name}: fetching IBJJF…`)
      const ibjjf = await computeIbjjfWL(athlete.name)
      if (ibjjf) {
        update.ibjjfWins = ibjjf.wins
        update.ibjjfLosses = ibjjf.losses
        update.ibjjfProfileUrl = `https://bjjmetrics.com/fighter/${ibjjf.slug}`
        console.log(`  IBJJF: ${ibjjf.wins}W/${ibjjf.losses}L`)
      } else {
        console.log('  IBJJF: not found')
      }
    }

    if (Object.keys(update).length > 0) {
      await db.update(tournamentOpponents).set(update).where(eq(tournamentOpponents.id, id))
      console.log(`  → saved`)
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
