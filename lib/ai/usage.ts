import { db } from '../db'
import { aiCallLogs } from '../db/schema'
import { estimateCostUsd } from './clients'

/**
 * Record one AI call in ai_call_logs.
 *
 * Every model call should land here. The rows drive /admin/usage and the KB agent's
 * monthly spend ceiling, so an unlogged call is spend nobody can see and the ceiling
 * cannot account for.
 *
 * Deliberately never throws: this is measurement, and it must not be able to fail the
 * work it measures. A failed insert is logged to the console and swallowed.
 *
 * Usage shape matches the AI SDK's `LanguageModelUsage`. For multi-step calls pass
 * `totalUsage`, not `usage` — `usage` covers only the final step.
 */
export async function logAiCall(entry: {
  userId?: string | null
  jobId?: string | null
  model: string
  promptVersion: string
  usage?: { inputTokens?: number | null; outputTokens?: number | null } | null
  latencyMs?: number
  status?: 'success' | 'error'
}): Promise<void> {
  try {
    const tokensIn = entry.usage?.inputTokens ?? 0
    const tokensOut = entry.usage?.outputTokens ?? 0

    await db.insert(aiCallLogs).values({
      userId: entry.userId ?? null,
      jobId: entry.jobId ?? null,
      model: entry.model,
      promptVersion: entry.promptVersion,
      tokensIn,
      tokensOut,
      costUsdEstimate: estimateCostUsd(entry.model, tokensIn, tokensOut),
      latencyMs: entry.latencyMs ?? 0,
      status: entry.status ?? 'success',
    })
  } catch (err) {
    console.error('[logAiCall] failed to record AI call', {
      model: entry.model,
      promptVersion: entry.promptVersion,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
