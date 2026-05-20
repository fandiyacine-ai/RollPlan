import { scrapeBracket, scrapeAthleteProfile, scrapeEventStreams } from '../lib/smoothcomp/scraper'

const BRACKET_URL = 'https://smoothcomp.com/en/event/28950/bracket/1935117'
const EVENT_ID = '28950'

async function main() {
  console.log('=== 1. Scraping bracket ===')
  const bracket = await scrapeBracket(BRACKET_URL)
  if (!bracket) { console.error('Failed to scrape bracket'); process.exit(1) }

  console.log(`Division: ${bracket.divisionName}`)
  console.log(`Published: ${bracket.bracketIsPublished}`)
  console.log(`Athletes (${bracket.athletes.length}):`)
  for (const a of bracket.athletes) {
    console.log(`  ${a.name} — ID: ${a.smoothcompAthleteId} — ${a.profileUrl}`)
  }
  console.log(`Matches found: ${bracket.matches.length}`)

  // Find Dario
  const dario = bracket.athletes.find(a => a.name.toLowerCase().includes('dario'))
  console.log(`\nDario found: ${dario ? dario.name + ' (ID: ' + dario.smoothcompAthleteId + ')' : 'NOT FOUND'}`)

  console.log('\n=== 2. Scraping event streams ===')
  const streams = await scrapeEventStreams(EVENT_ID)
  console.log(`Streams found (${streams.streams.length}):`)
  for (const s of streams.streams) {
    console.log(`  [${s.label}] → ${s.youtubeUrl}`)
  }

  // Scrape one athlete profile if found
  if (bracket.athletes.length > 0) {
    const athlete = bracket.athletes[0]
    console.log(`\n=== 3. Scraping profile: ${athlete.name} ===`)
    const profile = await scrapeAthleteProfile(athlete.profileUrl)
    if (profile) {
      console.log(`Public: ${profile.isPublic}`)
      console.log(`Name: ${profile.name}`)
      console.log(`Past competitions (${profile.pastCompetitions.length}):`)
      for (const c of profile.pastCompetitions.slice(0, 3)) {
        console.log(`  ${c.eventName} (${c.date ?? 'no date'}) — YouTube: ${c.youtubeUrl ?? 'none'}`)
      }
    } else {
      console.log('Profile scrape returned null')
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
