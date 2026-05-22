/**
 * Technique KB Seed Agent
 *
 * Opens a real browser (Playwright), searches YouTube for BJJ instructionals,
 * filters by trusted channels, and queues found videos through the existing
 * Inngest ingest pipeline. Auto-approve is handled inside the ingest job
 * when source_quality === 'high'.
 *
 * Usage:
 *   npx tsx scripts/seed-technique-kb.ts
 *   npx tsx scripts/seed-technique-kb.ts --gaps   # only seed missing event_id/position_id combos
 *   npx tsx scripts/seed-technique-kb.ts --dry-run # log URLs without queuing
 */

import { chromium } from 'playwright'
import { Inngest } from 'inngest'
import 'dotenv/config'

// ── Config ────────────────────────────────────────────────────────────────────

const VIDEOS_PER_SEARCH = 2          // how many videos to queue per technique+position
const DELAY_MS = 1500                // delay between YouTube searches (be polite)
const DRY_RUN = process.argv.includes('--dry-run')
const GAPS_ONLY = process.argv.includes('--gaps')

const TRUSTED_CHANNELS = [
  'danaher', 'bernardo faria', 'lachlan giles', 'craig jones',
  'gordon ryan', 'marcelo garcia', 'keenan cornelius', 'geo martinez',
  'chewjitsu', 'stephan kesting', 'priit mihkelson', 'john danaher',
  'bjj fanatics', 'firas zahabi', 'ryan hall', 'garry tonon',
  'mikey musumeci', 'knight jiu jitsu', 'knight jiujitsu',
]

// ── Seed matrix ───────────────────────────────────────────────────────────────
// event_id × position_id combinations that are most common in competition BJJ.
// Each becomes a YouTube search query.

type Seed = {
  eventId: string
  positionId: string | null   // null = general (any position)
  searchQuery: string         // exact query to use on YouTube
  hint: string                // passed as techniqueHint to the ingest job
}

const SEEDS: Seed[] = [
  // ── Armbar ─────────────────────────────────────────────────────────────────
  { eventId: 'armbar', positionId: 'mount',         searchQuery: 'armbar from mount BJJ tutorial',                hint: 'armbar from mount' },
  { eventId: 'armbar', positionId: 'closed_guard',  searchQuery: 'armbar from closed guard BJJ tutorial',         hint: 'armbar from closed guard' },
  { eventId: 'armbar', positionId: 'back_control',  searchQuery: 'armbar from back control BJJ tutorial',         hint: 'armbar from back' },
  { eventId: 'armbar', positionId: 'side_control',  searchQuery: 'armbar from side control BJJ tutorial',         hint: 'armbar from side control' },
  { eventId: 'armbar', positionId: 'open_guard',    searchQuery: 'flying armbar BJJ instructional tutorial',      hint: 'armbar from open guard' },

  // ── Triangle ───────────────────────────────────────────────────────────────
  { eventId: 'triangle', positionId: 'closed_guard',  searchQuery: 'triangle choke from closed guard BJJ tutorial',   hint: 'triangle from closed guard' },
  { eventId: 'triangle', positionId: 'mount',          searchQuery: 'triangle choke from mount BJJ tutorial',          hint: 'triangle from mount' },
  { eventId: 'triangle', positionId: 'back_control',   searchQuery: 'triangle choke from back BJJ instructional',      hint: 'triangle from back' },
  { eventId: 'triangle', positionId: 'open_guard',     searchQuery: 'triangle choke setup guard BJJ instructional',    hint: 'triangle from guard' },

  // ── Kimura ─────────────────────────────────────────────────────────────────
  { eventId: 'kimura', positionId: 'turtle',         searchQuery: 'kimura from turtle position BJJ tutorial',     hint: 'kimura from turtle' },
  { eventId: 'kimura', positionId: 'half_guard',     searchQuery: 'kimura from half guard BJJ tutorial',          hint: 'kimura from half guard' },
  { eventId: 'kimura', positionId: 'side_control',   searchQuery: 'kimura from side control BJJ tutorial',        hint: 'kimura from side control' },
  { eventId: 'kimura', positionId: 'closed_guard',   searchQuery: 'kimura from closed guard BJJ tutorial',        hint: 'kimura from guard' },

  // ── Rear Naked Choke ───────────────────────────────────────────────────────
  { eventId: 'rear_naked_choke', positionId: 'back_control', searchQuery: 'rear naked choke finish BJJ tutorial mechanics', hint: 'rear naked choke from back' },
  { eventId: 'rear_naked_choke', positionId: 'turtle',       searchQuery: 'rear naked choke from turtle back take BJJ',     hint: 'rear naked choke from turtle' },

  // ── Guillotine ─────────────────────────────────────────────────────────────
  { eventId: 'guillotine', positionId: 'closed_guard',  searchQuery: 'guillotine choke from closed guard BJJ tutorial',   hint: 'guillotine from guard' },
  { eventId: 'guillotine', positionId: 'standing',      searchQuery: 'standing guillotine choke BJJ wrestling tutorial',  hint: 'standing guillotine' },
  { eventId: 'guillotine', positionId: 'half_guard',    searchQuery: 'guillotine choke from half guard BJJ tutorial',     hint: 'guillotine from half guard' },

  // ── Omoplata ───────────────────────────────────────────────────────────────
  { eventId: 'omoplata', positionId: 'closed_guard',  searchQuery: 'omoplata from closed guard BJJ tutorial',    hint: 'omoplata from closed guard' },
  { eventId: 'omoplata', positionId: 'open_guard',    searchQuery: 'omoplata setup open guard BJJ instructional', hint: 'omoplata from open guard' },

  // ── Heel Hook ──────────────────────────────────────────────────────────────
  { eventId: 'heel_hook', positionId: 'ashi_garami',    searchQuery: 'inside heel hook ashi garami BJJ instructional',        hint: 'inside heel hook from ashi garami' },
  { eventId: 'heel_hook', positionId: 'fifty_fifty',    searchQuery: 'outside heel hook 50 50 guard BJJ instructional',       hint: 'heel hook from 50/50' },
  { eventId: 'heel_hook', positionId: 'single_leg_x',   searchQuery: 'heel hook single leg x guard SLX BJJ tutorial',        hint: 'heel hook from single leg x' },
  { eventId: 'heel_hook', positionId: 'de_la_riva',     searchQuery: 'heel hook de la riva guard entry BJJ instructional',   hint: 'heel hook from de la riva' },

  // ── Kneebar ────────────────────────────────────────────────────────────────
  { eventId: 'kneebar', positionId: null,  searchQuery: 'kneebar BJJ leg lock tutorial mechanics', hint: 'kneebar' },

  // ── Sweeps ─────────────────────────────────────────────────────────────────
  { eventId: 'sweep', positionId: 'closed_guard',    searchQuery: 'sweep from closed guard BJJ hip bump scissor tutorial',    hint: 'sweep from closed guard' },
  { eventId: 'sweep', positionId: 'butterfly_guard', searchQuery: 'butterfly guard sweep BJJ tutorial',                       hint: 'butterfly guard sweep' },
  { eventId: 'sweep', positionId: 'half_guard',      searchQuery: 'half guard sweep BJJ tutorial',                            hint: 'half guard sweep' },
  { eventId: 'sweep', positionId: 'de_la_riva',      searchQuery: 'de la riva sweep BJJ tutorial',                            hint: 'de la riva sweep' },
  { eventId: 'sweep', positionId: 'x_guard',         searchQuery: 'x guard sweep BJJ tutorial',                               hint: 'x guard sweep' },

  // ── Guard Pass ─────────────────────────────────────────────────────────────
  { eventId: 'pass', positionId: 'closed_guard',   searchQuery: 'guard pass closed guard BJJ break open tutorial',   hint: 'pass closed guard' },
  { eventId: 'pass', positionId: 'half_guard',     searchQuery: 'half guard pass BJJ tutorial',                      hint: 'pass half guard' },
  { eventId: 'pass', positionId: 'butterfly_guard',searchQuery: 'butterfly guard pass BJJ tutorial',                 hint: 'pass butterfly guard' },
  { eventId: 'pass', positionId: 'de_la_riva',     searchQuery: 'de la riva guard pass BJJ tutorial',                hint: 'pass de la riva' },

  // ── Back Take ──────────────────────────────────────────────────────────────
  { eventId: 'back_take', positionId: 'turtle',       searchQuery: 'back take from turtle BJJ tutorial',         hint: 'back take from turtle' },
  { eventId: 'back_take', positionId: 'side_control',  searchQuery: 'back take from side control BJJ tutorial',  hint: 'back take from side control' },
  { eventId: 'back_take', positionId: 'mount',         searchQuery: 'back take from mount BJJ tutorial',         hint: 'back take from mount' },
]

// ── YouTube search ────────────────────────────────────────────────────────────

type VideoResult = { url: string; title: string; channel: string }

async function searchYouTube(page: import('playwright').Page, query: string): Promise<VideoResult[]> {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D` // filter: video type
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(1200) // let the results render

  // Grab video cards
  const results = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer'))
    return cards.slice(0, 12).map(card => {
      const titleEl = card.querySelector('#video-title') as HTMLAnchorElement | null
      const channelEl = card.querySelector('#channel-name a, ytd-channel-name a') as HTMLElement | null
      const href = titleEl?.href ?? ''
      const videoId = href.match(/[?&]v=([^&]+)/)?.[1]
      return {
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        title: titleEl?.textContent?.trim() ?? '',
        channel: channelEl?.textContent?.trim() ?? '',
      }
    }).filter(r => r.url)
  })

  return results
}

function isTrustedChannel(channel: string): boolean {
  const lower = channel.toLowerCase()
  return TRUSTED_CHANNELS.some(trusted => lower.includes(trusted))
}

function pickVideos(results: VideoResult[], count: number): VideoResult[] {
  // Prefer trusted channels, fall back to top results
  const trusted = results.filter(r => isTrustedChannel(r.channel))
  const picks = trusted.length >= count ? trusted : [...trusted, ...results.filter(r => !isTrustedChannel(r.channel))]
  return picks.slice(0, count)
}

// ── Gap detection (optional --gaps flag) ──────────────────────────────────────

async function getMissingSeeds(): Promise<Set<string>> {
  // Import DB here only if needed (avoids loading all of Next.js env)
  const { db } = await import('../lib/db')
  const { techniqueVariants } = await import('../lib/db/schema')
  const { eq } = await import('drizzle-orm')

  const existing = await db.query.techniqueVariants.findMany({
    columns: { eventId: true, positionId: true, status: true },
    where: eq(techniqueVariants.status, 'active'),
  })

  const covered = new Set(existing.map(v => `${v.eventId}::${v.positionId ?? 'null'}`))
  return covered
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🥋 Technique KB Seed Agent`)
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no queuing)' : 'LIVE'}`)
  console.log(`   Videos per search: ${VIDEOS_PER_SEARCH}`)
  console.log(`   Seeds: ${SEEDS.length} technique × position combinations\n`)

  let covered: Set<string> | null = null
  if (GAPS_ONLY) {
    console.log('  Loading existing technique library to find gaps…')
    covered = await getMissingSeeds()
    console.log(`  ${covered.size} combos already covered\n`)
  }

  const inngest = new Inngest({ id: 'rollplan', eventKey: process.env.INNGEST_EVENT_KEY })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  let queued = 0
  let skipped = 0
  let noResults = 0

  for (const seed of SEEDS) {
    const key = `${seed.eventId}::${seed.positionId ?? 'null'}`

    if (GAPS_ONLY && covered && covered.has(key)) {
      skipped++
      continue
    }

    process.stdout.write(`  🔍 ${seed.hint.padEnd(40)} `)

    let results: VideoResult[] = []
    try {
      results = await searchYouTube(page, seed.searchQuery)
    } catch (err) {
      console.log(`SEARCH ERROR: ${err instanceof Error ? err.message : String(err)}`)
      await new Promise(r => setTimeout(r, DELAY_MS * 2))
      continue
    }

    const picks = pickVideos(results, VIDEOS_PER_SEARCH)

    if (picks.length === 0) {
      console.log('no results')
      noResults++
      await new Promise(r => setTimeout(r, DELAY_MS))
      continue
    }

    const channelInfo = picks.map(p => `${isTrustedChannel(p.channel) ? '✓' : '?'} ${p.channel}`).join(', ')
    console.log(`→ ${picks.length} videos  (${channelInfo})`)

    if (!DRY_RUN) {
      for (const pick of picks) {
        await inngest.send({
          name: 'technique/ingest-requested',
          data: {
            youtubeUrl: pick.url,
            techniqueHint: seed.hint,
            positionHint: seed.positionId ?? undefined,
            requestedByUserId: 'seed-agent',
          },
        })
        queued++
      }
    } else {
      picks.forEach(p => console.log(`     → ${p.url}  [${p.channel}]`))
      queued += picks.length
    }

    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  await browser.close()

  console.log(`\n  ✅ Done`)
  console.log(`     Queued: ${queued} videos`)
  if (skipped > 0) console.log(`     Skipped (already covered): ${skipped}`)
  if (noResults > 0) console.log(`     No results found: ${noResults} searches`)
  if (!DRY_RUN && queued > 0) {
    console.log(`\n  Each video will take ~60–120s to process (Gemini extracts visual cues).`)
    console.log(`  Check /admin/techniques for drafts — high-quality ones auto-approve.`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
