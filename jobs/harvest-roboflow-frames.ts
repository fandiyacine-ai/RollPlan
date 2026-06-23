/**
 * Harvest training frames from a technique KB record and upload to Roboflow.
 *
 * Triggered two ways:
 *   1. Event 'technique/roboflow-harvest-requested' — fired by ingest-technique
 *      immediately after a new active record is created (includes key_moment_seconds
 *      so we only download the relevant 60s window, not the whole video).
 *   2. Weekly cron — backfills any active records that were never synced.
 *
 * Pipeline per video:
 *   Download 60s around key_moment → extract at 1fps → bjj3/1 position gate
 *   → Claude Haiku multi-class vision → upload to Roboflow with correct label
 *   → mark technique_variant.roboflow_synced_at
 */

import { spawn, execFileSync } from 'child_process'
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { isNull, eq, and } from 'drizzle-orm'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import ffmpegStaticPath from 'ffmpeg-static'

const ffmpegBin: string = (ffmpegStaticPath && existsSync(ffmpegStaticPath)) ? ffmpegStaticPath : 'ffmpeg'
function resolveBin(name: string): string {
  try { return execFileSync('which', [name], { encoding: 'utf8', timeout: 3000 }).trim() } catch { return name }
}
const ytdlpBin = resolveBin('yt-dlp')

import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { techniqueVariants } from '../lib/db/schema'
import { ROBOFLOW_CLASS_MAP } from '../lib/ai/roboflow-class-map'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROBOFLOW_KEY   = process.env.ROBOFLOW_API_KEY ?? '9qRhtkZOTlh4C38sjI2W'
const ROBOFLOW_WS    = 'hello-rollplan-ai'
const ROBOFLOW_PROJ  = 'bjj-submissions'

// Window around key_moment to download (seconds each side)
const WINDOW_BEFORE  = 30
const WINDOW_AFTER   = 30

// bjj3/1 Roboflow inference REST endpoint
const POSITION_ENDPOINT = `https://detect.roboflow.com/bjj3/1?api_key=${ROBOFLOW_KEY}&confidence=30`

const GROUND_POSITIONS = new Set([
  'back1', 'back2', 'mount1', 'mount2',
  'closed_guard1', 'closed_guard2', 'open_guard1', 'open_guard2',
  'half_guard1', 'half_guard2', 'side_control1', 'side_control2',
  'turtle1', 'turtle2', '5050_guard',
])

// All valid Roboflow class labels — submissions, guard types, sweeps, transitions
const ALL_CLASSES = [
  // Submissions
  'americana', 'anaconda_choke', 'ankle_lock', 'armbar',
  'baseball_bat_choke', 'calf_slicer', 'clock_choke',
  'crucifix_choke', 'darce_choke', 'ezekiel_choke', 'gogoplata',
  'guillotine', 'heel_hook', 'kesa_gatame', 'kimura', 'kneebar',
  'north_south_choke', 'omoplata', 'paper_cutter_choke',
  'rear_naked_choke', 'toehold', 'triangle',
  'twister', 'von_flue_choke', 'wrist_lock',
  // Guard types
  'butterfly_guard', 'de_la_riva_guard', 'fifty_fifty_guard',
  'rubber_guard', 'single_leg_x_guard', 'worm_guard', 'x_guard',
  // Sweeps
  'butterfly_sweep', 'guard_sweep', 'single_leg_x_sweep', 'x_guard_sweep',
  // Transitions
  'back_take', 'guard_pass',
]

const CLASS_MAP = ROBOFLOW_CLASS_MAP

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Download a time section of a YouTube video to a local file. */
async function downloadSection(
  url: string, startSec: number, endSec: number, outPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ytdlpBin, [
      '--no-playlist',
      '-f', 'bestvideo[height<=480]/bestvideo/best',
      '--download-sections', `*${startSec}-${endSec}`,
      '-o', outPath,
      '--quiet',
      url,
    ])
    const timer = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp timeout')) }, 120_000)
    proc.on('close', code => {
      clearTimeout(timer)
      code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code}`))
    })
    proc.on('error', err => { clearTimeout(timer); reject(err) })
  })
}

/** Extract frames at 1fps from a video file into a directory. */
async function extractFrames(videoPath: string, outDir: string): Promise<string[]> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBin, [
      '-y', '-loglevel', 'error',
      '-i', videoPath,
      '-vf', 'fps=1,scale=640:-2',
      '-q:v', '3',
      join(outDir, 'frame_%04d.jpg'),
    ])
    const timer = setTimeout(() => { proc.kill(); reject(new Error('ffmpeg timeout')) }, 60_000)
    proc.on('close', code => {
      clearTimeout(timer)
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
    })
    proc.on('error', err => { clearTimeout(timer); reject(err) })
  })
  return readdirSync(outDir)
    .filter(f => f.endsWith('.jpg'))
    .map(f => join(outDir, f))
    .sort()
}

/** Stage 1: bjj3/1 REST inference — returns true if a ground position is detected. */
async function passesPositionGate(framePath: string): Promise<boolean> {
  const imageData = readFileSync(framePath).toString('base64')
  const res = await fetch(POSITION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `image=${encodeURIComponent(imageData)}&image_type=base64`,
  })
  if (!res.ok) return false
  const data = await res.json() as { predictions?: Array<{ class: string, confidence: number }> }
  return (data.predictions ?? []).some(
    p => p.confidence >= 0.30 && GROUND_POSITIONS.has(p.class)
  )
}

/** Stage 2: Claude Haiku vision — returns the detected class name or null to discard. */
async function classifyFrame(
  framePath: string,
  expectedClass: string,
  visualCues: string,
): Promise<string | null> {
  const classList = ALL_CLASSES.map(c => `  - ${c}`).join('\n')
  const hint = expectedClass.replace(/_/g, ' ')
  const prompt = [
    'You are annotating BJJ training images for a computer vision classifier.',
    'Look at this image and identify which BJJ technique, guard position, sweep, or transition is clearly visible.',
    'Demonstrations, drills, and slow-motion reps all count.',
    '',
    `HINT: this frame comes from a video about '${hint}', but correct the label if a different technique or position is clearly shown.`,
    '',
    'Respond with EXACTLY ONE label from this list, or "none" if nothing is clearly visible',
    '(instructor standing/talking, empty mat, only hands shown, unclear):',
    '',
    classList,
    '  - none',
    '',
    visualCues ? `Visual reference for '${hint}': ${visualCues.slice(0, 250)}` : '',
    '',
    'Your answer (one label only, no explanation):',
  ].join('\n')

  try {
    const imageBytes = readFileSync(framePath)
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      maxOutputTokens: 20,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: imageBytes },
          { type: 'text', text: prompt },
        ],
      }],
    })
    const raw = text.trim().toLowerCase().replace(/ /g, '_')
    return ALL_CLASSES.includes(raw) ? raw : null
  } catch {
    return null
  }
}

/** Upload a single frame to Roboflow bjj-submissions via REST API. */
async function uploadToRoboflow(framePath: string, className: string): Promise<boolean> {
  const imageData = readFileSync(framePath).toString('base64')
  const url = `https://api.roboflow.com/dataset/${ROBOFLOW_PROJ}/upload`
    + `?api_key=${ROBOFLOW_KEY}&name=${encodeURIComponent(framePath.split('/').pop()!)}`
    + `&split=train&annotation=${encodeURIComponent(className)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `image=${encodeURIComponent(imageData)}&image_type=base64`,
  })
  return res.ok
}

// ── Core harvest logic ────────────────────────────────────────────────────────

async function harvestRecord(record: {
  id: string
  eventId: string
  sourceUrl: string
  visualCues: string
  keyMomentSeconds: number | null
}): Promise<{ uploaded: number, corrections: number }> {
  const expectedClass = CLASS_MAP[record.eventId]
  if (!expectedClass) {
    console.log(`[harvest] no class mapping for event_id=${record.eventId}, skipping`)
    return { uploaded: 0, corrections: 0 }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'rp-harvest-'))
  try {
    const videoPath = join(tmpDir, 'section.mp4')
    const framesDir = join(tmpDir, 'frames')
    require('fs').mkdirSync(framesDir)

    // Download section around key moment (or first 60s if unknown)
    const keyMoment = record.keyMomentSeconds ?? 30
    const sectionStart = Math.max(0, keyMoment - WINDOW_BEFORE)
    const sectionEnd   = keyMoment + WINDOW_AFTER
    console.log(`[harvest] downloading ${record.sourceUrl} [${sectionStart}s–${sectionEnd}s]`)
    await downloadSection(record.sourceUrl, sectionStart, sectionEnd, videoPath)

    // Extract frames at 1fps
    const frames = await extractFrames(videoPath, framesDir)
    console.log(`[harvest] extracted ${frames.length} frames`)

    let uploaded = 0, corrections = 0

    for (const framePath of frames) {
      // Stage 1: position gate
      const isGround = await passesPositionGate(framePath)
      if (!isGround) continue

      // Stage 2: Claude multi-class classification
      const detectedClass = await classifyFrame(framePath, expectedClass, record.visualCues)
      if (!detectedClass) continue

      if (detectedClass !== expectedClass) corrections++

      const ok = await uploadToRoboflow(framePath, detectedClass)
      if (ok) uploaded++
    }

    console.log(`[harvest] ${record.eventId} → uploaded=${uploaded} corrections=${corrections}`)
    return { uploaded, corrections }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ── Inngest jobs ──────────────────────────────────────────────────────────────

/** Triggered immediately when ingest-technique creates an active record. */
export const harvestRoboflowFrames = inngest.createFunction(
  {
    id: 'harvest-roboflow-frames',
    name: 'Harvest Roboflow Training Frames',
    triggers: [{ event: 'technique/roboflow-harvest-requested' }],
    retries: 2,
    concurrency: { limit: 3 },
  },
  async ({ event, step }: {
    event: {
      data: {
        variantId: string
        eventId: string
        sourceUrl: string
        visualCues: string
        keyMomentSeconds: number | null
      }
    }
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const { variantId, eventId, sourceUrl, visualCues, keyMomentSeconds } = event.data

    const result = await step.run('harvest-and-upload', () =>
      harvestRecord({ id: variantId, eventId, sourceUrl, visualCues, keyMomentSeconds })
    )

    await step.run('mark-synced', () =>
      db.update(techniqueVariants)
        .set({ roboflowSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(techniqueVariants.id, variantId))
    )

    return result
  }
)

/** Weekly backfill — picks up active records never synced to Roboflow. */
export const backfillRoboflowFrames = inngest.createFunction(
  {
    id: 'backfill-roboflow-frames',
    name: 'Backfill Roboflow Frames (weekly)',
    triggers: [{ cron: '0 3 * * 1' }], // Monday 03:00 UTC
    concurrency: { limit: 1 },
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const unsynced = await step.run('fetch-unsynced', () =>
      db.select({
        id: techniqueVariants.id,
        eventId: techniqueVariants.eventId,
        sourceUrl: techniqueVariants.sourceUrl,
        visualCues: techniqueVariants.visualCues,
      })
      .from(techniqueVariants)
      .where(and(
        eq(techniqueVariants.status, 'active'),
        isNull(techniqueVariants.roboflowSyncedAt),
      ))
      .limit(50) // process 50 per weekly run to stay within Inngest timeouts
    )

    console.log(`[backfill] ${unsynced.length} unsynced active records`)

    let totalUploaded = 0
    for (const record of unsynced) {
      if (!record.sourceUrl) continue
      try {
        const { uploaded } = await step.run(`harvest-${record.id}`, () =>
          harvestRecord({
            id: record.id,
            eventId: record.eventId,
            sourceUrl: record.sourceUrl!,
            visualCues: record.visualCues,
            keyMomentSeconds: null,
          })
        )
        totalUploaded += uploaded
        await step.run(`mark-synced-${record.id}`, () =>
          db.update(techniqueVariants)
            .set({ roboflowSyncedAt: new Date(), updatedAt: new Date() })
            .where(eq(techniqueVariants.id, record.id))
        )
      } catch (err) {
        console.error(`[backfill] failed for ${record.id}:`, err)
      }
    }

    return { processed: unsynced.length, totalUploaded }
  }
)
