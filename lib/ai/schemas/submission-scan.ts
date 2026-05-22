import { z } from 'zod'
import { EVENT_TYPE_IDS } from '../../taxonomy/events'

export const SubmissionScanOutputSchema = z.object({
  events: z.array(z.object({
    timestamp_seconds: z.number().describe('Exact second within the video where the attempt begins'),
    event_type_id: z.enum(EVENT_TYPE_IDS).describe('Type of event — use taxonomy IDs only'),
    actor: z.enum(['user', 'opponent']).describe('Who initiated the attempt'),
    outcome: z.enum(['successful', 'escaped', 'ongoing']).default('ongoing'),
    technique_label: z.string().nullable().describe('Optional technique detail, e.g. "armbar from mount"'),
    confidence: z.number().min(0).max(1).describe('How confident you are this event occurred'),
  })),
  notes: z.string().optional().describe('Brief description of what was observed in the scanned windows'),
})
