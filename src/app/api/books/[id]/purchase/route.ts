import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPaymentProvider, getSplitProvider, getChainProvider } from '@/lib/providers'

export const maxDuration = 60

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookId } = await params
  const db = getServiceDb()

  // Get book + author
  const { data: book } = await db
    .from('books')
    .select('id, title, price, author_id, authors!inner(split_contract_address, wallet_address)')
    .eq('id', bookId)
    .single()

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  const price = Number(book.price)
  const author = book.authors as any

  // Free book
  if (price === 0) {
    return NextResponse.json({ free: true, readUrl: `/book/${bookId}/read` })
  }

  // Check if user is authenticated
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Login required to purchase' }, { status: 401 })
  }

  // Check if user is the author
  const { data: authorProfile } = await db
    .from('authors')
    .select('id')
    .eq('user_id', user.id)
    .eq('id', book.author_id)
    .single()

  if (authorProfile) {
    return NextResponse.json({ author: true, readUrl: `/book/${bookId}/read` })
  }

  // Check if already purchased
  const { data: existingOrder } = await db
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('book_id', bookId)
    .eq('status', 'completed')
    .limit(1)
    .single()

  if (existingOrder) {
    return NextResponse.json({ purchased: true, readUrl: `/book/${bookId}/read` })
  }

  // Validate author has wallet setup
  if (!author.split_contract_address) {
    return NextResponse.json(
      { error: 'Author has not configured payments yet' },
      { status: 503 },
    )
  }

  // Check for payment proof in request
  const paymentProvider = getPaymentProvider()
  const verification = await paymentProvider.verifyPayment(request)

  if (!verification.valid) {
    // No valid payment — return 402 with payment requirements
    const requirements = paymentProvider.createPaymentRequest(
      price,
      author.split_contract_address,
      `Purchase "${book.title}" on LiberAi`,
    )

    return NextResponse.json(requirements, {
      status: 402,
      headers: {
        'X-Payment-Requirements': JSON.stringify(requirements),
      },
    })
  }

  // Payment verified — settle and record
  try {
    const settlement = await paymentProvider.settlePayment(verification)

    // Distribute funds via split contract
    const splitProvider = getSplitProvider()
    const chain = getChainProvider()
    try {
      await splitProvider.distribute(author.split_contract_address, chain.usdcAddress)
    } catch (e) {
      console.error('Split distribution failed (funds safe in contract):', e)
    }

    // Compute cost share from latest book costs
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: costs } = await db
      .from('book_costs')
      .select('amount_usd')
      .eq('book_id', bookId)
      .gte('cost_date', thirtyDaysAgo.toISOString().split('T')[0])

    const totalCosts = (costs || []).reduce((s, c) => s + Number(c.amount_usd), 0)
    const { data: orderCount } = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('book_id', bookId)
      .eq('status', 'completed')

    // Amortize costs across expected orders (minimum 1)
    const expectedOrders = Math.max(1, (orderCount as any)?.count || 1)
    const costShareUsd = totalCosts / expectedOrders

    const profitBps = Number(process.env.LIBERAI_PROFIT_BPS) || 1000
    const profitRate = profitBps / 10000
    const netProfit = Math.max(0, price - costShareUsd)
    const authorEarnings = netProfit * (1 - profitRate)
    const platformFee = costShareUsd + netProfit * profitRate

    // Record order
    await db.from('orders').insert({
      user_id: user.id,
      book_id: bookId,
      amount: price,
      currency: 'USDC',
      status: 'completed',
      payment_tx_hash: settlement.txHash,
      payment_method: 'x402',
      cost_share_usd: costShareUsd,
      author_earnings_usd: authorEarnings,
      platform_fee_usd: platformFee,
    })

    return NextResponse.json({
      success: true,
      txHash: settlement.txHash,
      readUrl: `/book/${bookId}/read`,
    })
  } catch (error) {
    console.error('Purchase settlement failed:', error)
    return NextResponse.json(
      { error: 'Payment settlement failed' },
      { status: 500 },
    )
  }
}
