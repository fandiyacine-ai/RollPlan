import { z } from 'zod'

export const EventReviewOutputSchema = z.object({
  suspicious_windows: z.array(z.object({
    start_seconds: z.number().describe('Start of the suspicious window in seconds'),
    end_seconds: z.number().describe('End of the suspicious window in seconds'),
    reason: z.string().describe('Why this window looks suspicious — e.g. "15 mount cycles with 0 submission attempts"'),
    likely_event_types: z.array(z.string()).describe('Event type IDs most likely missing, e.g. ["armbar", "triangle"]'),
    priority: z.enum(['high', 'medium']).describe('high = almost certain a real event was missed; medium = worth checking'),
  })).describe('Time windows where events were likely missed by the extraction model'),
})
