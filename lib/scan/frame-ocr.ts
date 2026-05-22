import { spawnSync } from 'child_process'
import { mkdtempSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { FoundMatch } from '../ai/schemas/url-scan'

// Strip diacritics and normalize to uppercase ASCII for fuzzy matching
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

// True if OCR text contains at least one meaningful word from the athlete name (≥4 chars)
function nameInText(text: string, athleteName: string): boolean {
  const haystack = norm(text)
  return norm(athleteName).split(/\s+/).some(p => p.length >= 4 && haystack.includes(p))
}

// Extract opponent name from a scoreboard frame — the all-caps name that is NOT the tracked athlete
function extractOpponent(text: string, athleteName: string): string {
  const athleteParts = norm(athleteName).split(/\s+/).filter(p => p.length >= 3)
  const candidates = text.split('\n')
    .map(l => l.trim())
    .filter(l => /^[A-Z][A-Z\s'\-]+$/.test(l) && l.split(/\s+/).length >= 2 && l.length > 5)
    .filter(l => !athleteParts.some(p => norm(l).includes(p)))
  return candidates[0]?.trim() || 'UNKNOWN'
}

interface Hit {
  t: number   // seconds from video start
  text: string
}

function clusterMatches(hits: Hit[], athleteName: string): FoundMatch[] {
  if (hits.length === 0) return []

  const GAP = 180  // ≥3-min gap between hits = separate match
  const results: FoundMatch[] = []

  let start = hits[0].t
  let end = hits[0].t
  let opponent = extractOpponent(hits[0].text, athleteName)
  let outcomeT: number | undefined

  const flush = () => {
    results.push({
      start_seconds: Math.max(0, start - 30),
      end_seconds: end + 90,
      outcome_screen_seconds: outcomeT ?? end + 60,
      opponent_name: opponent,
    })
  }

  for (let i = 1; i < hits.length; i++) {
    const h = hits[i]
    if (h.t - end > GAP) {
      flush()
      start = h.t; end = h.t
      opponent = extractOpponent(h.text, athleteName)
      outcomeT = undefined
    } else {
      end = h.t
      const opp = extractOpponent(h.text, athleteName)
      if (opp !== 'UNKNOWN') opponent = opp
      // Mark outcome screen when timer is near 0:00 or result text appears
      if (/\b0\s*:\s*0[0-5]\b/.test(h.text) || /\b(WINNER?|SUBMISSION|WIN\s*BY)\b/.test(norm(h.text))) {
        outcomeT = h.t
      }
    }
  }
  flush()
  return results
}

/**
 * Scan a YouTube video for matches involving athleteName using FFmpeg + Tesseract OCR.
 * Returns FoundMatch[] compatible with the existing extraction pipeline.
 *
 * Requires system packages: yt-dlp, ffmpeg, tesseract (added via nixpacks.toml)
 */
export async function ocrScanYouTube(youtubeUrl: string, athleteName: string): Promise<FoundMatch[]> {
  // Step 1: get lowest-quality direct stream URL (smaller download = faster scan)
  const ytResult = spawnSync(
    'yt-dlp',
    ['-f', 'worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst', '--get-url', youtubeUrl],
    { encoding: 'utf8', timeout: 45_000 }
  )
  if ((ytResult.status !== 0 && ytResult.status !== null) || !ytResult.stdout?.trim()) {
    throw new Error(`yt-dlp failed (exit ${ytResult.status}): ${(ytResult.stderr || '').slice(0, 300)}`)
  }
  const directUrl = ytResult.stdout.trim().split('\n')[0]

  // Step 2: extract 1 frame per 30s as JPEG into a temp dir
  const tmpDir = mkdtempSync(join(tmpdir(), 'rp-ocr-'))
  try {
    spawnSync(
      'ffmpeg',
      [
        '-loglevel', 'error',
        '-i', directUrl,
        '-vf', 'fps=1/30,scale=1280:-2',  // 1280px wide is plenty for scoreboard text
        '-q:v', '3',
        join(tmpDir, 'f%06d.jpg'),
      ],
      { timeout: 420_000 }  // 7 min cap
    )
    // ffmpeg exits non-zero at natural stream end — that's fine, we have whatever frames landed

    // Step 3: OCR each frame, record timestamps where athlete name appears
    const frames = readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort()
    const hits: Hit[] = []

    for (const [i, frame] of frames.entries()) {
      const t = i * 30
      const ocr = spawnSync(
        'tesseract',
        [join(tmpDir, frame), 'stdout', '--psm', '11', '-l', 'eng'],
        { encoding: 'utf8', timeout: 15_000 }
      )
      const text = ocr.stdout || ''
      if (nameInText(text, athleteName)) {
        hits.push({ t, text })
      }
    }

    return clusterMatches(hits, athleteName)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
