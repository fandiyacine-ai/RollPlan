import { z } from 'zod'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export interface VideoOptions {
  fps?: number
  startSeconds?: number
  endSeconds?: number
}

export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url)
}

// Gemini's responseSchema is a strict subset of JSON Schema.
// Strip fields it rejects: additionalProperties, $schema, $defs, minItems, maxItems, minimum, maximum.
function sanitizeForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForGemini)
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  const BLOCKED = new Set(['additionalProperties', '$schema', '$defs', '$ref', 'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'const'])
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!BLOCKED.has(k)) out[k] = sanitizeForGemini(v)
  }
  return out
}

function buildGeminiSchema(schema: z.ZodTypeAny): unknown {
  return sanitizeForGemini(z.toJSONSchema(schema))
}

export async function geminiVideoObject<T extends z.ZodTypeAny>(
  model: string,
  params: {
    system: string
    videoUrl: string
    videoOptions?: VideoOptions
    userPrompt: string
    schema: T
  }
): Promise<{ object: z.infer<T>; usage: { inputTokens: number; outputTokens: number } }> {
  const { system, videoUrl, videoOptions, userPrompt, schema } = params

  const filePart: Record<string, unknown> = {
    fileData: { mimeType: 'video/mp4', fileUri: videoUrl },
  }

  if (videoOptions) {
    const vm: Record<string, unknown> = {}
    if (videoOptions.fps !== undefined) vm.fps = videoOptions.fps
    if (videoOptions.startSeconds !== undefined) vm.startOffset = `${videoOptions.startSeconds}s`
    if (videoOptions.endSeconds !== undefined) vm.endOffset = `${videoOptions.endSeconds}s`
    if (Object.keys(vm).length > 0) filePart.videoMetadata = vm
  }

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [filePart, { text: userPrompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: buildGeminiSchema(schema),
    },
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const rawText = await res.text()
    let msg = rawText
    try {
      const errData = JSON.parse(rawText)
      msg = errData?.error?.message ?? rawText
    } catch { /* use raw text */ }
    throw new Error(msg)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(`Empty Gemini response: ${JSON.stringify(data).slice(0, 300)}`)

  const object = schema.parse(JSON.parse(text)) as z.infer<T>

  return {
    object,
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}
