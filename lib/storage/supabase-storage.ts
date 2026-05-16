import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BUCKET = 'videos'

export function generateVideoPath(filename: string): string {
  const ext = filename.split('.').pop() ?? 'mp4'
  return `uploads/${Date.now()}.${ext}`
}

export async function getSignedUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(error?.message ?? 'Failed to create signed upload URL')
  return { signedUrl: data.signedUrl, token: data.token }
}

export function getPublicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
