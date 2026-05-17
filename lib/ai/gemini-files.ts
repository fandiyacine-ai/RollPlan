import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { createWriteStream, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { join } from 'path'
import { tmpdir } from 'os'

const fileManager = new GoogleAIFileManager(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

export async function uploadVideoToGemini(publicUrl: string, mimeType: string): Promise<string> {
  const tmpPath = join(tmpdir(), `rollplan-${Date.now()}.video`)

  // Stream from R2/URL to disk — no large buffer in memory
  const response = await fetch(publicUrl)
  if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`)
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(tmpPath))

  try {
    const upload = await fileManager.uploadFile(tmpPath, {
      mimeType,
      displayName: 'match-video',
    })

    // Poll until Gemini finishes processing the file
    let file = await fileManager.getFile(upload.file.name)
    let attempts = 0
    while (file.state === FileState.PROCESSING && attempts < 30) {
      await new Promise((r) => setTimeout(r, 4000))
      file = await fileManager.getFile(upload.file.name)
      attempts++
    }

    if (file.state !== FileState.ACTIVE) {
      throw new Error(`Gemini file processing failed: ${file.state}`)
    }

    return file.uri
  } finally {
    try { unlinkSync(tmpPath) } catch { /* best-effort cleanup */ }
  }
}

export async function deleteGeminiFile(fileUri: string): Promise<void> {
  try {
    const name = fileUri.split('/').slice(-2).join('/')
    await fileManager.deleteFile(name)
  } catch { /* best-effort */ }
}
