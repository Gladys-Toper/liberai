// Sprint 8: Prediction Market — Betting API
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST /api/arena/[id]/bets — Place a bet
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: sessionId } = await params
  const { side, amount } = await request.json()

  if (!side || !['a', 'b'].includes(side)) {
    return NextResponse.json({ error: 'side must be "a" or "b"' }, { status: 400 })
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const db = getServiceClient()

  // Get pool for this debate
  const { data: pool } = await db
    .from('pug_pools')
    .select('id, status')
    .eq('session_id', sessionId)
    .single()

  if (!pool) {
    return NextResponse.json({ error: 'No betting pool for this debate' }, { status: 404 })
  }

  if (pool.status !== 'open') {
    return NextResponse.json({ error: `Pool is ${pool.status}, betting is closed` }, { status: 400 })
  }

  try {
    const { data: betId, error } = await db.rpc('place_pug_bet', {
      p_user_id: auth.userId,
      p_pool_id: pool.id,
      p_side: side,
      p_amount: amount,
    })

    if (error) throw new Error(error.message)

    return NextResponse.json({ betId, side, amount })
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('Insufficient balance')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    if (message.includes('duplicate key')) {
      return NextResponse.json({ error: 'You already placed a bet on this debate' }, { status: 409 })
    }
    console.error('Failed to place bet:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/arena/[id]/bets — Get pool state + user's bet
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  const { id: sessionId } = await params

  const db = getServiceClient()

  // Get pool
  const { data: pool } = await db
    .from('pug_pools')
    .select('*')
    .eq('session_id', sessionId)
    .single()

  if (!pool) {
    return NextResponse.json({ pool: null, userBet: null })
  }

  // Calculate odds
  const totalPool = (pool.pool_a || 0) + (pool.pool_b || 0)
  const oddsA = totalPool > 0 ? pool.pool_a / totalPool : 0.5
  const oddsB = totalPool > 0 ? pool.pool_b / totalPool : 0.5

  // Get user's bet if authenticated
  let userBet = null
  if (auth?.userId) {
    const { data: bet } = await db
      .from('pug_bets')
      .select('*')
      .eq('pool_id', pool.id)
      .eq('user_id', auth.userId)
      .single()
    userBet = bet
  }

  return NextResponse.json({
    pool: {
      id: pool.id,
      poolA: pool.pool_a,
      poolB: pool.pool_b,
      totalPool,
      oddsA,
      oddsB,
      status: pool.status,
      settledSide: pool.settled_side,
    },
    userBet,
  })
}
