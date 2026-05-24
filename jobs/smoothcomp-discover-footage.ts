import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { videos, tournamentOpponents, tournaments, athleteCompetitionHistory } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { scrapeAthleteProfile } from '../lib/smoothcomp/scraper'

function rulesetToFormat(ruleset: string): 'gi' | 'no_gi' {
  if (ruleset === 'nogi' || ruleset === 'adcc' || ruleset === 'no_gi') return 'no_gi'
  return 'gi'
}

export const smoothcompDiscoverFootage = inngest.createFunction(
  {
    id: 'smoothcomp-discover-footage',
    name: 'Smoothcomp: Discover Past Footage',
    triggers: [{ event: 'smoothcomp/discover.footage' }],
    retries: 2,
  },
  async ({ event, step }: {
    event: {
      data: {
        tournamentId: string
        opponentId: string
        profileUrl: string
        athleteId: string
        athleteName: string
        userId: string
      }
    }
    step: any
  }) => {
    const { tournamentId, opponentId, profileUrl, athleteId, athleteName, userId } = event.data

    const profile = await step.run('scrape-profile', async () => {
      return scrapeAthleteProfile(profileUrl)
    })

    // Cloudflare or scrape failure — mark no_footage, show YouTube search suggestion in UI
    if (!profile || !profile.isPublic) {
      await step.run('mark-no-footage', async () => {
        await db
          .update(tournamentOpponents)
          .set({
            smoothcompProfilePublic: 'no',
            footageStatus: 'no_footage',
          })
          .where(eq(tournamentOpponents.id, opponentId))
      })
      return
    }

    // Persist ALL past competitions as intel — regardless of whether footage exists.
    // This is the athlete's competition history and is valuable even with no video.
    await step.run('store-competition-history', async () => {
      for (const comp of profile.pastCompetitions) {
        await db
          .insert(athleteCompetitionHistory)
          .values({
            smoothcompAthleteId: athleteId,
            tournamentOpponentId: opponentId,
            federation: 'smoothcomp',
            eventName: comp.eventName,
            eventId: comp.eventId,
            eventUrl: comp.eventUrl,
            eventDate: comp.date ?? null,
            placement: comp.placement ?? null,
          })
          .onConflictDoNothing()
      }
    })

    const competitionsWithFootage = profile.pastCompetitions.filter((c: { youtubeUrl: string | null }) => c.youtubeUrl)

    if (competitionsWithFootage.length === 0) {
      await step.run('mark-no-footage-public', async () => {
        await db
          .update(tournamentOpponents)
          .set({
            smoothcompProfilePublic: 'yes',
            footageStatus: 'no_footage',
          })
          .where(eq(tournamentOpponents.id, opponentId))
      })
      return
    }

    // Get tournament details for format inference
    const tournament = await step.run('fetch-tournament', async () => {
      return db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId) })
    })
    const format = rulesetToFormat(tournament?.ruleset ?? 'ibjjf')

    // Create video records for each past competition stream found
    const videoIds = await step.run('create-video-records', async () => {
      const ids: string[] = []
      for (const comp of competitionsWithFootage) {
        const [v] = await db
          .insert(videos)
          .values({
            userId,
            r2Key: `smoothcomp-auto/${athleteId}/${comp.eventId}`,
            originalFilename: comp.eventName || `${athleteName} — past footage`,
            contentType: 'video/mp4',
            sizeBytes: 0,
            sourceType: 'opponent',
            publicUrl: comp.youtubeUrl!,
            status: 'uploaded',
            tournamentOpponentId: opponentId,
          })
          .returning({ id: videos.id })
        ids.push(v.id)
      }

      await db
        .update(tournamentOpponents)
        .set({
          smoothcompProfilePublic: 'yes',
          footageStatus: 'auto_queued',
        })
        .where(eq(tournamentOpponents.id, opponentId))

      return ids
    })

    // Fire scan jobs for all discovered videos
    await step.sendEvent(
      'send-scan-events',
      videoIds.map((videoId: string, i: number) => ({
        name: 'url/submitted' as const,
        data: {
          videoId,
          userId,
          athleteName,
          format,
          sourceType: 'opponent',
          eventName: competitionsWithFootage[i]?.eventName ?? undefined,
          tournamentOpponentId: opponentId,
        },
      }))
    )
  }
)
