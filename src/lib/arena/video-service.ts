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
    return this.generateWithFallback(params.prompt, {
      duration: params.duration,
      resolution: params.resolution,
      fps: params.fps,
      cameraMotion: params.cameraMotion,
      model: params.model,
    })
  }

  /**
   * Generate video with content-filter fallback.
   * If the prompt is filtered, strips dialogue and retries with a visual-only prompt.
   */
  private async generateWithFallback(
    prompt: string,
    opts: {
      duration: number
      resolution?: string
      fps?: number
      cameraMotion?: string
      model?: string
    },
  ): Promise<Buffer> {
    const body: Record<string, unknown> = {
      prompt,
      duration: opts.duration,
      resolution: opts.resolution || '1920x1080',
      fps: opts.fps || 24,
      generate_audio: true,
      model: opts.model || 'ltx-2-3-pro',
    }
    if (opts.cameraMotion) {
      body.camera_motion = opts.cameraMotion
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

      // If content was filtered, retry with a sanitized visual-only prompt
      if (res.status === 400 && errText.includes('content_filtered')) {
        console.warn('[LTX] Content filtered, retrying with sanitized prompt...')
        const sanitizedPrompt = sanitizePromptForContentFilter(prompt)
        const retryBody = { ...body, prompt: sanitizedPrompt }
        const retryRes = await this.fetchWithRetry(`${LTX_BASE}/text-to-video`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(retryBody),
        })

        if (!retryRes.ok) {
          const retryErr = await retryRes.text()
          throw new Error(`LTX text-to-video failed after sanitization (${retryRes.status}): ${retryErr}`)
        }

        const arrayBuffer = await retryRes.arrayBuffer()
        return Buffer.from(arrayBuffer)
      }

      throw new Error(`LTX text-to-video failed (${res.status}): ${errText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async uploadVideo(mp4Buffer: Buffer): Promise<string> {
    // Step 1: Request a presigned upload URL from LTX
    const res = await this.fetchWithRetry(`${LTX_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LTX upload request failed (${res.status}): ${errText}`)
    }

    const data = await res.json() as {
      upload_url: string
      storage_uri: string
      required_headers?: Record<string, string>
    }

    if (!data.upload_url || !data.storage_uri) {
      throw new Error('LTX upload response missing upload_url or storage_uri')
    }

    // Step 2: PUT the actual video file to the presigned GCS URL
    const uploadHeaders: Record<string, string> = {
      'Content-Type': 'video/mp4',
    }
    // Include any required headers (e.g. x-goog-content-length-range)
    if (data.required_headers) {
      Object.assign(uploadHeaders, data.required_headers)
    }

    const putRes = await fetch(data.upload_url, {
      method: 'PUT',
      headers: uploadHeaders,
      body: new Uint8Array(mp4Buffer),
    })

    if (!putRes.ok) {
      const putErr = await putRes.text()
      throw new Error(`LTX file upload to GCS failed (${putRes.status}): ${putErr}`)
    }

    // Step 3: Return the storage_uri for use with extend/retake
    return data.storage_uri
  }

  async extendVideo(params: ExtendVideoParams): Promise<Buffer> {
    const body: Record<string, unknown> = {
      video_uri: params.videoUri,
      prompt: params.prompt,
      duration: params.duration,
      resolution: params.resolution || '1920x1080',
      generate_audio: true,
      model: params.model || 'ltx-2-3-pro',
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

      // Content filter fallback for extend too
      if (res.status === 400 && errText.includes('content_filtered')) {
        console.warn('[LTX] Extend content filtered, retrying with sanitized prompt...')
        const retryBody = { ...body, prompt: sanitizePromptForContentFilter(params.prompt) }
        const retryRes = await this.fetchWithRetry(`${LTX_BASE}/extend`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(retryBody),
        })

        if (!retryRes.ok) {
          const retryErr = await retryRes.text()
          throw new Error(`LTX extend failed after sanitization (${retryRes.status}): ${retryErr}`)
        }

        const arrayBuffer = await retryRes.arrayBuffer()
        return Buffer.from(arrayBuffer)
      }

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

// ─── Content Filter Helpers ──────────────────────────────────────

/**
 * Strip dialogue and politically-sensitive terms from a prompt.
 * Falls back to a pure visual/cinematic description if the original
 * prompt triggers LTX's content filter.
 */
function sanitizePromptForContentFilter(prompt: string): string {
  // Remove all quoted dialogue (this is what LTX lip-syncs)
  let sanitized = prompt.replace(/"[^"]*"/g, '')

  // Remove specific terms that may trigger content filters
  const sensitiveTerms = [
    /\b(capital(?:ism|ist)?|communis[mt]|marxis[mt]|socialist?|fascis[mt])\b/gi,
    /\b(exploit(?:ation|ing)?|oppress(?:ion|ed|ing)?|destro(?:y|yed|ying))\b/gi,
    /\b(fight|attack|devastat(?:e|ing)|blow|strike|combat|warfare)\b/gi,
    /\b(revolution(?:ary)?|class\s+(?:war|struggle)|bourgeoisie|proletariat)\b/gi,
  ]
  for (const re of sensitiveTerms) {
    sanitized = sanitized.replace(re, '')
  }

  // Clean up double spaces
  sanitized = sanitized.replace(/\s{2,}/g, ' ').trim()

  // If too short after sanitization, fall back to a generic Oxford Union scene
  if (sanitized.length < 100) {
    sanitized = `An Oxford Union-style debating chamber with dark wood paneling, leather benches, warm amber lighting, and a packed audience. Two speakers at podiums engage in a formal intellectual discussion. Cinematic 35mm film look, shallow depth of field, dramatic lighting. The audience watches intently. Ambient sound: murmuring crowd, gentle applause.`
  }

  return sanitized
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
