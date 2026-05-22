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

// Gemini rejects YouTube URLs that contain &t= timestamps — strip it before use.
// We pass the offset ourselves via startOffset/endOffset in videoMetadata.
function cleanYouTubeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('t')
    return u.toString()
  } catch { return url }
}

// Canonical form for dedup: youtu.be/ID and youtube.com/watch?v=ID → same key.
// Strips all params except 'v'. Used before storing and before dedup lookups.
export function normalizeYouTubeUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('?')[0]
      return `https://www.youtube.com/watch?v=${id}`
    }
    if (u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com') {
      const id = u.searchParams.get('v')
      if (id) return `https://www.youtube.com/watch?v=${id}`
    }
    return url
  } catch { return url }
}

export async function geminiVideoObject<T extends z.ZodTypeAny>(
  model: string,
  params: {
    system: string
    videoUrl: string
    videoOptions?: VideoOptions
    userPrompt: string
    schema: T
    referenceImageBase64?: string
    // Budget in tokens for internal chain-of-thought reasoning before JSON output.
    // 0 = disabled (default). Gemini 2.5 Flash max is 24576. Higher values improve
    // reasoning on complex multi-match streams; set 0 for simple/fast tasks.
    thinkingBudget?: number
  }
): Promise<{ object: z.infer<T>; usage: { inputTokens: number; outputTokens: number } }> {
  const { system, videoUrl, videoOptions, userPrompt, schema, referenceImageBase64, thinkingBudget = 0 } = params

  const filePart: Record<string, unknown> = {
    fileData: { mimeType: 'video/mp4', fileUri: cleanYouTubeUrl(videoUrl) },
  }

  if (videoOptions) {
    const vm: Record<string, unknown> = {}
    if (videoOptions.fps !== undefined) vm.fps = videoOptions.fps
    if (videoOptions.startSeconds !== undefined) vm.startOffset = `${Math.floor(videoOptions.startSeconds)}s`
    if (videoOptions.endSeconds !== undefined) vm.endOffset = `${Math.floor(videoOptions.endSeconds)}s`
    if (Object.keys(vm).length > 0) filePart.videoMetadata = vm
  }

  const userParts: unknown[] = []
  if (referenceImageBase64) {
    userParts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceImageBase64 } })
    userParts.push({ text: '↑ IDENTITY REFERENCE FRAME. The red "⬅ YOU" box marks the ONLY athlete to label as "user" for the ENTIRE match. The other athlete is ALWAYS "opponent". Use this annotated frame as your identity anchor — do not swap these roles at any point.' })
  }
  userParts.push(filePart)
  userParts.push({ text: userPrompt })

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: buildGeminiSchema(schema),
      // Gemini 2.5 Flash supports internal chain-of-thought before outputting JSON.
      // A non-zero budget gives the model time to reason about complex multi-match
      // streams before committing to boundaries and outcome assignments.
      ...(thinkingBudget > 0 ? { thinkingConfig: { thinkingBudget } } : {}),
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
