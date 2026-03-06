import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getAuthorDashboardBooks, getAuthorRecentConversations } from '@/lib/db/queries'
import { getAuthorRevenueSummary } from '@/lib/db/queries/revenue'
import { getAuthorPnL } from '@/lib/db/queries/costs'

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  const authorId = auth.authorId
  if (!authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const [books, conversations, revenue, pnl] = await Promise.all([
    getAuthorDashboardBooks(authorId),
    getAuthorRecentConversations(authorId),
    getAuthorRevenueSummary(authorId),
    getAuthorPnL(authorId),
  ])

  return NextResponse.json({
    authorId,
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      totalReads: b.total_reads || 0,
      totalChats: b.total_chats || 0,
      publishedDate: b.published_date,
    })),
    recentConversations: conversations.slice(0, 10),
    revenue,
    pnl: pnl.totals,
  })
}
