import { NextResponse } from 'next/server'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getAuthorDashboardBooks } from '@/lib/db/queries'
import { getAuthorRevenueSummary } from '@/lib/db/queries/revenue'
import { getAuthorPnL } from '@/lib/db/queries/costs'

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  if (!auth.authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const { message } = await request.json()
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  // Gather context
  const [books, revenue, pnl] = await Promise.all([
    getAuthorDashboardBooks(auth.authorId),
    getAuthorRevenueSummary(auth.authorId),
    getAuthorPnL(auth.authorId),
  ])

  const context = `Author data:
Books: ${JSON.stringify(books.map((b) => ({ title: b.title, reads: b.total_reads, chats: b.total_chats })))}
Revenue: ${JSON.stringify(revenue)}
P&L: ${JSON.stringify(pnl.totals)}`

  const { text } = await generateText({
    model: google('gemini-3-flash-preview'),
    system: `You are an AI assistant for an author on LiberAi, a book publishing platform. Answer questions using the provided data. Be concise and data-driven.\n\n${context}`,
    prompt: message,
  })

  return NextResponse.json({ response: text })
}
