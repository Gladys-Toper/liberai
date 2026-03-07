// Sprint 8: AV Studio — D-ID WebRTC session management
//
// D-ID Talks Streams flow:
//   POST /av       → create D-ID streams from author portrait URLs
//   POST /av/sdp   → relay SDP answer to D-ID
//   POST /av/ice   → relay ICE candidate to D-ID
//   POST /av/talk  → send text to D-ID for lip-synced speech
//   DELETE /av      → tear down D-ID streams

import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { DIDAdapter, SimliAdapter, getVideoBackend } from '@/lib/arena/avatar-service'
import { isAVConfigured } from '@/lib/arena/av-config'
import { getDebateSession } from '@/lib/agents/debate-engine'
import { resolveDebateAuthorProfiles } from '@/lib/arena/author-profile'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST /api/arena/[id]/av — Initialize D-ID WebRTC streams for debate avatars
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: sessionId } = await params
  const backend = getVideoBackend()

  // Check AV is configured
  if (!isAVConfigured()) {
    return NextResponse.json(
      { error: 'AV not configured — set DID_API_KEY or SIMLI_API_KEY', avEnabled: false },
      { status: 503 },
    )
  }

  // Verify debate exists
  const session = await getDebateSession(sessionId)
  if (!session) {
    return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
  }

  // Resolve author profiles (portraits + voice config)
  const db = getServiceClient()
  const [bookA, bookB] = await Promise.all([
    db.from('books').select('author_id, authors(name)').eq('id', session.book_a_id).single(),
    db.from('books').select('author_id, authors(name)').eq('id', session.book_b_id).single(),
  ])

  const authorAId = bookA.data?.author_id
  const authorBId = bookB.data?.author_id
  const authorAName = (bookA.data?.authors as unknown as { name: string } | null)?.name || 'Author A'
  const authorBName = (bookB.data?.authors as unknown as { name: string } | null)?.name || 'Author B'

  // Resolve portraits + voice profiles
  const { authorA, authorB } = await resolveDebateAuthorProfiles(
    authorAId, authorAName, authorBId, authorBName,
  )

  if (backend === 'did') {
    // D-ID: create streams using portrait URLs
    const did = new DIDAdapter()

    try {
      // Need at least one portrait for D-ID
      const hasPortraitA = !!authorA.portraitUrl
      const hasPortraitB = !!authorB.portraitUrl

      const results: Record<string, unknown> = {}

      // Create D-ID streams in parallel for authors with portraits
      const promises: Promise<void>[] = []

      if (hasPortraitA) {
        promises.push(
          did.createStream(authorA.portraitUrl!).then(creds => {
            results.debaterA = {
              streamId: creds.streamId,
              sessionId: creds.sessionId,
              iceServers: creds.iceServers,
              offer: creds.offer,
              didVoiceId: authorA.didVoiceId || 'en-GB-RyanNeural',
            }
          }),
        )
      }

      if (hasPortraitB) {
        promises.push(
          did.createStream(authorB.portraitUrl!).then(creds => {
            results.debaterB = {
              streamId: creds.streamId,
              sessionId: creds.sessionId,
              iceServers: creds.iceServers,
              offer: creds.offer,
              didVoiceId: authorB.didVoiceId || 'en-GB-RyanNeural',
            }
          }),
        )
      }

      await Promise.all(promises)

      return NextResponse.json({
        avEnabled: true,
        backend: 'did',
        sessions: results,
        profiles: {
          authorA: {
            portraitUrl: authorA.portraitUrl,
            nationality: authorA.nationality,
            era: authorA.era,
            didVoiceId: authorA.didVoiceId,
            accentHint: authorA.accentHint,
          },
          authorB: {
            portraitUrl: authorB.portraitUrl,
            nationality: authorB.nationality,
            era: authorB.era,
            didVoiceId: authorB.didVoiceId,
            accentHint: authorB.accentHint,
          },
        },
      })
    } catch (err) {
      console.error('Failed to initialize D-ID streams:', err)
      // Fall through to return profiles without video
      return NextResponse.json({
        avEnabled: false,
        backend: 'none',
        error: 'D-ID stream creation failed — using animated portrait fallback',
        profiles: {
          authorA: {
            portraitUrl: authorA.portraitUrl,
            nationality: authorA.nationality,
            era: authorA.era,
            didVoiceId: authorA.didVoiceId,
            accentHint: authorA.accentHint,
          },
          authorB: {
            portraitUrl: authorB.portraitUrl,
            nationality: authorB.nationality,
            era: authorB.era,
            didVoiceId: authorB.didVoiceId,
            accentHint: authorB.accentHint,
          },
        },
      })
    }
  }

  if (backend === 'simli') {
    // Legacy Simli path — requires pre-uploaded faceIds
    const simli = new SimliAdapter()
    const faceA = process.env.SIMLI_FACE_A
    const faceB = process.env.SIMLI_FACE_B

    if (!faceA || !faceB) {
      return NextResponse.json(
        { error: 'Simli face IDs not configured', avEnabled: false },
        { status: 503 },
      )
    }

    try {
      const [debaterA, debaterB] = await Promise.all([
        simli.startWebRTCSession(faceA),
        simli.startWebRTCSession(faceB),
      ])

      return NextResponse.json({
        avEnabled: true,
        backend: 'simli',
        sessions: {
          debaterA: {
            sessionId: debaterA.sessionId,
            streamId: debaterA.streamId,
            iceServers: debaterA.iceServers,
            offer: debaterA.offer,
          },
          debaterB: {
            sessionId: debaterB.sessionId,
            streamId: debaterB.streamId,
            iceServers: debaterB.iceServers,
            offer: debaterB.offer,
          },
        },
        profiles: {
          authorA: {
            portraitUrl: authorA.portraitUrl,
            nationality: authorA.nationality,
          },
          authorB: {
            portraitUrl: authorB.portraitUrl,
            nationality: authorB.nationality,
          },
        },
      })
    } catch (err) {
      console.error('Failed to initialize Simli sessions:', err)
      return NextResponse.json(
        { error: 'Simli session init failed', avEnabled: false },
        { status: 500 },
      )
    }
  }

  // No video backend — return profiles only (for animated portrait fallback)
  return NextResponse.json({
    avEnabled: false,
    backend: 'none',
    profiles: {
      authorA: {
        portraitUrl: authorA.portraitUrl,
        nationality: authorA.nationality,
        era: authorA.era,
        accentHint: authorA.accentHint,
      },
      authorB: {
        portraitUrl: authorB.portraitUrl,
        nationality: authorB.nationality,
        era: authorB.era,
        accentHint: authorB.accentHint,
      },
    },
  })
}

// DELETE /api/arena/[id]/av — Tear down WebRTC sessions
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await params
  const body = await request.json().catch(() => ({}))
  const backend = getVideoBackend()

  if (backend === 'did') {
    const did = new DIDAdapter()
    const streamIds: string[] = body.streamIds || []
    await Promise.allSettled(
      streamIds.map((sid: string) => did.closeStream(sid, '')),
    )
  } else if (backend === 'simli') {
    const simli = new SimliAdapter()
    const sessionIds: string[] = body.sessionIds || []
    await Promise.allSettled(
      sessionIds.map((sid: string) => simli.endSession(sid)),
    )
  }

  return NextResponse.json({ message: 'AV sessions torn down' })
}
