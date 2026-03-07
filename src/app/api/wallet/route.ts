// Sprint 8: PUG Wallet API
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/wallet — Get user's wallet balance
export async function GET(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  const { data: wallet } = await db
    .from('pug_wallets')
    .select('*')
    .eq('user_id', auth.userId)
    .single()

  if (!wallet) {
    // Wallet doesn't exist yet — return default state (will be created on first bet)
    return NextResponse.json({
      balance: 1000,
      totalEarned: 1000,
      totalWagered: 0,
      totalWon: 0,
      isNew: true,
    })
  }

  return NextResponse.json({
    balance: wallet.balance,
    totalEarned: wallet.total_earned,
    totalWagered: wallet.total_wagered,
    totalWon: wallet.total_won,
    isNew: false,
  })
}

// POST /api/wallet — Wallet actions (claim_bonus, etc.)
export async function POST(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action } = await request.json()

  if (action === 'claim_bonus') {
    const db = getServiceClient()

    // Check if wallet already exists (bonus already claimed)
    const { data: existing } = await db
      .from('pug_wallets')
      .select('id')
      .eq('user_id', auth.userId)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Signup bonus already claimed' }, { status: 400 })
    }

    // Create wallet with default signup bonus (1000 PUG)
    const { error } = await db
      .from('pug_wallets')
      .insert({ user_id: auth.userId })

    if (error) {
      console.error('Failed to create wallet:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ balance: 1000, message: 'Signup bonus of 1000 $PUG credited!' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
