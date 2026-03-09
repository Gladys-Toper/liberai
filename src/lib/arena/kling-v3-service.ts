// ═══════════════════════════════════════════════════════════════════════════
// Kling V3 Video Service — text2video + image2video with Element References
// ═══════════════════════════════════════════════════════════════════════════
//
// Kling V3 (March 2026) replaces the V2.6 extend-based pipeline.
// Key differences:
//   - No video-extend. Each segment is independent.
//   - Visual continuity via image2video (last frame as seed).
//   - Character consistency via kling_elements + @ElementName in prompts.
//   - Native audio: dialogue in quotes → lip-synced speech.
//   - Model: kling-v3
//
// Auth: JWT HS256 with access_key/secret_key (same as V2.6).
// Base URL: api-singapore.klingai.com (confirmed working).
// ═══════════════════════════════════════════════════════════════════════════

import { generateKlingJwt, KLING_BASE } from './video-service'

// ─── Public Types ────────────────────────────────────────────────

export interface KlingElement {
  name: string                 // e.g. "AuthorA" — referenced as @AuthorA in prompts
  description: string          // Physical appearance description
  element_input_urls: string[] // Public URLs of reference images
}

export interface KlingV3Params {
  prompt: string
  duration: number             // seconds (5 or 10)
  elements?: KlingElement[]
}

export interface KlingV3ImageParams extends KlingV3Params {
  imageUrl: string             // Seed frame URL (last frame of previous segment)
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

// ─── Service ─────────────────────────────────────────────────────

export class KlingV3VideoService {
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

  /**
   * Generate a video segment from a text prompt (first segment).
   * Uses Kling V3 text2video with optional element references.
   */
  async text2video(params: KlingV3Params): Promise<Buffer> {
    const duration = params.duration <= 7 ? '5' : '10'

    const body: Record<string, unknown> = {
      model_name: 'kling-v3',
      prompt: params.prompt,
      duration,
      aspect_ratio: '16:9',
    }

    if (params.elements?.length) {
      body.kling_elements = params.elements
    }

    console.log(`[KlingV3] text2video: "${params.prompt.slice(0, 80)}..." (${duration}s)`)

    const createRes = await this.fetchWithRetry(`${KLING_BASE}/v1/videos/text2video`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      throw new Error(`Kling V3 text2video failed (${createRes.status}): ${errText}`)
    }

    const createData = (await createRes.json()) as KlingTaskResponse
    if (createData.code !== 0) {
      throw new Error(`Kling V3 text2video error: ${createData.message}`)
    }

    const taskId = createData.data.task_id
    console.log(`[KlingV3] text2video task created: ${taskId}`)

    return this.pollAndDownload(taskId, `/v1/videos/text2video/${taskId}`)
  }

  /**
   * Generate a video segment from an image seed + text prompt.
   * Uses Kling V3 image2video — the image becomes the first frame,
   * providing visual continuity from the previous segment.
   */
  async image2video(params: KlingV3ImageParams): Promise<Buffer> {
    const duration = params.duration <= 7 ? '5' : '10'

    const body: Record<string, unknown> = {
      model_name: 'kling-v3',
      prompt: params.prompt,
      duration,
      aspect_ratio: '16:9',
      image: params.imageUrl,
    }

    if (params.elements?.length) {
      body.kling_elements = params.elements
    }

    console.log(`[KlingV3] image2video: seed=${params.imageUrl.slice(-40)} "${params.prompt.slice(0, 60)}..." (${duration}s)`)

    const createRes = await this.fetchWithRetry(`${KLING_BASE}/v1/videos/image2video`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      throw new Error(`Kling V3 image2video failed (${createRes.status}): ${errText}`)
    }

    const createData = (await createRes.json()) as KlingTaskResponse
    if (createData.code !== 0) {
      throw new Error(`Kling V3 image2video error: ${createData.message}`)
    }

    const taskId = createData.data.task_id
    console.log(`[KlingV3] image2video task created: ${taskId}`)

    return this.pollAndDownload(taskId, `/v1/videos/image2video/${taskId}`)
  }

  /**
   * Poll a Kling task until completion, then download the MP4 buffer.
   */
  private async pollAndDownload(taskId: string, pollPath: string): Promise<Buffer> {
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
        console.warn(`[KlingV3] Poll ${taskId} got ${pollRes.status}, retrying...`)
        continue
      }

      const pollData = (await pollRes.json()) as KlingTaskResponse

      if (pollData.data.task_status === 'succeed') {
        const videos = pollData.data.task_result?.videos
        if (!videos?.length) {
          throw new Error(`Kling V3 task ${taskId} succeeded but no videos in result`)
        }

        const videoUrl = videos[0].url
        console.log(`[KlingV3] Task ${taskId} complete. Downloading...`)

        const dlRes = await fetch(videoUrl)
        if (!dlRes.ok) {
          throw new Error(`Kling V3 video download failed (${dlRes.status})`)
        }

        const buffer = Buffer.from(await dlRes.arrayBuffer())
        console.log(`[KlingV3] Downloaded ${Math.round(buffer.length / 1024)}KB`)

        return buffer
      }

      if (pollData.data.task_status === 'failed') {
        throw new Error(
          `Kling V3 task ${taskId} failed: ${pollData.data.task_status_msg || 'unknown error'}`,
        )
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000)
      console.log(`[KlingV3] Task ${taskId}: ${pollData.data.task_status} (${elapsed}s)`)
    }

    throw new Error(`Kling V3 task ${taskId} timed out after ${maxPollMs / 1000}s`)
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    maxRetries = 6,
  ): Promise<Response> {
    let lastErr: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Re-generate JWT for each attempt (may expire during long waits)
      if (attempt > 0 && init.headers) {
        const headers = init.headers as Record<string, string>
        headers['Authorization'] = `Bearer ${generateKlingJwt(this.accessKey, this.secretKey)}`
      }

      const res = await fetch(url, init)
      if (res.status !== 429) return res

      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(10_000 * 2 ** attempt, 120_000) // 10s, 20s, 40s, 80s, 120s, 120s

      console.warn(`[KlingV3] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs / 1000)}s`)
      lastErr = new Error(`Rate limited after ${maxRetries} retries`)
      await new Promise((r) => setTimeout(r, waitMs))
    }

    throw lastErr ?? new Error('Kling V3 request failed after retries')
  }
}
