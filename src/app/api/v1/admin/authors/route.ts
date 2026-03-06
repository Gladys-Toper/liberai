import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getAuthorLeaderboard } from '@/lib/db/queries/admin'

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'admin')
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') || '10')
  const days = Number(url.searchParams.get('days') || '30')

  const authors = await getAuthorLeaderboard(limit, days)
  return NextResponse.json({ authors })
}
