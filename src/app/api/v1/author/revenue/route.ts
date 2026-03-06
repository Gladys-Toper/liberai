import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getAuthorRevenueSummary, getAuthorRevenueByBook } from '@/lib/db/queries/revenue'

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  if (!auth.authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const days = Number(url.searchParams.get('days') || '30')

  const [summary, bookRevenues] = await Promise.all([
    getAuthorRevenueSummary(auth.authorId, days),
    getAuthorRevenueByBook(auth.authorId, days),
  ])

  return NextResponse.json({ summary, books: bookRevenues, period: `${days}d` })
}
