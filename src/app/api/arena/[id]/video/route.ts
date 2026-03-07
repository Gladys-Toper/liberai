// POST /api/arena/[id]/video — Trigger cinematic video generation
// GET  /api/arena/[id]/video — Poll generation progress
//
// Architecture: Self-chaining pipeline. Each POST processes ONE video chunk
// (~60-120s), then triggers the next step via an internal HTTP call to itself.
// This keeps each serverless invocation within Vercel's 300s limit while
// running the entire pipeline autonomously — no client re-triggering needed.

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
  createVideoService,
  uploadVideoToStorage,
} from '@/lib/arena/video-service'
import { buildTimeline } from '@/lib/arena/timeline-sync'
import type { SceneChunk } from '@/lib/arena/timeline-sync'

// Fluid Compute (Pro plan) allows up to 800s per invocation.
// Process multiple chunks per invocation to minimize fragile self-chaining.
// Each LTX call ~60-120s + upload ~10-20s = ~105s per chunk.
// At 800s limit: ~6-7 chunks per invocation safely (leave 100s buffer).
export const maxDuration = 800

// ─── Types ───────────────────────────────────────────────────────

interface VideoState {
  chunks: SceneChunk[]
  currentChunkIndex: number   // next chunk to process (0-based)
  videoUri: string | null     // LTX storage URI of accumulated video
  stepInProgress: boolean
  stepStartedAt?: string      // ISO timestamp for stale lock detection
  avgSecondsPerStep: number   // running average for time estimates
}

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
  // Prefer the stable production URL over the per-deployment VERCEL_URL
  // VERCEL_URL changes with each deploy (e.g. liberai-abc123.vercel.app)
  // and can hit Deployment Protection. The production URL is always stable.
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
    const timeout = setTimeout(() => controller.abort(), 30_000) // 30s timeout

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
    const avgPerStep = state?.avgSecondsPerStep || 120

    // Estimated time remaining
    const remainingChunks = Math.max(0, totalChunks - currentIndex)
    const estimatedSecondsRemaining = state?.stepInProgress
      ? remainingChunks * avgPerStep  // include current step
      : remainingChunks * avgPerStep

    // Total video duration in seconds
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

  // External calls need user auth; internal pipeline calls are pre-authorized
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

    // Already complete
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
        // Active step — tell client to keep polling
        return NextResponse.json({
          status: 'generating',
          progress: current.video_progress || 0,
          message: 'Step in progress. Poll GET for updates.',
          stepInProgress: true,
        }, { status: 202 })
      }
      // Stale lock — fall through to retry
      console.warn(`[Video] [${id}] Stale step lock (${Math.round(stepAge / 1000)}s). Retrying.`)
    }

    // ── STEP 0: First call — generate screenplay + start chain ──
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

      // Fetch book info
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

      const transcript = {
        session,
        rounds,
        arguments: args,
        axiomsA: axioms.filter((a) => a.side === 'a'),
        axiomsB: axioms.filter((a) => a.side === 'b'),
        bookATitle: bookAData?.title || 'Book A',
        bookAAuthor: authorMap.get(bookAData?.author_id)?.display_name || 'Author A',
        bookBTitle: bookBData?.title || 'Book B',
        bookBAuthor: authorMap.get(bookBData?.author_id)?.display_name || 'Author B',
      }

      // Generate screenplay (~10-30s LLM call)
      console.log(`[Video] [${id}] Generating screenplay...`)
      const chunks = await generateScreenplay(transcript)
      const videoDuration = chunks.reduce((s, c) => s + c.durationSeconds, 0)
      console.log(`[Video] [${id}] Screenplay: ${chunks.length} scenes, ${videoDuration}s video`)

      // Initialize pipeline state
      const initialState: VideoState = {
        chunks,
        currentChunkIndex: 0,
        videoUri: null,
        stepInProgress: true,
        stepStartedAt: new Date().toISOString(),
        avgSecondsPerStep: 120,
      }

      await db
        .from('debate_sessions')
        .update({
          video_status: 'generating',
          video_progress: 1,
          video_state: initialState,
        })
        .eq('id', id)

      // Process first chunk in background — chain continues automatically
      after(async () => {
        await runStep(id, initialState)
      })

      return NextResponse.json({
        status: 'generating',
        progress: 1,
        total: chunks.length + 1,
        message: `Screenplay ready (${chunks.length} scenes, ${Math.round(videoDuration / 60)} min video). Rendering started.`,
        estimatedSecondsRemaining: chunks.length * 120,
        videoDurationSeconds: videoDuration,
      })
    }

    // ── STEP N: Continue pipeline (internal chain or retry) ──
    if (state.currentChunkIndex >= state.chunks.length) {
      // All chunks done — shouldn't reach here normally
      return NextResponse.json({
        status: 'generating',
        message: 'Finalizing...',
      })
    }

    // Mark step in progress
    const stepState: VideoState = {
      ...state,
      stepInProgress: true,
      stepStartedAt: new Date().toISOString(),
    }

    await db
      .from('debate_sessions')
      .update({
        video_status: 'generating', // reset from 'failed' on retry
        video_state: stepState,
      })
      .eq('id', id)

    // Process chunk in background
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

// ─── Multi-Chunk Step Runner ─────────────────────────────────────
// Processes as many chunks as possible within the invocation time limit
// (maxDuration=800s, budget ~700s). Only self-chains if chunks remain.
// This eliminates the fragile one-chunk-per-invocation pattern.

const INVOCATION_BUDGET_MS = 700_000 // Leave 100s buffer before 800s timeout

async function runStep(sessionId: string, state: VideoState) {
  const db = getServiceClient()
  const videoService = createVideoService()
  const invocationStart = Date.now()

  let currentIndex = state.currentChunkIndex
  let currentVideoUri = state.videoUri
  let avgSeconds = state.avgSecondsPerStep

  try {
    const { chunks } = state

    while (currentIndex < chunks.length) {
      const chunk = chunks[currentIndex]
      const isFirst = currentIndex === 0
      const isLast = currentIndex === chunks.length - 1
      const chunkStart = Date.now()

      // Time budget check: can we fit another chunk? (skip for first chunk)
      if (!isFirst) {
        const elapsed = Date.now() - invocationStart
        const estimatedChunkTime = avgSeconds * 1000 + 30_000 // avg + 30s buffer
        if (elapsed + estimatedChunkTime > INVOCATION_BUDGET_MS) {
          console.log(`[Video] [${sessionId}] Time budget reached (${Math.round(elapsed / 1000)}s elapsed). Chaining for remaining ${chunks.length - currentIndex} chunks.`)
          break
        }
      }

      let mp4Buffer: Buffer

      if (isFirst) {
        console.log(`[Video] [${sessionId}] Chunk 0/${chunks.length}: generateFirst (${chunk.durationSeconds}s)`)
        mp4Buffer = await videoService.generateFirst({
          prompt: chunk.videoPrompt,
          duration: chunk.durationSeconds,
          cameraMotion: chunk.cameraMotion,
        })
        console.log(`[Video] [${sessionId}] First chunk: ${mp4Buffer.length} bytes`)
      } else {
        if (!currentVideoUri) throw new Error(`No videoUri for extend at chunk ${currentIndex}`)
        console.log(`[Video] [${sessionId}] Chunk ${currentIndex}/${chunks.length}: extend (${chunk.durationSeconds}s)`)
        mp4Buffer = await videoService.extendVideo({
          videoUri: currentVideoUri,
          prompt: chunk.videoPrompt,
          duration: chunk.durationSeconds,
        })
        console.log(`[Video] [${sessionId}] Chunk ${currentIndex}: ${mp4Buffer.length} bytes`)
      }

      const chunkDuration = Math.round((Date.now() - chunkStart) / 1000)
      avgSeconds = Math.round(
        (avgSeconds * currentIndex + chunkDuration) / (currentIndex + 1),
      )

      if (isLast) {
        // ── Finalize: upload to Supabase Storage + build timeline ──
        console.log(`[Video] [${sessionId}] Final chunk done. Uploading to storage (${mp4Buffer.length} bytes)...`)
        const videoUrl = await uploadVideoToStorage(mp4Buffer, sessionId)
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
              currentChunkIndex: currentIndex + 1,
              videoUri: currentVideoUri,
              stepInProgress: false,
              avgSecondsPerStep: avgSeconds,
            },
          })
          .eq('id', sessionId)

        console.log(`[Video] [${sessionId}] ✓ Pipeline complete (${Math.round((Date.now() - invocationStart) / 1000)}s): ${videoUrl}`)
        return // All done!
      }

      // ── Upload to LTX for next extend ──
      console.log(`[Video] [${sessionId}] Uploading to LTX for next extend...`)
      currentVideoUri = await videoService.uploadVideo(mp4Buffer)
      currentIndex += 1

      // Update progress in DB after each chunk
      await db
        .from('debate_sessions')
        .update({
          video_progress: currentIndex + 1,
          video_state: {
            ...state,
            currentChunkIndex: currentIndex,
            videoUri: currentVideoUri,
            stepInProgress: true,
            stepStartedAt: new Date().toISOString(),
            avgSecondsPerStep: avgSeconds,
          },
        })
        .eq('id', sessionId)

      console.log(`[Video] [${sessionId}] Chunk ${currentIndex - 1} done (${chunkDuration}s, avg=${avgSeconds}s). ${chunks.length - currentIndex} remaining.`)
    }

    // ── If we broke out of the loop (time budget), self-chain for the rest ──
    if (currentIndex < chunks.length) {
      // Mark not in progress so the next POST can pick it up
      await db
        .from('debate_sessions')
        .update({
          video_state: {
            ...state,
            currentChunkIndex: currentIndex,
            videoUri: currentVideoUri,
            stepInProgress: false,
            avgSecondsPerStep: avgSeconds,
          },
        })
        .eq('id', sessionId)

      console.log(`[Video] [${sessionId}] Self-chaining for chunks ${currentIndex}-${chunks.length - 1}...`)
      await triggerNextStep(sessionId)
    }
  } catch (err) {
    console.error(`[Video] [${sessionId}] Step failed:`, (err as Error)?.message || err)
    console.error(`[Video] [${sessionId}] Stack:`, (err as Error)?.stack)

    // Mark failed but preserve state for retry
    await db
      .from('debate_sessions')
      .update({
        video_status: 'failed',
        video_state: { ...state, stepInProgress: false },
      })
      .eq('id', sessionId)
  }
}
