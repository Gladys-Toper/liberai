// POST /api/arena/[id]/video — Trigger cinematic video generation (Kling V3)
// GET  /api/arena/[id]/video — Poll generation progress
//
// Architecture: Self-chaining pipeline using Kling V3 independent segments.
// Each segment is generated via text2video (first) or image2video (subsequent),
// with last-frame seeding for visual continuity and kling_elements for
// character consistency. Segments are checkpointed to Supabase Storage.
// Final step concatenates all segments via ffmpeg.

import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import {
  getDebateSession,
  getDebateAxioms,
  getDebateRounds,
  getDebateArguments,
} from '@/lib/agents/debate-engine'
import { generateScreenplay } from '@/lib/arena/screenplay-generator'
import {
  uploadVideoToStorage,
  generateCharacterRefImage,
} from '@/lib/arena/video-service'
import { KlingV3VideoService } from '@/lib/arena/kling-v3-service'
import type { KlingElement } from '@/lib/arena/kling-v3-service'
import { extractLastFrame, concatenateVideos } from '@/lib/arena/ffmpeg-utils'
import { buildTimeline } from '@/lib/arena/timeline-sync'
import type { SceneChunk } from '@/lib/arena/timeline-sync'

// Fluid Compute (Pro plan) allows up to 800s per invocation.
// Each Kling V3 segment ~60-90s generation + ~10s frame extraction + ~10s upload.
// At 800s limit: ~6-8 segments per invocation safely (leave 100s buffer).
export const maxDuration = 800

// ─── Types ───────────────────────────────────────────────────────

interface CharacterRef {
  name: string
  refImageUrl: string
  description: string
}

interface VideoState {
  chunks: SceneChunk[]
  currentChunkIndex: number
  segmentUrls: string[]         // Supabase URLs: videos/{id}/segment-{i}.mp4
  lastFrameUrl: string | null   // Public URL of most recent last-frame JPG
  characterRefs?: {
    authorA: CharacterRef
    authorB: CharacterRef
  }
  stepInProgress: boolean
  stepStartedAt?: string
  avgSecondsPerStep: number
  lastError?: string
  lastErrorChunk?: number
}

const VIDEO_BUCKET = 'debate-video'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Check if this is an internal pipeline continuation call */
function isInternalCall(request: Request): boolean {
  const secret = request.headers.get('x-video-pipeline-key')
  return !!secret && secret === process.env.VIDEO_PIPELINE_SECRET
}

/** Trigger the next pipeline step via self-invocation */
async function triggerNextStep(sessionId: string) {
  const baseUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.NEXT_PUBLIC_APP_URL
        ? process.env.NEXT_PUBLIC_APP_URL
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'

  const url = `${baseUrl}/api/arena/${sessionId}/video`
  console.log(`[Video] [${sessionId}] Self-chain → ${url}`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-video-pipeline-key': process.env.VIDEO_PIPELINE_SECRET || '',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const err = await res.text()
      console.error(`[Video] [${sessionId}] Self-trigger failed (${res.status}): ${err}`)
    } else {
      console.log(`[Video] [${sessionId}] Self-trigger success (${res.status})`)
    }
  } catch (err) {
    console.error(`[Video] [${sessionId}] Self-trigger error:`, err)
  }
}

// ─── GET: Poll progress ──────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const db = getServiceClient()
    const { data: session, error } = await db
      .from('debate_sessions')
      .select('video_status, video_progress, video_url, video_timeline, video_state')
      .eq('id', id)
      .single()

    if (error || !session) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
    }

    const state = session.video_state as VideoState | null
    const totalChunks = state?.chunks?.length || 0
    const currentIndex = state?.currentChunkIndex || 0
    const avgPerStep = state?.avgSecondsPerStep || 90

    const remainingChunks = Math.max(0, totalChunks - currentIndex)
    const estimatedSecondsRemaining = remainingChunks * avgPerStep

    const videoDurationSeconds = state?.chunks
      ? state.chunks.reduce((sum, c) => sum + c.durationSeconds, 0)
      : 0

    return NextResponse.json({
      status: session.video_status || 'none',
      progress: session.video_progress || 0,
      total: totalChunks > 0 ? totalChunks + 1 : 0,
      videoUrl: session.video_url || null,
      timeline: session.video_timeline || null,
      stepInProgress: state?.stepInProgress || false,
      estimatedSecondsRemaining: Math.round(estimatedSecondsRemaining),
      videoDurationSeconds,
      segmentsCompleted: state?.segmentUrls?.length || 0,
    })
  } catch (err) {
    console.error('[Video] GET error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}

// ─── POST: Initialize or continue pipeline ───────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const internal = isInternalCall(request)

  if (!internal) {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const db = getServiceClient()
    const { data: current } = await db
      .from('debate_sessions')
      .select('video_status, video_progress, video_state, status')
      .eq('id', id)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
    }

    if (current.video_status === 'complete') {
      return NextResponse.json(
        { error: 'Video already generated. Use GET to retrieve.' },
        { status: 409 },
      )
    }

    const state = current.video_state as VideoState | null

    // Step in progress — check for stale lock (> 5 min)
    if (state?.stepInProgress) {
      const stepAge = state.stepStartedAt
        ? Date.now() - new Date(state.stepStartedAt).getTime()
        : Infinity

      if (stepAge < 5 * 60 * 1000) {
        return NextResponse.json({
          status: 'generating',
          progress: current.video_progress || 0,
          message: 'Step in progress. Poll GET for updates.',
          stepInProgress: true,
        }, { status: 202 })
      }
      console.warn(`[Video] [${id}] Stale step lock (${Math.round(stepAge / 1000)}s). Retrying.`)
    }

    // ── STEP 0: First call — screenplay + character refs + start chain ──
    if (!state) {
      if (current.status !== 'completed') {
        return NextResponse.json(
          { error: 'Debate must be completed before generating video' },
          { status: 400 },
        )
      }

      // Fetch debate data
      const [session, axioms, rounds, args] = await Promise.all([
        getDebateSession(id),
        getDebateAxioms(id),
        getDebateRounds(id),
        getDebateArguments(id),
      ])

      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      // Fetch book + author info
      const [{ data: bookAData }, { data: bookBData }] = await Promise.all([
        db.from('books').select('id, title, author_id').eq('id', session.book_a_id).single(),
        db.from('books').select('id, title, author_id').eq('id', session.book_b_id).single(),
      ])

      const authorIds = [bookAData?.author_id, bookBData?.author_id].filter(Boolean)
      const { data: authors } = authorIds.length
        ? await db.from('authors').select('id, display_name').in('id', authorIds)
        : { data: [] }
      const authorMap = new Map(
        (authors || []).map((a: { id: string; display_name: string }) => [a.id, a] as const),
      )

      const authorAName = authorMap.get(bookAData?.author_id)?.display_name || 'Author A'
      const authorBName = authorMap.get(bookBData?.author_id)?.display_name || 'Author B'

      const transcript = {
        session,
        rounds,
        arguments: args,
        axiomsA: axioms.filter((a) => a.side === 'a'),
        axiomsB: axioms.filter((a) => a.side === 'b'),
        bookATitle: bookAData?.title || 'Book A',
        bookAAuthor: authorAName,
        bookBTitle: bookBData?.title || 'Book B',
        bookBAuthor: authorBName,
      }

      // Generate screenplay
      console.log(`[Video] [${id}] Generating screenplay...`)
      const chunks = await generateScreenplay(transcript)
      const videoDuration = chunks.reduce((s, c) => s + c.durationSeconds, 0)
      console.log(`[Video] [${id}] Screenplay: ${chunks.length} scenes, ${videoDuration}s video`)

      // Generate character reference portraits via Nano Banana 2
      console.log(`[Video] [${id}] Generating character reference images...`)
      const [refImageA, refImageB] = await Promise.all([
        generateCharacterRefImage(authorAName),
        generateCharacterRefImage(authorBName),
      ])

      // Upload ref images to Supabase Storage
      const refPathA = `characters/${id}/author-a.png`
      const refPathB = `characters/${id}/author-b.png`

      await Promise.all([
        db.storage.from(VIDEO_BUCKET).upload(refPathA, refImageA, {
          contentType: 'image/png', upsert: true,
        }),
        db.storage.from(VIDEO_BUCKET).upload(refPathB, refImageB, {
          contentType: 'image/png', upsert: true,
        }),
      ])

      const refUrlA = db.storage.from(VIDEO_BUCKET).getPublicUrl(refPathA).data.publicUrl
      const refUrlB = db.storage.from(VIDEO_BUCKET).getPublicUrl(refPathB).data.publicUrl

      console.log(`[Video] [${id}] Character refs uploaded: AuthorA=${refUrlA.slice(-40)}, AuthorB=${refUrlB.slice(-40)}`)

      const characterRefs = {
        authorA: {
          name: authorAName,
          refImageUrl: refUrlA,
          description: `Distinguished intellectual and author of "${bookAData?.title || 'Book A'}"`,
        },
        authorB: {
          name: authorBName,
          refImageUrl: refUrlB,
          description: `Distinguished intellectual and author of "${bookBData?.title || 'Book B'}"`,
        },
      }

      // Initialize pipeline state
      const initialState: VideoState = {
        chunks,
        currentChunkIndex: 0,
        segmentUrls: [],
        lastFrameUrl: null,
        characterRefs,
        stepInProgress: true,
        stepStartedAt: new Date().toISOString(),
        avgSecondsPerStep: 90,
      }

      await db
        .from('debate_sessions')
        .update({
          video_status: 'generating',
          video_progress: 1,
          video_state: initialState,
        })
        .eq('id', id)

      // Process segments in background
      after(async () => {
        await runStep(id, initialState)
      })

      return NextResponse.json({
        status: 'generating',
        progress: 1,
        total: chunks.length + 1,
        message: `Screenplay ready (${chunks.length} scenes, ${Math.round(videoDuration / 60)} min video). Character refs generated. Rendering started.`,
        estimatedSecondsRemaining: chunks.length * 90,
        videoDurationSeconds: videoDuration,
      })
    }

    // ── STEP N: Continue pipeline (internal chain or retry) ──
    if (state.currentChunkIndex >= state.chunks.length) {
      return NextResponse.json({
        status: 'generating',
        message: 'Finalizing...',
      })
    }

    const stepState: VideoState = {
      ...state,
      stepInProgress: true,
      stepStartedAt: new Date().toISOString(),
    }

    await db
      .from('debate_sessions')
      .update({
        video_status: 'generating',
        video_state: stepState,
      })
      .eq('id', id)

    after(async () => {
      await runStep(id, stepState)
    })

    return NextResponse.json({
      status: 'generating',
      progress: current.video_progress || state.currentChunkIndex + 1,
      total: state.chunks.length + 1,
      stepInProgress: true,
    })
  } catch (err) {
    console.error('[Video] POST error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}

// ─── V3 Segment Loop ────────────────────────────────────────────
// Processes as many segments as possible within the invocation time limit.
// Each segment: Kling V3 API call → extract last frame → upload both → checkpoint.
// Self-chains if segments remain after time budget.

const INVOCATION_BUDGET_MS = 700_000

async function runStep(sessionId: string, state: VideoState) {
  const db = getServiceClient()
  const klingV3 = new KlingV3VideoService()
  const invocationStart = Date.now()

  let currentIndex = state.currentChunkIndex
  let segmentUrls = [...state.segmentUrls]
  let lastFrameUrl = state.lastFrameUrl
  let avgSeconds = state.avgSecondsPerStep

  // Build Kling elements from character refs
  const elements: KlingElement[] = []
  if (state.characterRefs) {
    elements.push({
      name: 'AuthorA',
      description: state.characterRefs.authorA.description,
      element_input_urls: [state.characterRefs.authorA.refImageUrl],
    })
    elements.push({
      name: 'AuthorB',
      description: state.characterRefs.authorB.description,
      element_input_urls: [state.characterRefs.authorB.refImageUrl],
    })
  }

  try {
    const { chunks } = state

    while (currentIndex < chunks.length) {
      const chunk = chunks[currentIndex]
      const isFirst = currentIndex === 0
      const isLast = currentIndex === chunks.length - 1
      const chunkStart = Date.now()

      // Time budget check (skip for first chunk)
      if (!isFirst) {
        const elapsed = Date.now() - invocationStart
        const estimatedChunkTime = avgSeconds * 1000 + 30_000
        if (elapsed + estimatedChunkTime > INVOCATION_BUDGET_MS) {
          console.log(`[Video] [${sessionId}] Time budget reached (${Math.round(elapsed / 1000)}s). Chaining for remaining ${chunks.length - currentIndex} segments.`)
          break
        }
      }

      // Cooldown between Kling API calls to avoid rate limiting
      if (!isFirst) {
        console.log(`[Video] [${sessionId}] Cooldown 5s before segment ${currentIndex}...`)
        await new Promise((r) => setTimeout(r, 5_000))
      }

      let mp4Buffer: Buffer

      if (isFirst || !lastFrameUrl) {
        // First segment: text2video
        console.log(`[Video] [${sessionId}] Segment ${currentIndex}/${chunks.length}: text2video (${chunk.durationSeconds}s)`)
        mp4Buffer = await klingV3.text2video({
          prompt: chunk.videoPrompt,
          duration: chunk.durationSeconds,
          elements,
        })
      } else {
        // Subsequent segments: image2video with last frame as seed
        console.log(`[Video] [${sessionId}] Segment ${currentIndex}/${chunks.length}: image2video (${chunk.durationSeconds}s)`)
        mp4Buffer = await klingV3.image2video({
          prompt: chunk.videoPrompt,
          duration: chunk.durationSeconds,
          elements,
          imageUrl: lastFrameUrl,
        })
      }

      console.log(`[Video] [${sessionId}] Segment ${currentIndex}: ${Math.round(mp4Buffer.length / 1024)}KB`)

      // Extract last frame for next segment's seed
      const frameBuffer = await extractLastFrame(mp4Buffer)

      // Upload segment + frame to Supabase Storage
      const segPath = `videos/${sessionId}/segment-${currentIndex}.mp4`
      const framePath = `videos/${sessionId}/frame-${currentIndex}.jpg`

      await Promise.all([
        db.storage.from(VIDEO_BUCKET).upload(segPath, mp4Buffer, {
          contentType: 'video/mp4', upsert: true,
        }),
        db.storage.from(VIDEO_BUCKET).upload(framePath, frameBuffer, {
          contentType: 'image/jpeg', upsert: true,
        }),
      ])

      const segUrl = db.storage.from(VIDEO_BUCKET).getPublicUrl(segPath).data.publicUrl
      const frameUrl = db.storage.from(VIDEO_BUCKET).getPublicUrl(framePath).data.publicUrl

      segmentUrls.push(segUrl)
      lastFrameUrl = frameUrl

      const chunkDuration = Math.round((Date.now() - chunkStart) / 1000)
      avgSeconds = Math.round(
        (avgSeconds * currentIndex + chunkDuration) / (currentIndex + 1),
      )

      currentIndex += 1

      if (isLast) {
        // ── Finalize: download all segments → concatenate → upload final ──
        console.log(`[Video] [${sessionId}] All ${segmentUrls.length} segments done. Concatenating...`)

        const segmentBuffers: Buffer[] = []
        for (const url of segmentUrls) {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`Failed to download segment: ${url}`)
          segmentBuffers.push(Buffer.from(await res.arrayBuffer()))
        }

        const finalVideo = await concatenateVideos(segmentBuffers)
        console.log(`[Video] [${sessionId}] Concatenated → ${Math.round(finalVideo.length / 1024 / 1024)}MB`)

        const videoUrl = await uploadVideoToStorage(finalVideo, sessionId)
        const timeline = buildTimeline(chunks)

        await db
          .from('debate_sessions')
          .update({
            video_status: 'complete',
            video_progress: chunks.length + 1,
            video_url: videoUrl,
            video_timeline: timeline,
            video_state: {
              ...state,
              currentChunkIndex: currentIndex,
              segmentUrls,
              lastFrameUrl,
              stepInProgress: false,
              avgSecondsPerStep: avgSeconds,
            },
          })
          .eq('id', sessionId)

        console.log(`[Video] [${sessionId}] Pipeline complete (${Math.round((Date.now() - invocationStart) / 1000)}s): ${videoUrl}`)
        return
      }

      // Update progress checkpoint
      await db
        .from('debate_sessions')
        .update({
          video_progress: currentIndex + 1,
          video_state: {
            ...state,
            currentChunkIndex: currentIndex,
            segmentUrls,
            lastFrameUrl,
            stepInProgress: true,
            stepStartedAt: new Date().toISOString(),
            avgSecondsPerStep: avgSeconds,
          },
        })
        .eq('id', sessionId)

      console.log(`[Video] [${sessionId}] Segment ${currentIndex - 1} done (${chunkDuration}s, avg=${avgSeconds}s). ${chunks.length - currentIndex} remaining.`)
    }

    // ── Time budget reached — self-chain for remaining segments ──
    if (currentIndex < chunks.length) {
      await db
        .from('debate_sessions')
        .update({
          video_state: {
            ...state,
            currentChunkIndex: currentIndex,
            segmentUrls,
            lastFrameUrl,
            stepInProgress: false,
            avgSecondsPerStep: avgSeconds,
          },
        })
        .eq('id', sessionId)

      console.log(`[Video] [${sessionId}] Self-chaining for segments ${currentIndex}-${chunks.length - 1}...`)
      await triggerNextStep(sessionId)
    }
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.error(`[Video] [${sessionId}] Step failed at segment ${currentIndex}:`, errMsg)
    console.error(`[Video] [${sessionId}] Stack:`, (err as Error)?.stack)

    await db
      .from('debate_sessions')
      .update({
        video_status: 'failed',
        video_state: {
          ...state,
          currentChunkIndex: currentIndex,
          segmentUrls,
          lastFrameUrl,
          avgSecondsPerStep: avgSeconds,
          stepInProgress: false,
          lastError: errMsg.slice(0, 500),
          lastErrorChunk: currentIndex,
        },
      })
      .eq('id', sessionId)
  }
}
