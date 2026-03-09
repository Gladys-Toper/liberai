// Cinematic Video Pipeline — Video Service Abstraction Layer
//
// IVideoService abstracts the video generation backend so we can swap
// providers without touching orchestration code.
//
// Supported providers:
// - LTX 2.3: Synchronous, returns MP4 buffer directly. Dialogue lip-sync.
// - Kling 2.6: Async (submit → poll → download). Native audio, 5-10s clips,
//   extend via video_id up to 3 min. JWT auth with HMAC-SHA256.

import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { google } from '@ai-sdk/google'
import { generateImage } from 'ai'

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
  console.log(`[VideoService] Provider: "${provider}" (env: "${process.env.VIDEO_PROVIDER}")`)
  switch (provider) {
    case 'kling':
      return new KlingVideoService()
    case 'ltx':
      return new LtxVideoService()
    default:
      return new LtxVideoService()
  }
}

// ─── Kling Adapter ──────────────────────────────────────────────

export const KLING_BASE = 'https://api-singapore.klingai.com'

/** Generate a JWT token for Kling API auth (HS256, no external deps) */
export function generateKlingJwt(accessKey: string, secretKey: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 }

  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  const headerB64 = b64url(header)
  const payloadB64 = b64url(payload)
  const sig = createHmac('sha256', secretKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  return `${headerB64}.${payloadB64}.${sig}`
}

interface KlingTaskResponse {
  code: number
  message: string
  data: {
    task_id: string
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed'
    task_status_msg?: string
    task_result?: {
      videos: { id: string; url: string; duration: string }[]
    }
  }
}

class KlingVideoService implements IVideoService {
  private accessKey: string
  private secretKey: string

  constructor() {
    const ak = process.env.KLING_ACCESS_KEY
    const sk = process.env.KLING_SECRET_KEY
    if (!ak || !sk) throw new Error('KLING_ACCESS_KEY and KLING_SECRET_KEY must be set')
    this.accessKey = ak
    this.secretKey = sk
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${generateKlingJwt(this.accessKey, this.secretKey)}`,
      'Content-Type': 'application/json',
    }
  }

  async generateFirst(params: GenerateFirstParams): Promise<Buffer> {
    // Kling durations: '5' or '10'. Pick closest.
    const duration = params.duration <= 7 ? '5' : '10'

    const body = {
      model_name: 'kling-v2-6',
      prompt: params.prompt,
      duration,
      aspect_ratio: '16:9',
      mode: 'std',
    }

    console.log(`[Kling] text2video: "${params.prompt.slice(0, 80)}..." (${duration}s)`)

    const createRes = await this.fetchWithRetry(`${KLING_BASE}/v1/videos/text2video`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      throw new Error(`Kling text2video failed (${createRes.status}): ${errText}`)
    }

    const createData = (await createRes.json()) as KlingTaskResponse
    if (createData.code !== 0) {
      throw new Error(`Kling text2video error: ${createData.message}`)
    }

    const taskId = createData.data.task_id
    console.log(`[Kling] Task created: ${taskId}`)

    return this.pollAndDownload(taskId, `/v1/videos/text2video/${taskId}`)
  }

  /**
   * Upload a video buffer — Kling extends by video_id (returned from generation),
   * not by uploading raw buffers. We store the Kling video_id as the "URI".
   * This is called by the pipeline but for Kling, the video_id is already
   * captured from the generation result. Return it as-is.
   */
  async uploadVideo(_mp4Buffer: Buffer): Promise<string> {
    // Kling doesn't need raw buffer uploads for extend.
    // The video_id from the last generation serves as the extend reference.
    // The pipeline saves this as videoUri after each chunk.
    // If we need to recover from a checkpoint, we'll use image-to-video
    // with the last frame instead.
    throw new Error(
      'Kling does not support raw buffer uploads. Use video_id from generation result.',
    )
  }

  async extendVideo(params: ExtendVideoParams): Promise<Buffer> {
    // params.videoUri contains the Kling video_id from the previous generation
    const body = {
      video_id: params.videoUri,
      prompt: params.prompt,
    }

    console.log(`[Kling] extend: video_id=${params.videoUri}, "${params.prompt.slice(0, 80)}..."`)

    const createRes = await this.fetchWithRetry(`${KLING_BASE}/v1/videos/video-extend`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      throw new Error(`Kling extend failed (${createRes.status}): ${errText}`)
    }

    const createData = (await createRes.json()) as KlingTaskResponse
    if (createData.code !== 0) {
      throw new Error(`Kling extend error: ${createData.message}`)
    }

    const taskId = createData.data.task_id
    console.log(`[Kling] Extend task created: ${taskId}`)

    return this.pollAndDownload(taskId, `/v1/videos/video-extend/${taskId}`)
  }

  /**
   * Poll a Kling task until it completes, then download the video buffer.
   * Returns both the MP4 buffer and stashes the video_id for extend.
   */
  private async pollAndDownload(
    taskId: string,
    pollPath: string,
  ): Promise<Buffer> {
    const maxPollMs = 10 * 60 * 1000  // 10 min timeout
    const pollInterval = 5_000         // 5s between polls
    const startTime = Date.now()

    while (Date.now() - startTime < maxPollMs) {
      await new Promise((r) => setTimeout(r, pollInterval))

      const pollRes = await fetch(`${KLING_BASE}${pollPath}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!pollRes.ok) {
        console.warn(`[Kling] Poll ${taskId} got ${pollRes.status}, retrying...`)
        continue
      }

      const pollData = (await pollRes.json()) as KlingTaskResponse

      if (pollData.data.task_status === 'succeed') {
        const videos = pollData.data.task_result?.videos
        if (!videos?.length) {
          throw new Error(`Kling task ${taskId} succeeded but no videos in result`)
        }

        const videoUrl = videos[0].url
        const videoId = videos[0].id
        console.log(`[Kling] Task ${taskId} complete. video_id=${videoId}, downloading...`)

        // Download the MP4
        const dlRes = await fetch(videoUrl)
        if (!dlRes.ok) {
          throw new Error(`Kling video download failed (${dlRes.status})`)
        }

        const buffer = Buffer.from(await dlRes.arrayBuffer())
        console.log(`[Kling] Downloaded ${Math.round(buffer.length / 1024)}KB`)

        // Stash the video_id in the buffer so the pipeline can extract it.
        // We use a custom property on the Buffer object.
        ;(buffer as Buffer & { klingVideoId?: string }).klingVideoId = videoId

        return buffer
      }

      if (pollData.data.task_status === 'failed') {
        throw new Error(
          `Kling task ${taskId} failed: ${pollData.data.task_status_msg || 'unknown error'}`,
        )
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000)
      console.log(`[Kling] Task ${taskId}: ${pollData.data.task_status} (${elapsed}s)`)
    }

    throw new Error(`Kling task ${taskId} timed out after ${maxPollMs / 1000}s`)
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    maxRetries = 3,
  ): Promise<Response> {
    let lastErr: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, init)
      if (res.status !== 429) return res

      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * 2 ** attempt, 30_000)

      console.warn(`[Kling] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`)
      lastErr = new Error(`Rate limited after ${maxRetries} retries`)
      await new Promise((r) => setTimeout(r, waitMs))
    }

    throw lastErr ?? new Error('Kling request failed after retries')
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

// ─── Character Reference Image Generation ───────────────────────

/**
 * Generate a photorealistic portrait for a debate author using Nano Banana 2.
 * Used as Kling V3 element reference for character consistency across segments.
 */
export async function generateCharacterRefImage(
  authorName: string,
): Promise<Buffer> {
  console.log(`[CharRef] Generating reference portrait for ${authorName}...`)
  const { images } = await generateImage({
    model: google.image('gemini-3.1-flash-image-preview'),
    prompt: `Photorealistic portrait photograph of ${authorName}, distinguished intellectual and author. Professional studio headshot with dramatic side lighting. The subject wears formal academic attire, looking directly at the camera with an intense, thoughtful expression. Sharp focus, high detail, neutral dark background. Cinematic 35mm film quality.`,
    aspectRatio: '1:1',
    providerOptions: {
      google: { personGeneration: 'allow_adult' as const },
    },
  })

  if (!images || images.length === 0 || !images[0].uint8Array) {
    throw new Error(`Character reference image generation failed for ${authorName}`)
  }

  const buffer = Buffer.from(images[0].uint8Array)
  console.log(`[CharRef] Generated ${authorName} portrait: ${Math.round(buffer.length / 1024)}KB`)
  return buffer
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
