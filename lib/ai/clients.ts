import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
})

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const GEMINI_VIDEO_MODEL = 'gemini-2.5-flash'
export const GEMINI_URL_SCAN_MODEL = 'gemini-2.0-flash'
export const CLAUDE_SYNTHESIS_MODEL = 'claude-sonnet-4-6'

export const TOKEN_COST_PER_M = {
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
} as const

export function estimateCostUsd(
  model: keyof typeof TOKEN_COST_PER_M,
  tokensIn: number,
  tokensOut: number
): number {
  const rates = TOKEN_COST_PER_M[model]
  return (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output
}
