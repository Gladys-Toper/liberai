import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/* ── Types ─────────────────────────────────────────────── */

export interface PlatformOverview {
  totalUsers: number
  totalAuthors: number
  totalReaders: number
  newSignups7d: number
  newSignups30d: number
  totalRevenue: number
  totalOrders: number
  totalCosts: number
  netProfit: number
}

export interface TopBook {
  bookId: string
  title: string
  authorName: string
  revenue: number
  orders: number
  reads: number
  chats: number
}

export interface AuthorLeaderboardEntry {
  authorId: string
  displayName: string
  totalRevenue: number
  totalOrders: number
  bookCount: number
  totalReads: number
}

export interface RecentOrder {
  orderId: string
  userEmail: string
  bookTitle: string
  amount: number
  status: string
  costShare: number
  authorEarnings: number
  platformFee: number
  createdAt: string
}

export interface UserListItem {
  id: string
  email: string
  role: string
  createdAt: string
  orderCount: number
}

export interface AuthorListItem {
  id: string
  displayName: string
  email: string
  bookCount: number
  totalRevenue: number
  walletAddress: string | null
}

export interface PlatformPnL {
  revenue: number
  costs: { ai: number; storage: number; infra: number; embedding: number; total: number }
  netProfit: number
}

export interface RevenueTimeSeriesPoint {
  date: string
  revenue: number
  orders: number
  newUsers: number
}

/* ── Queries ───────────────────────────────────────────── */

export async function getPlatformOverview(days = 30): Promise<PlatformOverview> {
  const db = getServiceClient()
  const now = new Date()
  const since30d = new Date(now)
  since30d.setDate(since30d.getDate() - 30)
  const since7d = new Date(now)
  since7d.setDate(since7d.getDate() - 7)
  const sincePeriod = new Date(now)
  sincePeriod.setDate(sincePeriod.getDate() - days)

  const [
    { count: totalUsers },
    { count: totalAuthors },
    { count: newSignups7d },
    { count: newSignups30d },
    { data: orders },
    { data: costs },
  ] = await Promise.all([
    db.from('users').select('*', { count: 'exact', head: true }),
    db.from('authors').select('*', { count: 'exact', head: true }),
    db.from('users').select('*', { count: 'exact', head: true })
      .gte('created_at', since7d.toISOString()),
    db.from('users').select('*', { count: 'exact', head: true })
      .gte('created_at', since30d.toISOString()),
    db.from('orders').select('amount')
      .eq('status', 'completed')
      .gte('created_at', sincePeriod.toISOString()),
    db.from('book_costs').select('amount_usd')
      .gte('cost_date', sincePeriod.toISOString().split('T')[0]),
  ])

  const totalRevenue = (orders || []).reduce((sum, o) => sum + Number(o.amount), 0)
  const totalCosts = (costs || []).reduce((sum, c) => sum + Number(c.amount_usd), 0)

  return {
    totalUsers: totalUsers || 0,
    totalAuthors: totalAuthors || 0,
    totalReaders: (totalUsers || 0) - (totalAuthors || 0),
    newSignups7d: newSignups7d || 0,
    newSignups30d: newSignups30d || 0,
    totalRevenue,
    totalOrders: orders?.length || 0,
    totalCosts,
    netProfit: totalRevenue - totalCosts,
  }
}

export async function getTopBooksByRevenue(limit = 10, days = 30): Promise<TopBook[]> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data: books } = await db
    .from('books')
    .select('id, title, author_id, total_reads, total_chats')

  if (!books?.length) return []

  const { data: authors } = await db.from('authors').select('id, display_name')
  const authorMap = new Map((authors || []).map(a => [a.id, a.display_name]))

  const results: TopBook[] = []
  for (const book of books) {
    const { data: orders } = await db
      .from('orders')
      .select('amount')
      .eq('book_id', book.id)
      .eq('status', 'completed')
      .gte('created_at', since.toISOString())

    const revenue = (orders || []).reduce((sum, o) => sum + Number(o.amount), 0)
    results.push({
      bookId: book.id,
      title: book.title,
      authorName: authorMap.get(book.author_id) || 'Unknown',
      revenue,
      orders: orders?.length || 0,
      reads: book.total_reads || 0,
      chats: book.total_chats || 0,
    })
  }

  return results.sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

export async function getAuthorLeaderboard(limit = 10, days = 30): Promise<AuthorLeaderboardEntry[]> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data: authors } = await db
    .from('authors')
    .select('id, display_name')

  if (!authors?.length) return []

  const results: AuthorLeaderboardEntry[] = []
  for (const author of authors) {
    const { data: books } = await db
      .from('books')
      .select('id, total_reads')
      .eq('author_id', author.id)

    const bookIds = (books || []).map(b => b.id)
    let totalRevenue = 0
    let totalOrders = 0

    if (bookIds.length > 0) {
      const { data: orders } = await db
        .from('orders')
        .select('amount')
        .in('book_id', bookIds)
        .eq('status', 'completed')
        .gte('created_at', since.toISOString())

      totalRevenue = (orders || []).reduce((sum, o) => sum + Number(o.amount), 0)
      totalOrders = orders?.length || 0
    }

    results.push({
      authorId: author.id,
      displayName: author.display_name,
      totalRevenue,
      totalOrders,
      bookCount: books?.length || 0,
      totalReads: (books || []).reduce((sum, b) => sum + (b.total_reads || 0), 0),
    })
  }

  return results.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit)
}

export async function getRecentOrders(limit = 20): Promise<RecentOrder[]> {
  const db = getServiceClient()

  const { data: orders } = await db
    .from('orders')
    .select('id, user_id, book_id, amount, status, cost_share_usd, author_earnings_usd, platform_fee_usd, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!orders?.length) return []

  const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))]
  const bookIds = [...new Set(orders.map(o => o.book_id).filter(Boolean))]

  const [{ data: users }, { data: books }] = await Promise.all([
    userIds.length > 0
      ? db.from('users').select('id, email').in('id', userIds)
      : Promise.resolve({ data: [] }),
    bookIds.length > 0
      ? db.from('books').select('id, title').in('id', bookIds)
      : Promise.resolve({ data: [] }),
  ])

  const userMap = new Map((users || []).map(u => [u.id, u.email]))
  const bookMap = new Map((books || []).map(b => [b.id, b.title]))

  return orders.map(o => ({
    orderId: o.id,
    userEmail: userMap.get(o.user_id) || 'Unknown',
    bookTitle: bookMap.get(o.book_id) || 'Unknown',
    amount: Number(o.amount),
    status: o.status,
    costShare: Number(o.cost_share_usd || 0),
    authorEarnings: Number(o.author_earnings_usd || 0),
    platformFee: Number(o.platform_fee_usd || 0),
    createdAt: o.created_at,
  }))
}

export async function getUserList(opts: {
  search?: string
  role?: string
  page?: number
  perPage?: number
} = {}): Promise<{ users: UserListItem[]; total: number }> {
  const db = getServiceClient()
  const { search, role, page = 1, perPage = 20 } = opts
  const from = (page - 1) * perPage

  let query = db.from('users').select('id, email, role, created_at', { count: 'exact' })

  if (search) {
    query = query.ilike('email', `%${search}%`)
  }
  if (role) {
    query = query.eq('role', role)
  }

  const { data: users, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1)

  if (!users?.length) return { users: [], total: 0 }

  const userIds = users.map(u => u.id)
  const { data: orderCounts } = await db
    .from('orders')
    .select('user_id')
    .in('user_id', userIds)
    .eq('status', 'completed')

  const countMap = new Map<string, number>()
  for (const o of orderCounts || []) {
    countMap.set(o.user_id, (countMap.get(o.user_id) || 0) + 1)
  }

  return {
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      orderCount: countMap.get(u.id) || 0,
    })),
    total: count || 0,
  }
}

export async function getAuthorList(opts: {
  search?: string
  page?: number
  perPage?: number
} = {}): Promise<{ authors: AuthorListItem[]; total: number }> {
  const db = getServiceClient()
  const { search, page = 1, perPage = 20 } = opts
  const from = (page - 1) * perPage

  let query = db.from('authors').select('id, display_name, user_id, wallet_address', { count: 'exact' })

  if (search) {
    query = query.ilike('display_name', `%${search}%`)
  }

  const { data: authors, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1)

  if (!authors?.length) return { authors: [], total: 0 }

  const userIds = authors.map(a => a.user_id)
  const authorIds = authors.map(a => a.id)

  const [{ data: users }, { data: books }, { data: orders }] = await Promise.all([
    db.from('users').select('id, email').in('id', userIds),
    db.from('books').select('author_id').in('author_id', authorIds),
    db.from('orders')
      .select('book_id, amount')
      .eq('status', 'completed'),
  ])

  const emailMap = new Map((users || []).map(u => [u.id, u.email]))
  const bookCountMap = new Map<string, number>()
  for (const b of books || []) {
    bookCountMap.set(b.author_id, (bookCountMap.get(b.author_id) || 0) + 1)
  }

  // Get book→author mapping for revenue
  const { data: allBooks } = await db
    .from('books')
    .select('id, author_id')
    .in('author_id', authorIds)

  const bookAuthorMap = new Map((allBooks || []).map(b => [b.id, b.author_id]))
  const revenueMap = new Map<string, number>()
  for (const o of orders || []) {
    const authorId = bookAuthorMap.get(o.book_id)
    if (authorId) {
      revenueMap.set(authorId, (revenueMap.get(authorId) || 0) + Number(o.amount))
    }
  }

  return {
    authors: authors.map(a => ({
      id: a.id,
      displayName: a.display_name,
      email: emailMap.get(a.user_id) || '',
      bookCount: bookCountMap.get(a.id) || 0,
      totalRevenue: revenueMap.get(a.id) || 0,
      walletAddress: a.wallet_address,
    })),
    total: count || 0,
  }
}

export async function getPlatformPnL(days = 30): Promise<PlatformPnL> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [{ data: orders }, { data: costs }] = await Promise.all([
    db.from('orders').select('amount')
      .eq('status', 'completed')
      .gte('created_at', since.toISOString()),
    db.from('book_costs').select('cost_type, amount_usd')
      .gte('cost_date', since.toISOString().split('T')[0]),
  ])

  const revenue = (orders || []).reduce((sum, o) => sum + Number(o.amount), 0)

  let ai = 0, storage = 0, infra = 0, embedding = 0
  for (const c of costs || []) {
    const amt = Number(c.amount_usd)
    if (c.cost_type === 'ai_reader_chat' || c.cost_type === 'ai_author_chat') ai += amt
    else if (c.cost_type === 'storage') storage += amt
    else if (c.cost_type === 'embeddings') embedding += amt
    else if (c.cost_type === 'infra_supabase' || c.cost_type === 'infra_vercel') infra += amt
  }

  const totalCosts = ai + storage + infra + embedding

  return {
    revenue,
    costs: { ai, storage, infra, embedding, total: totalCosts },
    netProfit: revenue - totalCosts,
  }
}

export async function getRevenueTimeSeries(days = 30): Promise<RevenueTimeSeriesPoint[]> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [{ data: orders }, { data: users }] = await Promise.all([
    db.from('orders').select('amount, created_at')
      .eq('status', 'completed')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true }),
    db.from('users').select('created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true }),
  ])

  // Group by date
  const dateMap = new Map<string, { revenue: number; orders: number; newUsers: number }>()

  for (const o of orders || []) {
    const date = o.created_at.split('T')[0]
    const entry = dateMap.get(date) || { revenue: 0, orders: 0, newUsers: 0 }
    entry.revenue += Number(o.amount)
    entry.orders += 1
    dateMap.set(date, entry)
  }

  for (const u of users || []) {
    const date = u.created_at.split('T')[0]
    const entry = dateMap.get(date) || { revenue: 0, orders: 0, newUsers: 0 }
    entry.newUsers += 1
    dateMap.set(date, entry)
  }

  // Fill in missing dates
  const result: RevenueTimeSeriesPoint[] = []
  const current = new Date(since)
  const today = new Date()
  while (current <= today) {
    const dateStr = current.toISOString().split('T')[0]
    const entry = dateMap.get(dateStr) || { revenue: 0, orders: 0, newUsers: 0 }
    result.push({ date: dateStr, ...entry })
    current.setDate(current.getDate() + 1)
  }

  return result
}
