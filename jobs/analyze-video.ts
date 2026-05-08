import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { videos, matches } from '../lib/db/schema'
import { eq } from 'drizzle-orm'

export const analyzeVideo = inngest.createFunction(
  {
    id: 'analyze-video',
    name: 'Analyse Match Video',
    triggers: [{ event: 'video/uploaded' }],
  },
  async ({ event, step }: { event: { data: { videoId: string; matchId: string } }; step: any }) => {
    const { videoId, matchId } = event.data

    await step.run('validate-video', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video) throw new Error(`Video ${videoId} not found`)
      if (video.durationSeconds && video.durationSeconds > 900) {
        throw new Error('Video exceeds 15-minute limit. Please upload a single match clip.')
      }
    })

    // Thumbnail generation step (ffmpeg — implemented in week 2)
    await step.run('generate-thumbnail', async () => {
      // TODO: implement ffmpeg thumbnail at 50% mark
      return { thumbnailKey: null }
    })

    // Gemini extraction step (implemented in week 3)
    await step.run('extract-positions-events', async () => {
      // TODO: call Gemini 2.0 Flash with extract-match prompt
      // Write position_segments and events rows in a transaction
      return { segmentCount: 0, eventCount: 0 }
    })

    // Insight generation sub-step (implemented in week 4)
    await step.run('generate-insights', async () => {
      // TODO: call Claude Sonnet with generate-insights prompt
      return { insightCount: 0 }
    })

    await step.run('mark-analysed', async () => {
      await db.update(matches).set({ status: 'analysed' }).where(eq(matches.id, matchId))
      await db.update(videos).set({ status: 'analysed' }).where(eq(videos.id, videoId))
    })
  }
)
