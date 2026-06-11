/**
 * Technique KB Agent
 *
 * Runs daily at 3am UTC. Claude autonomously:
 *   1. Identifies gaps — event/position combos with <2 active variants
 *   2. Searches YouTube for quality instructionals per gap
 *   3. Evaluates each result (title, channel, description)
 *   4. Queues promising videos through the existing ingest pipeline
 *   5. Stops when gaps are filled or the daily search budget is reached
 *
 * Requires: YOUTUBE_DATA_API_KEY env var
 * (Google Cloud Console → YouTube Data API v3 → free 10k units/day)
 */

import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { techniqueVariants, aiCallLogs } from '../lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { anthropic, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { EVENT_TYPES } from '../lib/taxonomy/events'
import { POSITIONS } from '../lib/taxonomy/positions'

const MAX_SEARCHES_PER_RUN = 40   // YouTube API budget: 100 units/search, 10k/day free
const MAX_VIDEOS_QUEUED = 120     // cap total ingest jobs triggered per run
const MIN_ACTIVE_VARIANTS = 2     // target coverage per event/position combo

// Trusted channel keywords — Claude uses this list to evaluate results
const TRUSTED_CHANNELS = [
  // Leg lock / no-gi specialists
  'danaher', 'john danaher', 'gordon ryan', 'craig jones', 'lachlan giles',
  'garry tonon', 'mikey musumeci', 'nicky ryan', 'andrew wiltse',
  // Gi / all-round
  'bernardo faria', 'marcelo garcia', 'keenan cornelius', 'ryan hall',
  'tom deblass', 'lucas leite', 'travis stevens', 'pedro sauer',
  // Content creators / instructors
  'chewjitsu', 'stephan kesting', 'bjj fanatics', 'firas zahabi',
  'priit mihkelson', 'geo martinez', 'knight jiu jitsu',
  'invisible jiu jitsu', 'grapplearts', 'the grappling academy',
  // Advanced system specialists
  'eddie bravo', 'rubber guard', 'oliver taza', 'kyle boehm',
]

// Additional analyst / narrated-match channels to surface match breakdowns
// (used when building a match-analysis KB in addition to pure instructionals)
const ANALYSIS_CHANNELS = [
  'bjj scout', 'bjjscout', 'flograppling', 'flo grappling',
  'bjj analysis', 'match breakdown', 'grappling central', 'fight commentary',
  'bjj breakdown', 'match review', 'jits insight', 'bjj talk',
]

// ── YouTube Data API search ───────────────────────────────────────────────────

type YTVideo = {
  videoId: string
  url: string
  title: string
  channel: string
  description: string
  publishedAt: string
}

async function youtubeSearch(query: string, maxResults = 8): Promise<YTVideo[]> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_DATA_API_KEY not set')

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    videoDuration: 'medium',   // 4–20 min — filters out shorts and 2hr compilations
    maxResults: String(maxResults),
    relevanceLanguage: 'en',
    key: apiKey,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`YouTube API error ${res.status}: ${err}`)
  }

  const data = await res.json() as { items?: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string; description: string; publishedAt: string } }> }
  return (data.items ?? []).map(item => ({
    videoId: item.id.videoId,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
  }))
}

// ── Agent tools ───────────────────────────────────────────────────────────────

function buildTools(state: { searchCount: number; queuedCount: number; queuedUrls: Set<string>; existingUrls: Set<string> }) {
  return {

    get_coverage_gaps: tool({
      description: 'Query the technique library to find event/position combos with fewer than the minimum number of active variants. Returns a prioritised list of what needs to be filled.',
      inputSchema: z.object({
        format: z.enum(['gi', 'no_gi', 'both']).optional().describe('Filter by format. Omit to get all gaps.'),
      }),
      execute: async ({ format }: { format?: 'gi' | 'no_gi' | 'both' }) => {
        const rows = await db.query.techniqueVariants.findMany({
          where: eq(techniqueVariants.status, 'active'),
          columns: { eventId: true, positionId: true, format: true },
        })

        // Count active variants per event/position combo
        const counts: Record<string, number> = {}
        for (const row of rows) {
          const key = `${row.eventId}::${row.positionId ?? 'null'}`
          counts[key] = (counts[key] ?? 0) + 1
        }

        // Build gap list from the submission events that matter most
        const submissionEvents = EVENT_TYPES.filter(e => e.parent === 'submission')
        const keyPositions = [
          // ── Top positions ───────────────────────────────────────────────────
          'mount', 'side_control', 'back_control', 'north_south', 'knee_on_belly',
          // ── Guard family ────────────────────────────────────────────────────
          'closed_guard', 'half_guard', 'deep_half', 'butterfly_guard',
          'open_guard', 'rubber_guard',
          // ── Modern guard systems ────────────────────────────────────────────
          'de_la_riva', 'reverse_de_la_riva', 'x_guard', 'single_leg_x',
          'spider_guard', 'lasso_guard', 'worm_guard', 'k_guard',
          // ── Leg entanglement ────────────────────────────────────────────────
          'ashi_garami', 'inside_sankaku', 'fifty_fifty',
          // ── Turtle / back-taking / advanced ─────────────────────────────────
          'turtle', 'truck', 'crucifix',
          // ── Standing ────────────────────────────────────────────────────────
          'standing',
        ]

        const gaps: Array<{ eventId: string; eventName: string; positionId: string | null; positionName: string; currentCount: number }> = []

        for (const event of submissionEvents) {
          // General variant (no position)
          const generalKey = `${event.id}::null`
          if ((counts[generalKey] ?? 0) < MIN_ACTIVE_VARIANTS) {
            gaps.push({ eventId: event.id, eventName: event.name, positionId: null, positionName: 'general', currentCount: counts[generalKey] ?? 0 })
          }
          // Position-specific
          for (const posId of keyPositions) {
            const pos = POSITIONS.find(p => p.id === posId)
            if (!pos) continue
            const key = `${event.id}::${posId}`
            if ((counts[key] ?? 0) < MIN_ACTIVE_VARIANTS) {
              gaps.push({ eventId: event.id, eventName: event.name, positionId: posId, positionName: pos.name, currentCount: counts[key] ?? 0 })
            }
          }
        }

        return {
          total_gaps: gaps.length,
          budget_remaining: MAX_SEARCHES_PER_RUN - state.searchCount,
          videos_queued_so_far: state.queuedCount,
          gaps: gaps.slice(0, 50), // return top 50 to keep context manageable
        }
      },
    }),

    search_youtube: tool({
      description: 'Search YouTube for BJJ instructional videos matching a technique and optional position. Returns video metadata for you to evaluate.',
      inputSchema: z.object({
        query: z.string().describe('YouTube search query, e.g. "armbar from mount BJJ tutorial Lachlan Giles"'),
        technique_hint: z.string().describe('The technique being searched, e.g. "armbar from mount"'),
      }),
      execute: async ({ query }: { query: string; technique_hint: string }) => {
        if (state.searchCount >= MAX_SEARCHES_PER_RUN) {
          return { error: 'Daily search budget exhausted. Call finish() to end the run.' }
        }
        state.searchCount++

        const videos = await youtubeSearch(query)
        const trusted = TRUSTED_CHANNELS

        return {
          results: videos.map(v => {
            const text = `${v.title} ${v.description}`.toLowerCase()
            const is_trusted = trusted.some(t => v.channel.toLowerCase().includes(t))
            const is_analysis = ANALYSIS_CHANNELS.some(a => text.includes(a) || v.channel.toLowerCase().includes(a))
            return {
              url: v.url,
              title: v.title,
              channel: v.channel,
              description: v.description.slice(0, 200),
              is_trusted_channel: is_trusted,
              likely_narrated_analysis: is_analysis,
              already_queued: state.queuedUrls.has(v.url) || state.existingUrls.has(v.url),
            }
          }),
          searches_used: state.searchCount,
          searches_remaining: MAX_SEARCHES_PER_RUN - state.searchCount,
        }
      },
    }),

    queue_video: tool({
      description: 'Queue a YouTube video for ingestion into the technique library. Only call this for videos you are confident are quality BJJ instructionals (clear narration, expert coach, focused on the specific technique). The ingest pipeline will extract visual cues automatically.',
      inputSchema: z.object({
        url: z.string().describe('YouTube video URL'),
        technique_hint: z.string().describe('Short description, e.g. "armbar from mount"'),
        position_hint: z.string().optional().describe('Starting position ID, e.g. "mount"'),
        reason: z.string().describe('One sentence why you chose this video'),
        sourceCategory: z.enum(['instructional', 'analysis']).optional(),
        includeTranscript: z.boolean().optional(),
      }),
      execute: async ({ url, technique_hint, position_hint, reason, sourceCategory, includeTranscript }: { url: string; technique_hint: string; position_hint?: string; reason: string; sourceCategory?: 'instructional' | 'analysis'; includeTranscript?: boolean }) => {
        if (state.queuedUrls.has(url)) {
          return { skipped: true, reason: 'already queued this run' }
        }
        if (state.existingUrls.has(url)) {
          return { skipped: true, reason: 'already in the technique library from a previous run — pick a different video' }
        }
        if (state.queuedCount >= MAX_VIDEOS_QUEUED) {
          return { error: 'Video queue limit reached for this run.' }
        }

        state.queuedUrls.add(url)
        state.queuedCount++

        // Default to 'instructional' but allow the caller to tag 'analysis' videos.
        const category = sourceCategory ?? 'instructional'
        const transcript = includeTranscript ?? true

        await inngest.send({
          name: 'technique/ingest-requested',
          data: {
            youtubeUrl: url,
            techniqueHint: technique_hint,
            positionHint: position_hint,
            requestedByUserId: 'kb-agent',
            sourceCategory: category,
            includeTranscript: transcript,
          },
        })

        return { queued: true, total_queued: state.queuedCount, reason }
      },
    }),

    finish: tool({
      description: 'End the agent run and report what was accomplished.',
      inputSchema: z.object({
        summary: z.string().describe('Brief summary of what was done and what gaps remain'),
        gaps_filled: z.number().describe('How many event/position combos were addressed'),
        videos_queued: z.number(),
        searches_used: z.number(),
      }),
      execute: async ({ summary, gaps_filled, videos_queued, searches_used }: { summary: string; gaps_filled: number; videos_queued: number; searches_used: number }) => {
        return { done: true, summary, gaps_filled, videos_queued, searches_used }
      },
    }),

  }
}

// ── Inngest job ───────────────────────────────────────────────────────────────

export const techniqueKbAgent = inngest.createFunction(
  {
    id: 'technique-kb-agent',
    name: 'Technique KB Agent',
    triggers: [
      { event: 'technique/kb-agent.run' },               // manual trigger
      { cron: '0 3 * * *' },                             // daily at 3am UTC
    ],
    concurrency: { limit: 1 },                           // never run two at once
  },
  async ({ step }: { step: any }) => {
    const runStartedAt = new Date().toISOString()

    // Source URLs already ingested (any run, any status) — never re-queue these.
    const existingSourceUrls: string[] = await step.run('load-existing-sources', async () => {
      const rows = await db.select({ sourceUrl: techniqueVariants.sourceUrl }).from(techniqueVariants)
      return rows.map(r => r.sourceUrl).filter((u): u is string => !!u)
    })

    const result = await step.run('run-agent', async () => {
      const state = { searchCount: 0, queuedCount: 0, queuedUrls: new Set<string>(), existingUrls: new Set(existingSourceUrls) }
      const start = Date.now()

      const { text, usage, steps } = await generateText({
        model: anthropic(CLAUDE_SYNTHESIS_MODEL),
        stopWhen: stepCountIs(120), // enough for ~40 gaps × 2 searches + overhead
        system: `You are an autonomous BJJ technique library curator. Your job is to fill gaps in a technique knowledge base that powers match analysis and gameplans for competitive BJJ athletes.

The library stores technique variants — visual descriptions of how specific submissions look on camera, used to help AI detect them in competition footage.

## Your workflow
1. Call get_coverage_gaps to see what's missing
2. For each gap (prioritise submissions over positional events, high-frequency positions first):
   - Call search_youtube with a specific query
   - Review the results — prefer trusted coaches with clear narration, avoid highlight reels or compilations
   - Call queue_video for 1–2 good matches per gap
3. Continue until all gaps are addressed or the search budget runs out
4. Call finish with a summary

## Technique coverage — all belt levels
The library must cover white through black belt techniques. Priority order:
1. Core submissions (armbar, triangle, kimura, guillotine, heel hook, RNC)
2. Intermediate (darce, anaconda, north-south choke, toe hold, calf slicer, kneebar, omoplata)
3. Advanced no-gi (inside sankaku entries, outside heel hook, truck/twister, K-guard, wrist lock, bicep slicer, von flue)
4. Advanced gi (baseball bat choke, clock choke, paper cutter choke, ezekiel choke, worm guard attacks)
5. System-specific (rubber guard triangle/omoplata, crucifix submissions, deep half kimura)

## What makes a good instructional video
- Expert coach narrating the technique step by step
- Single focused technique (not "10 submissions from guard")
- Medium length (5–15 min) — enough detail without being a full course
- Clear camera angle showing the mechanics
- Trusted channels: Danaher, Gordon Ryan, Lachlan Giles, Craig Jones, Garry Tonon, Mikey Musumeci, Andrew Wiltse, Nicky Ryan, Bernardo Faria, Marcelo Garcia, Keenan Cornelius, Ryan Hall, Tom DeBlass, Lucas Leite, Chewjitsu, Stephan Kesting, Priit Mihkelson, BJJ Fanatics, etc.

## What to avoid
- YouTube Shorts or videos under 3 minutes
- Competition highlight reels
- "Top 10" compilation videos
- Unknown channels with few subscribers (indicated by is_trusted_channel: false and a vague description)
- Videos already marked as already_queued — this includes videos ingested in earlier runs, not just this one. If the top result for a gap is already_queued, try a more specific or different search query rather than queueing it again or skipping the gap entirely.

Be efficient — one good search per gap, queue 1–2 videos, move on. Don't over-search the same technique.`,

        prompt: 'Start by checking the coverage gaps, then systematically fill them. When the budget runs low or all gaps are addressed, call finish().',
        tools: buildTools(state),
      })

      await db.insert(aiCallLogs).values({
        userId: null,
        jobId: 'technique-kb-agent',
        model: CLAUDE_SYNTHESIS_MODEL,
        promptVersion: 'agent-v1',
        tokensIn: usage.inputTokens ?? 0,
        tokensOut: usage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
        latencyMs: Date.now() - start,
        status: 'success',
      })

      return {
        searchesUsed: state.searchCount,
        videosQueued: state.queuedCount,
        agentSteps: steps.length,
        summary: text,
      }
    })

    // Fire the rescan job if anything was queued — it will wait 3h for ingest
    // to complete, then upgrade all YouTube matches with the new variants.
    if (result.videosQueued > 0) {
      await step.run('fire-rescan-event', async () => {
        await inngest.send({
          name: 'technique/kb-upgraded',
          data: { startedAt: runStartedAt, videosQueued: result.videosQueued },
        })
      })
    }

    return result
  }
)
