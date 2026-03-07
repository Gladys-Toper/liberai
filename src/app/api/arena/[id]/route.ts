import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import {
  getDebateSession,
  getDebateAxioms,
  getDebateRounds,
  getDebateArguments,
} from '@/lib/agents/debate-engine'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/arena/[id] — Full debate state
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const [session, axioms, rounds, args] = await Promise.all([
      getDebateSession(id),
      getDebateAxioms(id),
      getDebateRounds(id),
      getDebateArguments(id),
    ])

    if (!session) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
    }

    // Fetch book info
    const db = getServiceClient()
    const [{ data: bookAData }, { data: bookBData }] = await Promise.all([
      db.from('books').select('id, title, cover_url, author_id').eq('id', session.book_a_id).single(),
      db.from('books').select('id, title, cover_url, author_id').eq('id', session.book_b_id).single(),
    ])

    // Get author names separately
    const authorIds = [bookAData?.author_id, bookBData?.author_id].filter(Boolean)
    const { data: authors } = authorIds.length
      ? await db.from('authors').select('id, display_name, portrait_url, nationality').in('id', authorIds)
      : { data: [] }
    const authorMap = new Map((authors || []).map((a: { id: string; display_name: string; portrait_url?: string | null; nationality?: string | null }) => [a.id, a]))

    const authorA = authorMap.get(bookAData?.author_id)
    const authorB = authorMap.get(bookBData?.author_id)

    const bookA = bookAData ? {
      id: bookAData.id,
      title: bookAData.title,
      author_name: authorA?.display_name || 'Unknown',
      cover_url: bookAData.cover_url,
      portrait_url: authorA?.portrait_url || null,
      nationality: authorA?.nationality || null,
    } : null

    const bookB = bookBData ? {
      id: bookBData.id,
      title: bookBData.title,
      author_name: authorB?.display_name || 'Unknown',
      cover_url: bookBData.cover_url,
      portrait_url: authorB?.portrait_url || null,
      nationality: authorB?.nationality || null,
    } : null

    // Sprint 8: Fetch pool state for prediction market
    const { data: pool } = await db
      .from('pug_pools')
      .select('id, pool_a, pool_b, status, settled_side')
      .eq('session_id', id)
      .single()

    const totalPool = pool ? (pool.pool_a || 0) + (pool.pool_b || 0) : 0

    // Sprint 8: Fetch active sponsors for this debate
    const { data: sponsorAssignments } = await db
      .from('debate_sponsor_assignments')
      .select('chyron_text, inserted_at_round, sponsor:arena_sponsors!debate_sponsor_assignments_sponsor_id_fkey(id, name, tagline, logo_url, tier)')
      .eq('session_id', id)

    return NextResponse.json({
      session,
      bookA,
      bookB,
      axioms,
      rounds,
      arguments: args,
      // Sprint 8 additions
      modelA: session.model_a,
      modelB: session.model_b,
      pool: pool ? {
        id: pool.id,
        poolA: pool.pool_a,
        poolB: pool.pool_b,
        totalPool,
        oddsA: totalPool > 0 ? pool.pool_a / totalPool : 0.5,
        oddsB: totalPool > 0 ? pool.pool_b / totalPool : 0.5,
        status: pool.status,
        settledSide: pool.settled_side,
      } : null,
      sponsors: sponsorAssignments || [],
    })
  } catch (err) {
    console.error('Failed to get debate:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/arena/[id] — Control actions (start, pause, abandon)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { action } = await request.json()

  const db = getServiceClient()
  const session = await getDebateSession(id)

  if (!session) {
    return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
  }

  if (session.initiated_by !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const validTransitions: Record<string, string[]> = {
    start: ['setup', 'paused'],
    pause: ['active'],
    abandon: ['setup', 'extracting', 'active', 'paused'],
  }

  if (!validTransitions[action]?.includes(session.status)) {
    return NextResponse.json(
      { error: `Cannot ${action} a debate with status ${session.status}` },
      { status: 400 },
    )
  }

  const statusMap: Record<string, string> = {
    start: 'active',
    pause: 'paused',
    abandon: 'abandoned',
  }

  await db
    .from('debate_sessions')
    .update({ status: statusMap[action], updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ status: statusMap[action] })
}
