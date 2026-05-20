import { z } from 'zod'

export const ExecutionDebriefSchema = z.object({
  verdict: z.enum(['executed_well', 'partially_executed', 'not_executed', 'insufficient_data']),
  summary: z.string().describe('2–3 sentence honest assessment of how well the plan was executed'),

  opening: z.object({
    planned: z.string().describe('The planned opening in a few words'),
    what_happened: z.string().describe('What actually happened in the opening phase'),
    execution: z.enum(['yes', 'partial', 'no']),
  }),

  primary_chain: z.object({
    planned: z.string().describe('The planned primary attack chain label'),
    what_happened: z.string().describe('What attack sequences were actually attempted'),
    execution: z.enum(['yes', 'partial', 'no']),
  }),

  what_worked: z.array(z.string()).min(1).max(4).describe('Things that went well — position, timing, execution'),
  what_to_improve: z.array(z.string()).min(1).max(4).describe('Concrete gaps between plan and execution'),
  key_learnings: z.array(z.string()).min(1).max(3).describe('Insights to carry into the next match'),
})

export type ExecutionDebrief = z.infer<typeof ExecutionDebriefSchema>
