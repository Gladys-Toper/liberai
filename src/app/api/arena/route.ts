import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createDebateSession, listDebates } from '@/lib/agents/debate-engine'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST /api/arena — Create a new debate
export async function POST(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { bookAId, bookBId, crucibleQuestion, maxRounds } = body

  if (!bookAId || !bookBId || !crucibleQuestion) {
    return NextResponse.json(
      { error: 'bookAId, bookBId, and crucibleQuestion are required' },
      { status: 400 },
    )
  }

  if (bookAId === bookBId) {
    return NextResponse.json({ error: 'Books must be different' }, { status: 400 })
  }

  try {
    const result = await createDebateSession(
      bookAId,
      bookBId,
      crucibleQuestion,
      maxRounds || 5,
      auth.userId,
    )

    // Sprint 8: Auto-create betting pool for this debate
    const db = getServiceClient()
    await db.from('pug_pools').insert({ session_id: result.session.id }).select().single()

    return NextResponse.json(result)
  } catch (err) {
    console.error('Failed to create debate:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}

// GET /api/arena — List debates
export async function GET(request: Request) {
  const url = new URL(request.url)
  const status = url.searchParams.get('status') || 'all'
  const limit = parseInt(url.searchParams.get('limit') || '20')

  try {
    const debates = await listDebates(status, limit)
    return NextResponse.json({ debates })
  } catch (err) {
    console.error('Failed to list debates:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}
