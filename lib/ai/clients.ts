import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
})

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const GEMINI_VIDEO_MODEL = 'gemini-3.5-flash'
export const GEMINI_URL_SCAN_MODEL = 'gemini-3.5-flash'
export const CLAUDE_SYNTHESIS_MODEL = 'claude-sonnet-4-6'

// Model used for the per-frame vision pass in harvest-roboflow-frames.
export const CLAUDE_VISION_MODEL = 'claude-haiku-4-5-20251001'

export const TOKEN_COST_PER_M = {
  'gemini-3.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
} as const

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const rates = TOKEN_COST_PER_M[model as keyof typeof TOKEN_COST_PER_M]
  // An unpriced model must not throw — this runs inside cost logging, which should
  // never be able to fail the work it is measuring. Warn so the gap is visible, and
  // count it as 0 rather than crashing the caller.
  if (!rates) {
    console.warn(`[estimateCostUsd] no pricing for model "${model}" — counted as $0`)
    return 0
  }
  return (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output
}
