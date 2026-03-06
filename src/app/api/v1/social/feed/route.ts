import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getFeedForUser } from '@/lib/db/queries/social'

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const result = await getFeedForUser(auth.userId, page, limit)
  return NextResponse.json(result)
}
