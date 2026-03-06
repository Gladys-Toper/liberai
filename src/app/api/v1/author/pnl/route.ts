import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getAuthorPnL } from '@/lib/db/queries/costs'

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  if (!auth.authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const days = Number(url.searchParams.get('days') || '30')

  const pnl = await getAuthorPnL(auth.authorId, days)
  return NextResponse.json(pnl)
}
