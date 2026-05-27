export function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0]
    }
    const id = u.searchParams.get('v')
    return id || null
  } catch {
    return null
  }
}

// Try to fetch auto-generated or uploaded captions via YouTube's timedtext endpoint.
// Returns plain text concatenated (best-effort). If unavailable, returns null.
export async function fetchYouTubeTranscript(videoUrl: string, lang = 'en'): Promise<string | null> {
  const id = parseYouTubeId(videoUrl)
  if (!id) return null
  try {
    const res = await fetch(`https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const text = await res.text()
    // timedtext is XML; strip tags to plain text
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
  } catch {
    return null
  }
}
