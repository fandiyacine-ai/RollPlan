import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents, athleteCompetitionHistory, aiCallLogs } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { google, GEMINI_VIDEO_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { searchIbjjfAthleteByName, scrapeIbjjfAthleteHistory } from '../lib/ibjjf/scraper'
import { scrapeProfileForIntel } from '../lib/smoothcomp/scraper'

// Scout Opponent Agent — triggered whenever an opponent is created.
// Claude searches IBJJF, Smoothcomp, and AJP by athlete name, scrapes any profiles found,
// and stores competition history to athlete_competition_history.
// Replaces the rigid pipeline with an agent that can reason about edge cases:
// name variations, multiple profile matches, federation-specific URL patterns, etc.
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

    // Load any profile URL already linked to this opponent
    const opponent = await step.run('load-opponent', () =>
      db.query.tournamentOpponents.findFirst({
        where: eq(tournamentOpponents.id, opponentId),
        columns: { smoothcompAthleteId: true, smoothcompProfileUrl: true },
      })
    )

    const result = await step.run('run-scout-agent', async () => {
      const stored: string[] = [] // event IDs written to DB
      const start = Date.now()

      const tools = {

        search_ibjjf: tool({
          description: 'Search IBJJF for an athlete by name. Returns their profile URL if found.',
          inputSchema: z.object({
            name: z.string().describe('Athlete full name to search'),
          }),
          execute: async ({ name }: { name: string }) => {
            const athlete = await searchIbjjfAthleteByName(name)
            if (!athlete) return { found: false }
            return { found: true, athleteId: athlete.athleteId, profileUrl: athlete.profileUrl, name: athlete.name }
          },
        }),

        scrape_ibjjf_history: tool({
          description: 'Scrape competition history from an IBJJF athlete profile page.',
          inputSchema: z.object({
            profile_url: z.string().describe('IBJJF athlete profile URL'),
            athlete_id: z.string().describe('IBJJF athlete ID'),
          }),
          execute: async ({ profile_url, athlete_id }: { profile_url: string; athlete_id: string }) => {
            const competitions = await scrapeIbjjfAthleteHistory(profile_url)
            return { count: competitions.length, competitions: competitions.slice(0, 30), athlete_id }
          },
        }),

        scrape_smoothcomp_profile: tool({
          description: 'Scrape an athlete profile from Smoothcomp or AJP Tour using stealth browser + Gemini vision. Handles Cloudflare-protected pages. Works for both smoothcomp.com and ajptour.com profile URLs.',
          inputSchema: z.object({
            profile_url: z.string().describe('Full profile URL (smoothcomp.com/en/profile/ID or ajptour.com/en/profile/ID)'),
          }),
          execute: async ({ profile_url }: { profile_url: string }) => {
            const result = await scrapeProfileForIntel(profile_url)
            return {
              is_public: result.isPublic,
              athlete_id: result.athleteId,
              name: result.name,
              competition_count: result.competitions.length,
              competitions: result.competitions.slice(0, 30),
            }
          },
        }),

        store_history: tool({
          description: 'Store competition history rows for this opponent. Call once per federation after scraping. Deduplicates automatically.',
          inputSchema: z.object({
            federation: z.enum(['smoothcomp', 'ajp', 'ibjjf']).describe('Federation these results are from'),
            smoothcomp_athlete_id: z.string().describe('Athlete ID from the federation (prefix with "ibjjf-" for IBJJF)'),
            competitions: z.array(z.object({
              event_name: z.string(),
              event_id: z.string(),
              event_url: z.string().optional(),
              event_date: z.string().nullable().optional(),
              placement: z.string().nullable().optional(),
            })).describe('Competition entries to store'),
            update_profile_url: z.string().optional().describe('If found a new profile URL for this opponent, pass it here to update the record'),
          }),
          execute: async ({ federation, smoothcomp_athlete_id, competitions, update_profile_url }: {
            federation: 'smoothcomp' | 'ajp' | 'ibjjf'
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
                  federation,
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
          description: 'Signal completion. Call when all available federation data has been searched and stored.',
          inputSchema: z.object({
            summary: z.string().describe('Brief summary of what was found and stored'),
            total_events_stored: z.number(),
          }),
          execute: async ({ summary, total_events_stored }: { summary: string; total_events_stored: number }) => {
            return { done: true, summary, total_events_stored }
          },
        }),

      }

      const knownProfile = opponent?.smoothcompProfileUrl
        ? `\nKnown profile URL already linked: ${opponent.smoothcompProfileUrl} (athlete ID: ${opponent.smoothcompAthleteId})`
        : '\nNo profile URL linked yet — you must find one.'

      const { text, usage, steps } = await generateText({
        model: google(GEMINI_VIDEO_MODEL),
        stopWhen: stepCountIs(20),
        system: `You are a BJJ competition intelligence agent. Your job is to find an athlete's full competition history across all major BJJ federations and store it to a database.

The athlete will compete against the user's fighter at an upcoming tournament. The richer the history, the better the scouting report.

## Federations to check
1. **Smoothcomp/AJP** — same platform, use scrape_smoothcomp_profile. AJP profile URLs use ajptour.com/en/profile/ID, Smoothcomp uses smoothcomp.com/en/profile/ID. If one fails, try the other with the same ID.
2. **IBJJF** — use search_ibjjf then scrape_ibjjf_history.

## Workflow
1. If a profile URL is already known, start by scraping it immediately.
2. Search IBJJF for the athlete by name.
3. If no profile linked yet, note that AJP/Smoothcomp search has no public directory — you can only scrape if you have a URL.
4. Store whatever you found with store_history (one call per federation).
5. Call finish().

## Important
- If scraping returns is_public: false, the page was blocked or the profile is private — note it but don't retry.
- Store even partial data (e.g. 2–3 events is still useful).
- Don't try the same URL twice.`,

        prompt: `Athlete name: ${athleteName}${knownProfile}

Find and store their competition history. Start with the known profile if available, then check IBJJF.`,
        tools,
      })

      const tokensIn = usage.inputTokens ?? 0
      const tokensOut = usage.outputTokens ?? 0
      const costUsdEstimate = estimateCostUsd(GEMINI_VIDEO_MODEL, tokensIn, tokensOut)

      await db.insert(aiCallLogs).values({
        model: GEMINI_VIDEO_MODEL,
        promptVersion: 'scout-opponent-agent-v1',
        tokensIn,
        tokensOut,
        costUsdEstimate,
        latencyMs: Math.round(Date.now() - start),
        status: 'success',
      }).catch(() => null) // don't fail the job over logging

      const elapsed = Math.round((Date.now() - start) / 1000)
      return { eventsStored: stored.length, stepsUsed: steps.length, elapsed, summary: text }
    })

    return result
  }
)
