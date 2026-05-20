import { serve } from 'inngest/next'
import { inngest } from '../../../../lib/inngest'
import { analyzeVideo } from '../../../../jobs/analyze-video'
import { generateGameplan } from '../../../../jobs/generate-gameplan'
import { scanUrl } from '../../../../jobs/scan-url'
import { smoothcompMonitorBracket } from '../../../../jobs/smoothcomp-monitor-bracket'
import { smoothcompProcessBracket } from '../../../../jobs/smoothcomp-process-bracket'
import { smoothcompDiscoverFootage } from '../../../../jobs/smoothcomp-discover-footage'
import { generateExecutionDebrief } from '../../../../jobs/generate-execution-debrief'
import { syncTournamentCatalog } from '../../../../jobs/sync-tournament-catalog'

export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeVideo, generateGameplan, scanUrl, smoothcompMonitorBracket, smoothcompProcessBracket, smoothcompDiscoverFootage, generateExecutionDebrief, syncTournamentCatalog],
})
