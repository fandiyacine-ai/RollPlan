import { z } from 'zod'

export const TrainingDrillSchema = z.object({
  title: z.string().describe("Short drill title, e.g. 'Guard passing under pressure'"),
  evidence: z.string().describe("1-2 sentences explaining why this is a priority based on match data and upcoming opponents"),
  drill_description: z.string().describe("Specific, actionable drill to practice today"),
  youtube_search: z.string().describe("3-6 word YouTube search query for a tutorial video"),
  focus_area: z.enum(['defence', 'offence', 'transitions']).describe("Primary training category"),
})

export const TrainingPlanSchema = z.object({
  drills: z.array(TrainingDrillSchema).min(1).max(3).describe("Top 3 drill recommendations ordered by priority"),
  summary: z.string().describe("One sentence explaining the overall training emphasis and the key reason behind it"),
})

export type TrainingDrill = z.infer<typeof TrainingDrillSchema>
export type TrainingPlan = z.infer<typeof TrainingPlanSchema>
