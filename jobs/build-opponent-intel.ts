import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents, athleteCompetitionHistory, aiCallLogs } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { google, GEMINI_VIDEO_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { searchIbjjfAthleteByName, scrapeIbjjfAthleteHistory } from '../lib/ibjjf/scraper'

// Scout Opponent Agent — web-first intelligence gathering.
// Uses Brave Search to find the athlete across AJP, Smoothcomp, IBJJF, and the broader web,
// then scrapes accessible event/result pages to build competition history.
// Avoids direct profile scraping (Cloudflare-blocked on AJP/Smoothcomp).
export const buildOpponentIntel = inngest.createFunction(
  {
    id: 'build-opponent-intel',
    name: 'Scout Opponent Agent',
    triggers: [{ event: 'opponent-intel/build.run' }],
    retries: 1,
    rateLimit: { limit: 5, period: '1m' },
  },
  async ({ event, step }: {
    event: {
      data: {
        opponentId: string
        athleteName: string
        tournamentId: string
        userId: string
      }
    }
    step: any
  }) => {
    const { opponentId, athleteName } = event.data

    const opponent = await step.run('load-opponent', () =>
      db.query.tournamentOpponents.findFirst({
        where: eq(tournamentOpponents.id, opponentId),
        columns: { smoothcompAthleteId: true, smoothcompProfileUrl: true },
      })
    )

    const result = await step.run('run-scout-agent', async () => {
      const stored: string[] = []
      const start = Date.now()

      const tools = {

        web_search: tool({
          description: 'Search the web for this athlete\'s competition results. Use targeted queries like "Athlete Name site:ajptour.com" or "Athlete Name bjj results" to find events they competed in.',
          inputSchema: z.object({
            query: z.string().describe('Search query'),
          }),
          execute: async ({ query }: { query: string }) => {
            const apiKey = process.env.BRAVE_API_KEY
            if (!apiKey) return { error: 'BRAVE_API_KEY not configured', results: [] }
            try {
              const resp = await fetch(
                `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
                {
                  headers: {
                    'X-Subscription-Token': apiKey,
                    'Accept': 'application/json',
                  },
                  signal: AbortSignal.timeout(10000),
                }
              )
              if (!resp.ok) return { error: `Search API error ${resp.status}`, results: [] }
              const data = await resp.json() as {
                web?: { results?: Array<{ title: string; url: string; description: string; extra_snippets?: string[] }> }
              }
              const results = (data.web?.results ?? []).map(r => ({
                title: r.title,
                url: r.url,
                description: r.description,
                snippets: r.extra_snippets ?? [],
              }))
              return { results }
            } catch (e) {
              return { error: String(e), results: [] }
            }
          },
        }),

        scrape_page: tool({
          description: 'Fetch the HTML content of a web page. Use for IBJJF result pages and AJP/Smoothcomp EVENT pages (URLs containing /event/). Do NOT use for profile pages (/profile/) — those are Cloudflare-protected and will fail.',
          inputSchema: z.object({
            url: z.string().describe('URL to fetch'),
          }),
          execute: async ({ url }: { url: string }) => {
            try {
              const resp = await fetch(url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                },
                signal: AbortSignal.timeout(15000),
              })
              if (!resp.ok) return { error: `HTTP ${resp.status}`, content: '' }
              const html = await resp.text()
              if (html.toLowerCase().includes('just a moment') || html.toLowerCase().includes('checking your browser')) {
                return { error: 'Cloudflare protected — skip this page', content: '' }
              }
              // Truncate to keep tokens manageable
              return { content: html.length > 60000 ? html.slice(0, 60000) : html }
            } catch (e) {
              return { error: String(e), content: '' }
            }
          },
        }),

        search_ibjjf: tool({
          description: 'Search IBJJF for an athlete by name. Returns their profile URL if found.',
          inputSchema: z.object({
            name: z.string().describe('Athlete full name'),
          }),
          execute: async ({ name }: { name: string }) => {
            const athlete = await searchIbjjfAthleteByName(name)
            if (!athlete) return { found: false }
            return { found: true, athleteId: athlete.athleteId, profileUrl: athlete.profileUrl, name: athlete.name }
          },
        }),

        scrape_ibjjf_history: tool({
          description: 'Scrape full competition history from an IBJJF athlete profile page.',
          inputSchema: z.object({
            profile_url: z.string().describe('IBJJF athlete profile URL'),
            athlete_id: z.string().describe('IBJJF athlete ID'),
          }),
          execute: async ({ profile_url, athlete_id }: { profile_url: string; athlete_id: string }) => {
            const competitions = await scrapeIbjjfAthleteHistory(profile_url)
            return { count: competitions.length, competitions: competitions.slice(0, 30), athlete_id }
          },
        }),

        store_history: tool({
          description: 'Store competition history for this opponent. Call once per source/federation. Deduplicates automatically.',
          inputSchema: z.object({
            federation: z.enum(['smoothcomp', 'ajp', 'ibjjf', 'web']).describe('Source of these results'),
            smoothcomp_athlete_id: z.string().describe('Athlete ID (use smoothcompAthleteId if known, otherwise athlete name slug)'),
            competitions: z.array(z.object({
              event_name: z.string(),
              event_id: z.string(),
              event_url: z.string().optional(),
              event_date: z.string().nullable().optional(),
              placement: z.string().nullable().optional(),
            })),
            update_profile_url: z.string().optional().describe('Pass a discovered profile URL to link it to this opponent'),
          }),
          execute: async ({ federation, smoothcomp_athlete_id, competitions, update_profile_url }: {
            federation: 'smoothcomp' | 'ajp' | 'ibjjf' | 'web'
            smoothcomp_athlete_id: string
            competitions: Array<{ event_name: string; event_id: string; event_url?: string; event_date?: string | null; placement?: string | null }>
            update_profile_url?: string
          }) => {
            if (update_profile_url) {
              const idMatch = update_profile_url.match(/\/profile\/(\d+)/)
              await db.update(tournamentOpponents).set({
                smoothcompAthleteId: idMatch?.[1] ?? smoothcomp_athlete_id,
                smoothcompProfileUrl: update_profile_url,
                footageStatus: 'pending',
              }).where(eq(tournamentOpponents.id, opponentId))
            }

            let inserted = 0
            for (const comp of competitions) {
              if (!comp.event_name || comp.event_name.length < 2) continue
              const rows = await db
                .insert(athleteCompetitionHistory)
                .values({
                  smoothcompAthleteId: smoothcomp_athlete_id,
                  tournamentOpponentId: opponentId,
                  federation: federation === 'web' ? 'smoothcomp' : federation,
                  eventName: comp.event_name,
                  eventId: comp.event_id || `${federation}-${comp.event_name.slice(0, 20)}`,
                  eventUrl: comp.event_url ?? null,
                  eventDate: comp.event_date ?? null,
                  placement: comp.placement ?? null,
                })
                .onConflictDoNothing()
                .returning({ id: athleteCompetitionHistory.id })
              if (rows.length > 0) {
                inserted++
                stored.push(comp.event_id)
              }
            }
            return { inserted, total_stored: stored.length }
          },
        }),

        finish: tool({
          description: 'Signal completion when all sources have been checked.',
          inputSchema: z.object({
            summary: z.string().describe('What was found and stored'),
            total_events_stored: z.number(),
          }),
          execute: async ({ summary, total_events_stored }: { summary: string; total_events_stored: number }) => {
            return { done: true, summary, total_events_stored }
          },
        }),

      }

      const knownProfile = opponent?.smoothcompProfileUrl
        ? `\nKnown Smoothcomp/AJP athlete ID: ${opponent.smoothcompAthleteId} (profile URL: ${opponent.smoothcompProfileUrl})`
        : ''

      const { text, usage, steps } = await generateText({
        model: google(GEMINI_VIDEO_MODEL),
        stopWhen: stepCountIs(25),
        system: `You are a BJJ competition intelligence agent. Your goal: build the most complete competition history possible for an opponent athlete by searching across AJP Tour, Smoothcomp, IBJJF, and the broader web.

## Key facts
- AJP/Smoothcomp PROFILE pages (/en/profile/ID) are Cloudflare-protected — do NOT try to scrape them directly
- AJP/Smoothcomp EVENT pages (/en/event/ID) are publicly accessible — scrape these when found
- IBJJF has its own search tool — always try it
- Web search snippets often contain placement data without needing to scrape the page

## Strategy
1. **IBJJF**: Always run search_ibjjf(name). If found, run scrape_ibjjf_history.
2. **Web search — targeted**: Run web_search("${athleteName}" site:ajptour.com) to find AJP events.
3. **Web search — broad**: Run web_search("${athleteName}" bjj competition results) for any other sources.
4. **Scrape accessible pages**: For any AJP/Smoothcomp /event/ URLs found (NOT /profile/ URLs), try scrape_page. Extract competition names, dates, and placements from the HTML or snippets.
5. **Store everything found**: Use store_history with whatever data you extracted. Even 1 event is useful.
6. **Finish**: Call finish() with a summary.

## Extracting results from search snippets
Search result descriptions often contain placement data like "1st place", "gold medal", event names and dates. Extract these directly from the snippets without needing to visit the page if the page would be Cloudflare-blocked.

## Quality over quantity
Store only confirmed results. If a snippet says "Athlete Name won gold at Event X", that's a valid entry. Federation = "ajp" for AJP Tour events, "smoothcomp" for other Smoothcomp events, "ibjjf" for IBJJF.`,

        prompt: `Athlete: ${athleteName}${knownProfile}

Search across all sources and store their competition history.`,
        tools,
      })

      const tokensIn = usage.inputTokens ?? 0
      const tokensOut = usage.outputTokens ?? 0
      const costUsdEstimate = estimateCostUsd(GEMINI_VIDEO_MODEL, tokensIn, tokensOut)

      await db.insert(aiCallLogs).values({
        model: GEMINI_VIDEO_MODEL,
        promptVersion: 'scout-opponent-agent-v2',
        tokensIn,
        tokensOut,
        costUsdEstimate,
        latencyMs: Math.round(Date.now() - start),
        status: 'success',
      }).catch(() => null)

      const elapsed = Math.round((Date.now() - start) / 1000)
      return { eventsStored: stored.length, stepsUsed: steps.length, elapsed, summary: text }
    })

    return result
  }
)
