import { google } from './clients'

const EMBEDDING_MODEL = 'gemini-embedding-001'

/**
 * NOT recorded in ai_call_logs — the one remaining gap in AI spend tracking.
 *
 * Two reasons it is left out rather than logged with a guessed rate: the call sites
 * (technique ingest, KB retrieval) embed short single strings, so the spend is orders
 * of magnitude below the video and synthesis calls; and gemini-embedding-001 has no
 * verified entry in TOKEN_COST_PER_M. Logging it with an invented price would make the
 * KB agent's spend ceiling read as precise while being wrong.
 *
 * To close this: confirm the current per-token rate, add it to TOKEN_COST_PER_M, and
 * wrap the doEmbed call below with logAiCall (doEmbed returns usage.tokens).
 */
export async function embedText(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const { embeddings } = await google.embedding(EMBEDDING_MODEL).doEmbed({
    values: [text],
    providerOptions: { taskType } as any,
  })
  return embeddings[0] ?? []
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const len = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
