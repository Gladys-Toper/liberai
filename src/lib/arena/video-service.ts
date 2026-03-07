// Cinematic Video Pipeline — Video Service Abstraction Layer
//
// IVideoService abstracts the video generation backend so we can swap
// LTX for Veo, RunPod, etc. without touching orchestration code.
//
// LTX 2.3 generates video + lip-synced speech + ambient audio natively.
// Dialogue in quotation marks → synthesized speech with accent/emotion.

import { createClient } from '@supabase/supabase-js'

// ─── Public Types ────────────────────────────────────────────────

export interface GenerateFirstParams {
  prompt: string
  duration: number          // seconds (max 20 for LTX)
  resolution?: string       // e.g. '1080p', '720p'
  fps?: number
  cameraMotion?: string     // LTX camera_motion value
  model?: string            // e.g. 'ltx-2-3-pro'
}

export interface ExtendVideoParams {
  videoUri: string           // URI from uploadVideo()
  prompt: string
  duration: number           // additional seconds to add
  resolution?: string
  model?: string
}

export interface IVideoService {
  /** Generate the first video chunk from a text prompt */
  generateFirst(params: GenerateFirstParams): Promise<Buffer>

  /** Upload a video buffer to get a URI for extend operations */
  uploadVideo(mp4Buffer: Buffer): Promise<string>

  /** Extend an existing video with a new scene (seamless continuation) */
  extendVideo(params: ExtendVideoParams): Promise<Buffer>
}

// ─── Factory ─────────────────────────────────────────────────────

export function createVideoService(): IVideoService {
  const provider = process.env.VIDEO_PROVIDER || 'ltx'
  switch (provider) {
    case 'ltx':
      return new LtxVideoService()
    // Future adapters:
    // case 'veo':    return new VeoVideoService()
    // case 'runpod': return new RunPodVideoService()
    default:
      return new LtxVideoService()
  }
}

// ─── LTX Adapter ─────────────────────────────────────────────────

const LTX_BASE = 'https://api.ltx.video/v1'

class LtxVideoService implements IVideoService {
  private apiKey: string

  constructor() {
    const key = process.env.LTX_API_KEY
    if (!key) {
      throw new Error('LTX_API_KEY is not set')
    }
    this.apiKey = key
  }

  async generateFirst(params: GenerateFirstParams): Promise<Buffer> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      duration: params.duration,
      resolution: params.resolution || '1080p',
      fps: params.fps || 24,
      generate_audio: true,
      model: params.model || 'ltx-2-3-pro',
    }
    if (params.cameraMotion) {
      body.camera_motion = params.cameraMotion
    }

    const res = await this.fetchWithRetry(`${LTX_BASE}/text-to-video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LTX text-to-video failed (${res.status}): ${errText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async uploadVideo(mp4Buffer: Buffer): Promise<string> {
    const blob = new Blob([new Uint8Array(mp4Buffer)], { type: 'video/mp4' })
    const formData = new FormData()
    formData.append('file', blob, 'video.mp4')

    const res = await this.fetchWithRetry(`${LTX_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LTX upload failed (${res.status}): ${errText}`)
    }

    const data = await res.json()
    // Upload returns a video_uri that can be used for extend/retake
    return data.video_uri || data.uri || data.url
  }

  async extendVideo(params: ExtendVideoParams): Promise<Buffer> {
    const body: Record<string, unknown> = {
      video_uri: params.videoUri,
      prompt: params.prompt,
      duration: params.duration,
      resolution: params.resolution || '1080p',
      generate_audio: true,
      model: params.model || 'ltx-2-3-pro', // extend requires pro
    }

    const res = await this.fetchWithRetry(`${LTX_BASE}/extend`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LTX extend failed (${res.status}): ${errText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  /**
   * Fetch with exponential backoff on 429 (rate limit).
   * Reads Retry-After header when available.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    maxRetries = 3,
  ): Promise<Response> {
    let lastErr: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, init)

      if (res.status !== 429) return res

      // Rate limited — wait and retry
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * 2 ** attempt, 30_000) // exponential: 1s, 2s, 4s...

      console.warn(
        `[LTX] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`,
      )
      lastErr = new Error(`Rate limited after ${maxRetries} retries`)
      await new Promise((r) => setTimeout(r, waitMs))
    }

    throw lastErr ?? new Error('LTX request failed after retries')
  }
}

// ─── Supabase Storage Helper ─────────────────────────────────────

const VIDEO_BUCKET = 'debate-video'

/**
 * Upload an MP4 buffer to Supabase Storage and return its public URL.
 * Uses the service role client for server-side uploads.
 */
export async function uploadVideoToStorage(
  mp4Buffer: Buffer,
  sessionId: string,
): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const fileName = `${sessionId}/${Date.now()}.mp4`

  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(fileName, mp4Buffer, {
      contentType: 'video/mp4',
      upsert: true,
    })

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(VIDEO_BUCKET)
    .getPublicUrl(fileName)

  return urlData.publicUrl
}
