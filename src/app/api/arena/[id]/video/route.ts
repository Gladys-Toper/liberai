// POST /api/arena/[id]/video — Trigger cinematic video generation
// GET  /api/arena/[id]/video — Poll generation progress

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

// Allow this route up to 5 minutes (300s) for video generation pipeline.
// Hobby plan: 60s max. Pro plan: 300s max.
export const maxDuration = 300

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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
      .select('video_status, video_progress, video_url, video_timeline')
      .eq('id', id)
      .single()

    if (error || !session) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: session.video_status || 'none',
      progress: session.video_progress || 0,
      videoUrl: session.video_url || null,
      timeline: session.video_timeline || null,
    })
  } catch (err) {
    console.error('[Video] GET error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}

// ─── POST: Trigger generation ────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await resolveAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Validate debate is completed
    const [session, axioms, rounds, args] = await Promise.all([
      getDebateSession(id),
      getDebateAxioms(id),
      getDebateRounds(id),
      getDebateArguments(id),
    ])

    if (!session) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
    }

    if (session.status !== 'completed') {
      return NextResponse.json(
        { error: 'Debate must be completed before generating video' },
        { status: 400 },
      )
    }

    // Check if already generating or complete
    const db = getServiceClient()
    const { data: current } = await db
      .from('debate_sessions')
      .select('video_status')
      .eq('id', id)
      .single()

    if (current?.video_status === 'generating') {
      return NextResponse.json(
        { error: 'Video generation already in progress' },
        { status: 409 },
      )
    }

    if (current?.video_status === 'complete') {
      return NextResponse.json(
        { error: 'Video already generated. Use GET to retrieve.' },
        { status: 409 },
      )
    }

    // 2. Mark as generating
    await db
      .from('debate_sessions')
      .update({ video_status: 'generating', video_progress: 0 })
      .eq('id', id)

    // 3. Fetch book info for screenplay
    const [{ data: bookAData }, { data: bookBData }] = await Promise.all([
      db
        .from('books')
        .select('id, title, author_id')
        .eq('id', session.book_a_id)
        .single(),
      db
        .from('books')
        .select('id, title, author_id')
        .eq('id', session.book_b_id)
        .single(),
    ])

    const authorIds = [bookAData?.author_id, bookBData?.author_id].filter(
      Boolean,
    )
    const { data: authors } = authorIds.length
      ? await db
          .from('authors')
          .select('id, display_name')
          .in('id', authorIds)
      : { data: [] }
    const authorMap = new Map(
      (authors || []).map(
        (a: { id: string; display_name: string }) => [a.id, a] as const,
      ),
    )

    const axiomsA = axioms.filter((a) => a.side === 'a')
    const axiomsB = axioms.filter((a) => a.side === 'b')

    const transcript = {
      session,
      rounds,
      arguments: args,
      axiomsA,
      axiomsB,
      bookATitle: bookAData?.title || 'Book A',
      bookAAuthor:
        authorMap.get(bookAData?.author_id)?.display_name || 'Author A',
      bookBTitle: bookBData?.title || 'Book B',
      bookBAuthor:
        authorMap.get(bookBData?.author_id)?.display_name || 'Author B',
    }

    // 4. Use next/server after() to run the pipeline after response is sent.
    // This keeps the serverless function alive for the full maxDuration.
    after(async () => {
      try {
        await runPipeline(id, transcript)
      } catch (err) {
        console.error('[Video] Pipeline failed:', (err as Error)?.message || err)
        console.error('[Video] Stack:', (err as Error)?.stack)
        const failDb = getServiceClient()
        await failDb
          .from('debate_sessions')
          .update({ video_status: 'failed' })
          .eq('id', id)
      }
    })

    return NextResponse.json({
      status: 'generating',
      progress: 0,
      message: 'Video generation started. Poll GET for progress.',
    })
  } catch (err) {
    console.error('[Video] POST error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}

// ─── Background Pipeline ─────────────────────────────────────────

async function runPipeline(
  sessionId: string,
  transcript: Parameters<typeof generateScreenplay>[0],
) {
  const db = getServiceClient()
  const videoService = createVideoService()

  // Step 1: Generate screenplay
  console.log(`[Video] Generating screenplay for ${sessionId}...`)
  const chunks = await generateScreenplay(transcript)
  const totalChunks = chunks.length

  await db
    .from('debate_sessions')
    .update({ video_progress: 1 })
    .eq('id', sessionId)

  // Step 2: Generate first chunk
  console.log(`[Video] Generating chunk 1/${totalChunks}...`)
  let mp4Buffer = await videoService.generateFirst({
    prompt: chunks[0].videoPrompt,
    duration: chunks[0].durationSeconds,
    cameraMotion: chunks[0].cameraMotion,
  })

  await db
    .from('debate_sessions')
    .update({ video_progress: 2 })
    .eq('id', sessionId)

  // Step 3: Iteratively extend for remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    console.log(`[Video] Extending with chunk ${i + 1}/${totalChunks}...`)

    // Upload current video to get storage URI for extend
    const videoUri = await videoService.uploadVideo(mp4Buffer)
    console.log(`[Video] Uploaded chunk ${i}, got URI: ${videoUri}`)

    // Extend with next scene
    mp4Buffer = await videoService.extendVideo({
      videoUri,
      prompt: chunks[i].videoPrompt,
      duration: chunks[i].durationSeconds,
    })

    console.log(`[Video] Extended to chunk ${i + 1}, buffer size: ${mp4Buffer.length}`)

    await db
      .from('debate_sessions')
      .update({ video_progress: i + 2 }) // +2 because step 1 is screenplay
      .eq('id', sessionId)
  }

  // Step 4: Upload final video to Supabase Storage
  console.log(`[Video] Uploading final video to storage (${mp4Buffer.length} bytes)...`)
  const videoUrl = await uploadVideoToStorage(mp4Buffer, sessionId)

  // Step 5: Build timeline from chunk metadata
  const timeline = buildTimeline(chunks)

  // Step 6: Store video URL + timeline
  await db
    .from('debate_sessions')
    .update({
      video_status: 'complete',
      video_progress: totalChunks + 1,
      video_url: videoUrl,
      video_timeline: timeline,
    })
    .eq('id', sessionId)

  console.log(`[Video] Pipeline complete for ${sessionId}: ${videoUrl}`)
}
