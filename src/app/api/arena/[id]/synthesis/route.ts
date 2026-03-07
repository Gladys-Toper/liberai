import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateSynthesis, getDebateSession } from '@/lib/agents/debate-engine'

// POST /api/arena/[id]/synthesis — Trigger synthesis
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const synthesis = await generateSynthesis(id)
    return NextResponse.json({ synthesis })
  } catch (err) {
    console.error('Failed to generate synthesis:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// GET /api/arena/[id]/synthesis — Get synthesis result
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getDebateSession(id)
  if (!session) {
    return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
  }

  if (!session.synthesis) {
    return NextResponse.json({ error: 'No synthesis generated yet' }, { status: 404 })
  }

  return NextResponse.json({ synthesis: session.synthesis })
}
