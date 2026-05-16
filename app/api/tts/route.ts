import { NextRequest } from 'next/server'

export const maxDuration = 15

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (!text?.trim()) return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return new Response(JSON.stringify({ error: 'TTS not configured' }), { status: 500 })

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text.slice(0, 4096),
        voice: 'fable',
        response_format: 'mp3',
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err?.error?.message ?? 'TTS failed' }), { status: res.status })
    }

    const audioBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(audioBuffer).toString('base64')
    return new Response(JSON.stringify({ audioContent: base64 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
