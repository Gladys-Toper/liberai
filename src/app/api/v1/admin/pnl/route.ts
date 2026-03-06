import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getPlatformPnL } from '@/lib/db/queries/admin'

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'admin')
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const days = Number(url.searchParams.get('days') || '30')

  const pnl = await getPlatformPnL(days)
  return NextResponse.json(pnl)
}
