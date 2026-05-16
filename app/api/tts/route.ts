import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

const VOICES: Record<string, { languageCode: string; name: string }> = {
  en: { languageCode: 'en-US', name: 'en-US-Journey-D' },
  fi: { languageCode: 'fi-FI', name: 'fi-FI-Wavenet-A' },
  fr: { languageCode: 'fr-FR', name: 'fr-FR-Journey-D' },
  pt: { languageCode: 'pt-BR', name: 'pt-BR-Journey-D' },
  es: { languageCode: 'es-ES', name: 'es-ES-Journey-D' },
  ja: { languageCode: 'ja-JP', name: 'ja-JP-Journey-D' },
}

export async function POST(req: NextRequest) {
  try {
    const { text, lang = 'en' } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const apiKey = process.env.GOOGLE_TTS_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'TTS not configured' }, { status: 500 })

    const voice = VOICES[lang] ?? VOICES.en

    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: text.slice(0, 2000) },
          voice,
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.error?.message ?? 'TTS request failed' },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ audioContent: data.audioContent })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
