import { NextResponse } from 'next/server'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getPlatformOverview, getPlatformPnL, getTopBooksByRevenue, getAuthorLeaderboard } from '@/lib/db/queries/admin'

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'admin')
  if (auth instanceof Response) return auth

  const { message } = await request.json()
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const [overview, pnl, topBooks, topAuthors] = await Promise.all([
    getPlatformOverview(30),
    getPlatformPnL(30),
    getTopBooksByRevenue(5, 30),
    getAuthorLeaderboard(5, 30),
  ])

  const context = `Platform data (30d):
Overview: ${JSON.stringify(overview)}
P&L: ${JSON.stringify(pnl)}
Top books: ${JSON.stringify(topBooks)}
Top authors: ${JSON.stringify(topAuthors)}`

  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    system: `You are LiberAi's admin intelligence assistant with platform-wide data access. Be concise and data-driven.\n\n${context}`,
    prompt: message,
  })

  return NextResponse.json({ response: text })
}
