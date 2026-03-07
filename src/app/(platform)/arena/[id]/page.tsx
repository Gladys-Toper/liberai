import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
  getDebateSession,
  getDebateAxioms,
  getDebateRounds,
  getDebateArguments,
} from '@/lib/agents/debate-engine'
import { DebateArenaClient } from '@/components/arena/DebateArenaClient'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
    ?? cookieStore.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`)?.value

  if (!token) return null

  try {
    const parsed = typeof token === 'string' && token.startsWith('[')
      ? JSON.parse(token)
      : null
    const accessToken = parsed ? parsed[0] : token

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data: { user } } = await db.auth.getUser(accessToken)
    return user?.id ?? null
  } catch {
    return null
  }
}

export default async function DebateViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [session, axioms, rounds, args] = await Promise.all([
    getDebateSession(id),
    getDebateAxioms(id),
    getDebateRounds(id),
    getDebateArguments(id),
  ])

  if (!session) notFound()

  const db = getServiceClient()
  const [{ data: bookAData }, { data: bookBData }] = await Promise.all([
    db.from('books').select('id, title, cover_url, author_id').eq('id', session.book_a_id).single(),
    db.from('books').select('id, title, cover_url, author_id').eq('id', session.book_b_id).single(),
  ])

  if (!bookAData || !bookBData) notFound()

  // Get author names separately
  const authorIds = [bookAData.author_id, bookBData.author_id].filter(Boolean)
  const { data: authors } = await db
    .from('authors')
    .select('id, display_name')
    .in('id', authorIds)
  const authorMap = new Map((authors || []).map((a: { id: string; display_name: string }) => [a.id, a.display_name]))

  const bookA = {
    id: bookAData.id,
    title: bookAData.title,
    author_name: authorMap.get(bookAData.author_id) || 'Unknown',
    cover_url: bookAData.cover_url,
  }
  const bookB = {
    id: bookBData.id,
    title: bookBData.title,
    author_name: authorMap.get(bookBData.author_id) || 'Unknown',
    cover_url: bookBData.cover_url,
  }

  // Sprint 8: Fetch pool state and sponsors
  const [{ data: pool }, { data: sponsorAssignments }] = await Promise.all([
    db.from('pug_pools')
      .select('id, pool_a, pool_b, status, settled_side')
      .eq('session_id', id)
      .single(),
    db.from('debate_sponsor_assignments')
      .select('chyron_text, inserted_at_round, sponsor:arena_sponsors!debate_sponsor_assignments_sponsor_id_fkey(id, name, tagline, logo_url, tier)')
      .eq('session_id', id),
  ])

  const totalPool = pool ? (pool.pool_a || 0) + (pool.pool_b || 0) : 0

  const userId = await getCurrentUserId()
  const isOwner = userId === session.initiated_by

  const initialState = {
    session,
    bookA,
    bookB,
    axioms,
    rounds,
    arguments: args,
    // Sprint 8 additions
    modelA: session.model_a || 'gemini',
    modelB: session.model_b || 'gemini',
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
    sponsors: (sponsorAssignments || []).map((s: Record<string, unknown>) => ({
      chyronText: s.chyron_text as string | null,
      insertedAtRound: s.inserted_at_round as number | null,
      sponsor: s.sponsor as { id: string; name: string; tagline: string; logo_url?: string | null; tier: string } | null,
    })),
  }

  return <DebateArenaClient initialState={initialState} isOwner={isOwner} />
}
