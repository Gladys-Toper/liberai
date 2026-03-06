import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSplitProvider, getChainProvider } from '@/lib/providers'
import { getAuthorPnL } from '@/lib/db/queries/costs'

function getServiceDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getAuthUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch { /* server component */ }
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * GET /api/author/settings — get author profile + cost rollup + per-book P&L
 */
export async function GET() {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceDb()

  const { data: author } = await db
    .from('authors')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!author) {
    return NextResponse.json({ error: 'Author profile not found' }, { status: 404 })
  }

  // Get P&L data
  let pnl = null
  try {
    pnl = await getAuthorPnL(author.id)
  } catch (e) {
    console.error('Failed to fetch author P&L:', e)
  }

  const chain = getChainProvider()

  return NextResponse.json({
    author: {
      id: author.id,
      display_name: author.display_name,
      bio: author.bio,
      avatar_url: author.avatar_url,
      wallet_address: author.wallet_address,
      split_contract_address: author.split_contract_address,
      split_explorer_url: author.split_contract_address
        ? chain.explorerUrl(author.split_contract_address)
        : null,
    },
    pnl,
  })
}

/**
 * PATCH /api/author/settings — update wallet, display_name, bio
 */
export async function PATCH(request: Request) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceDb()
  const body = await request.json()

  const { data: author } = await db
    .from('authors')
    .select('id, wallet_address, split_contract_address')
    .eq('user_id', user.id)
    .single()

  if (!author) {
    return NextResponse.json({ error: 'Author profile not found' }, { status: 404 })
  }

  // Build update payload
  const updates: Record<string, unknown> = {}

  if (body.display_name !== undefined) {
    updates.display_name = body.display_name
  }
  if (body.bio !== undefined) {
    updates.bio = body.bio
  }

  // Wallet address update — triggers split contract creation
  if (body.wallet_address !== undefined) {
    const walletAddress = body.wallet_address as string

    // Validate format
    if (walletAddress && !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format. Must be a valid Ethereum address (0x...)' },
        { status: 400 },
      )
    }

    updates.wallet_address = walletAddress || null

    // Create or update split contract if wallet is set
    if (walletAddress && process.env.SERVER_WALLET_PRIVATE_KEY && process.env.PLATFORM_WALLET_ADDRESS) {
      try {
        const splitProvider = getSplitProvider()
        const platformWallet = process.env.PLATFORM_WALLET_ADDRESS

        // Default split: 90% author / 10% platform
        const recipients = [
          { address: platformWallet, percentAllocation: 1000 },  // 10%
          { address: walletAddress, percentAllocation: 9000 },   // 90%
        ]

        if (!author.split_contract_address) {
          // Create new split contract
          const serverWallet = process.env.PLATFORM_WALLET_ADDRESS
          const result = await splitProvider.createSplit(recipients, serverWallet)
          updates.split_contract_address = result.address
        } else {
          // Update existing split contract
          await splitProvider.updateSplit(author.split_contract_address, recipients)
        }
      } catch (e) {
        console.error('Split contract operation failed:', e)
        // Still save the wallet address even if split creation fails
        // The cron job will retry later
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error: updateErr } = await db
    .from('authors')
    .update(updates)
    .eq('id', author.id)

  if (updateErr) {
    return NextResponse.json(
      { error: `Update failed: ${updateErr.message}` },
      { status: 500 },
    )
  }

  const chain = getChainProvider()
  const splitAddress = (updates.split_contract_address || author.split_contract_address) as string | null

  return NextResponse.json({
    success: true,
    split_contract_address: splitAddress,
    split_explorer_url: splitAddress ? chain.explorerUrl(splitAddress) : null,
  })
}
