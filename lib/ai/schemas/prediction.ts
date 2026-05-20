import { z } from 'zod'

export const MatchupPredictionSchema = z.object({
  win_probability: z.number().min(0).max(100).describe(
    'Estimated probability (0–100) that the coached athlete wins this matchup, given available data.'
  ),
  confidence: z.enum(['low', 'medium', 'high']).describe(
    'How confident the model is. Low = limited data (< 3 scouted matches or < 3 own matches). High = rich data on both sides.'
  ),
  verdict: z.enum(['favourable', 'neutral', 'tough']).describe(
    'Summary verdict. favourable = >60%, neutral = 40–60%, tough = <40%'
  ),
  key_advantages: z.array(z.string()).min(1).max(3).describe(
    'Specific matchup advantages for the coached athlete — based on observed data, not generic BJJ'
  ),
  key_risks: z.array(z.string()).min(1).max(3).describe(
    'Specific risks in this matchup — based on observed data'
  ),
  rationale: z.string().describe(
    '2–3 sentences explaining the prediction. Reference concrete patterns from the data.'
  ),
})

export type MatchupPrediction = z.infer<typeof MatchupPredictionSchema>
