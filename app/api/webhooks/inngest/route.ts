import { serve } from 'inngest/next'
import { inngest } from '../../../../lib/inngest'
import { analyzeVideo } from '../../../../jobs/analyze-video'
import { generateGameplan } from '../../../../jobs/generate-gameplan'
import { scanUrl } from '../../../../jobs/scan-url'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeVideo, generateGameplan, scanUrl],
})
