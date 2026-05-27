import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

export async function uploadBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(r2, command, { expiresIn: 3600 })
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  })
  return getSignedUrl(r2, command, { expiresIn: 3600 })
}

export function generateVideoKey(userId: string, filename: string): string {
  const ext = filename.split('.').pop() ?? 'mp4'
  const timestamp = Date.now()
  return `videos/${userId}/${timestamp}.${ext}`
}

export function generateAnonymousVideoKey(filename: string): string {
  const ext = filename.split('.').pop() ?? 'mp4'
  return `uploads/${crypto.randomUUID()}.${ext}`
}

export function isStoredInR2(r2Key: string): boolean {
  return !r2Key.startsWith('url/')
}

export async function deleteR2Object(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }))
}

export async function deleteR2Objects(keys: string[]): Promise<void> {
  const realKeys = keys.filter(isStoredInR2)
  if (realKeys.length === 0) return
  // R2 / S3 batch delete supports up to 1000 keys at once
  for (let i = 0; i < realKeys.length; i += 1000) {
    const chunk = realKeys.slice(i, i + 1000)
    await r2.send(new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: true },
    }))
  }
}

export async function getPublicVideoUrl(key: string): Promise<string> {
  const base = process.env.R2_PUBLIC_URL
  if (base) return `${base.replace(/\/$/, '')}/${key}`
  const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
  return getSignedUrl(r2, command, { expiresIn: 604800 })
}
