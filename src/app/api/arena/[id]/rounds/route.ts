import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { executeRound, getDebateRounds, getDebateSession, type AVSessionIds } from '@/lib/agents/debate-engine'

// POST /api/arena/[id]/rounds — Execute next round
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const session = await getDebateSession(id)
  if (!session) {
    return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
  }

  if (session.initiated_by !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (session.status !== 'active') {
    return NextResponse.json(
      { error: `Debate is ${session.status}, not active` },
      { status: 400 },
    )
  }

  // Sprint 8: Accept AV session IDs from frontend for live avatar streaming
  let avSessions: AVSessionIds | null = null
  try {
    const body = await request.json()
    if (body.avSessions) {
      avSessions = body.avSessions as AVSessionIds
    }
  } catch {
    // No body or not JSON — run without AV (text-only mode)
  }

  try {
    const round = await executeRound(id, avSessions)
    return NextResponse.json({ round })
  } catch (err) {
    console.error('Failed to execute round:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// GET /api/arena/[id]/rounds — List rounds
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const rounds = await getDebateRounds(id)
    return NextResponse.json({ rounds })
  } catch (err) {
    console.error('Failed to get rounds:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
