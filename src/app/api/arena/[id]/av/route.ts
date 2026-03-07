// Sprint 8: AV Studio — WebRTC session management
import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { SimliAdapter } from '@/lib/arena/avatar-service'
import { AV_PROFILES, isAVConfigured } from '@/lib/arena/av-config'
import { getDebateSession } from '@/lib/agents/debate-engine'

// POST /api/arena/[id]/av — Initialize WebRTC sessions for all avatars
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: sessionId } = await params

  // Check AV is configured
  if (!isAVConfigured()) {
    return NextResponse.json(
      { error: 'AV not configured — missing API keys or face/voice IDs', avEnabled: false },
      { status: 503 },
    )
  }

  // Verify debate exists and is active
  const session = await getDebateSession(sessionId)
  if (!session) {
    return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
  }

  const simli = new SimliAdapter()

  try {
    // Start WebRTC sessions for all 3 avatars in parallel
    const [debaterA, debaterB, commentator] = await Promise.all([
      simli.startWebRTCSession(AV_PROFILES.debater_a.faceId),
      simli.startWebRTCSession(AV_PROFILES.debater_b.faceId),
      simli.startWebRTCSession(AV_PROFILES.commentator.faceId),
    ])

    return NextResponse.json({
      avEnabled: true,
      sessions: {
        debaterA: {
          sessionId: debaterA.sessionId,
          iceServers: debaterA.iceServers,
          offer: debaterA.offer,
        },
        debaterB: {
          sessionId: debaterB.sessionId,
          iceServers: debaterB.iceServers,
          offer: debaterB.offer,
        },
        commentator: {
          sessionId: commentator.sessionId,
          iceServers: commentator.iceServers,
          offer: commentator.offer,
        },
      },
    })
  } catch (err) {
    console.error('Failed to initialize AV sessions:', err)
    return NextResponse.json(
      { error: 'Failed to initialize AV sessions', avEnabled: false },
      { status: 500 },
    )
  }
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

  await params // consume params

  const body = await request.json().catch(() => ({}))
  const sessionIds: string[] = body.sessionIds || []

  if (sessionIds.length === 0) {
    return NextResponse.json({ message: 'No sessions to tear down' })
  }

  const simli = new SimliAdapter()

  // Best-effort cleanup — don't fail if some sessions can't be ended
  await Promise.allSettled(
    sessionIds.map((sid: string) => simli.endSession(sid)),
  )

  return NextResponse.json({ message: 'AV sessions torn down' })
}
