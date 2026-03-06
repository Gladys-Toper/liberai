import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface AuthorRevenueSummary {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
}

export interface BookRevenue {
  bookId: string
  bookTitle: string
  revenue: number
  orderCount: number
  price: number
}

/**
 * Get revenue summary for an author over the last N days.
 */
export async function getAuthorRevenueSummary(authorId: string, days = 30): Promise<AuthorRevenueSummary> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data: books } = await db
    .from('books')
    .select('id')
    .eq('author_id', authorId)

  if (!books || books.length === 0) {
    return { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 }
  }

  const bookIds = books.map(b => b.id)

  const { data: orders } = await db
    .from('orders')
    .select('amount')
    .in('book_id', bookIds)
    .eq('status', 'completed')
    .gte('created_at', since.toISOString())

  const totalRevenue = (orders || []).reduce((sum, o) => sum + Number(o.amount), 0)
  const totalOrders = orders?.length || 0

  return {
    totalRevenue,
    totalOrders,
    avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  }
}

/**
 * Get revenue per book for an author.
 */
export async function getAuthorRevenueByBook(authorId: string, days = 30): Promise<BookRevenue[]> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data: books } = await db
    .from('books')
    .select('id, title, price')
    .eq('author_id', authorId)

  if (!books || books.length === 0) return []

  const result: BookRevenue[] = []
  for (const book of books) {
    const { data: orders } = await db
      .from('orders')
      .select('amount')
      .eq('book_id', book.id)
      .eq('status', 'completed')
      .gte('created_at', since.toISOString())

    const revenue = (orders || []).reduce((sum, o) => sum + Number(o.amount), 0)
    result.push({
      bookId: book.id,
      bookTitle: book.title,
      revenue,
      orderCount: orders?.length || 0,
      price: Number(book.price),
    })
  }

  return result.sort((a, b) => b.revenue - a.revenue)
}
