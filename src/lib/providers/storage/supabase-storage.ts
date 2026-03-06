import { createClient } from '@supabase/supabase-js'
import type { IStorageProvider } from './interface'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export class SupabaseStorageProvider implements IStorageProvider {
  async upload(
    bucket: string,
    path: string,
    data: Buffer | Blob | ArrayBuffer,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ url: string }> {
    const supabase = getClient()
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, data, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
      })

    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path)
    return { url: publicData.publicUrl }
  }

  async getSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string> {
    const supabase = getClient()
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)

    if (error) throw new Error(`Signed URL failed: ${error.message}`)
    return data.signedUrl
  }

  getPublicUrl(bucket: string, path: string): string {
    const supabase = getClient()
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async delete(bucket: string, path: string): Promise<void> {
    const supabase = getClient()
    const { error } = await supabase.storage.from(bucket).remove([path])
    if (error) throw new Error(`Storage delete failed: ${error.message}`)
  }

  async getFileSize(bucket: string, path: string): Promise<number> {
    const supabase = getClient()
    // List the specific file to get metadata
    const dir = path.substring(0, path.lastIndexOf('/'))
    const fileName = path.substring(path.lastIndexOf('/') + 1)

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(dir, { search: fileName, limit: 1 })

    if (error || !data?.[0]) return 0
    return (data[0] as any).metadata?.size || 0
  }
}
