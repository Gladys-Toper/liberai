import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface BookCostBreakdown {
  bookId: string
  bookTitle: string
  aiCost: number
  storageCost: number
  infraCost: number
  embeddingCost: number
  total: number
}

export interface BookPnL {
  bookId: string
  bookTitle: string
  price: number
  revenue: number
  orderCount: number
  costs: BookCostBreakdown
  netProfit: number
  authorShare: number
  platformShare: number
}

export interface AuthorPnL {
  authorId: string
  books: BookPnL[]
  totals: {
    revenue: number
    totalCosts: number
    netProfit: number
    authorShare: number
    platformShare: number
    costRecovery: number
  }
  splitLiberaiPct: number
}

/**
 * Get cost breakdown for a single book over the last N days.
 */
export async function getBookCostBreakdown(bookId: string, days = 30): Promise<BookCostBreakdown> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data: costs } = await db
    .from('book_costs')
    .select('cost_type, amount_usd')
    .eq('book_id', bookId)
    .gte('cost_date', since.toISOString().split('T')[0])

  const { data: book } = await db
    .from('books')
    .select('title')
    .eq('id', bookId)
    .single()

  let aiCost = 0, storageCost = 0, infraCost = 0, embeddingCost = 0
  for (const c of costs || []) {
    const amt = Number(c.amount_usd)
    if (c.cost_type === 'ai_reader_chat' || c.cost_type === 'ai_author_chat') aiCost += amt
    else if (c.cost_type === 'storage') storageCost += amt
    else if (c.cost_type === 'embeddings') embeddingCost += amt
    else if (c.cost_type === 'infra_supabase' || c.cost_type === 'infra_vercel') infraCost += amt
  }

  return {
    bookId,
    bookTitle: book?.title || 'Unknown',
    aiCost,
    storageCost,
    infraCost,
    embeddingCost,
    total: aiCost + storageCost + infraCost + embeddingCost,
  }
}

/**
 * Get P&L for a single book.
 */
export async function getBookPnL(bookId: string, days = 30): Promise<BookPnL> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const costs = await getBookCostBreakdown(bookId, days)

  const { data: book } = await db
    .from('books')
    .select('price')
    .eq('id', bookId)
    .single()

  const { data: orders } = await db
    .from('orders')
    .select('amount')
    .eq('book_id', bookId)
    .eq('status', 'completed')
    .gte('created_at', since.toISOString())

  const revenue = (orders || []).reduce((sum, o) => sum + Number(o.amount), 0)
  const orderCount = orders?.length || 0
  const profitBps = Number(process.env.LIBERAI_PROFIT_BPS) || 1000
  const profitRate = profitBps / 10000 // 0.10

  const netProfit = Math.max(0, revenue - costs.total)
  const authorShare = netProfit * (1 - profitRate)
  const platformShare = costs.total + netProfit * profitRate

  return {
    bookId,
    bookTitle: costs.bookTitle,
    price: Number(book?.price) || 0,
    revenue,
    orderCount,
    costs,
    netProfit,
    authorShare,
    platformShare,
  }
}

/**
 * Get full P&L for an author, rolled up from per-book data.
 */
export async function getAuthorPnL(authorId: string, days = 30): Promise<AuthorPnL> {
  const db = getServiceClient()

  const { data: books } = await db
    .from('books')
    .select('id')
    .eq('author_id', authorId)

  const bookPnLs: BookPnL[] = []
  for (const book of books || []) {
    bookPnLs.push(await getBookPnL(book.id, days))
  }

  const totals = bookPnLs.reduce(
    (acc, b) => ({
      revenue: acc.revenue + b.revenue,
      totalCosts: acc.totalCosts + b.costs.total,
      netProfit: acc.netProfit + b.netProfit,
      authorShare: acc.authorShare + b.authorShare,
      platformShare: acc.platformShare + b.platformShare,
      costRecovery: acc.costRecovery + b.costs.total,
    }),
    { revenue: 0, totalCosts: 0, netProfit: 0, authorShare: 0, platformShare: 0, costRecovery: 0 },
  )

  // Compute the effective LiberAi split percentage
  const splitLiberaiPct = totals.revenue > 0
    ? Math.min(50, Math.max(10, (totals.platformShare / totals.revenue) * 100))
    : 10

  return {
    authorId,
    books: bookPnLs,
    totals,
    splitLiberaiPct,
  }
}

/**
 * Get the latest author cost rollup from the DB (cached daily by cron).
 */
export async function getAuthorCostRollup(authorId: string) {
  const db = getServiceClient()
  const { data } = await db
    .from('author_cost_rollups')
    .select('*')
    .eq('author_id', authorId)
    .order('rollup_date', { ascending: false })
    .limit(1)
    .single()

  return data
}
