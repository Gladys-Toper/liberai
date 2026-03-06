import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getRecentOrders } from '@/lib/db/queries/admin'

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'admin')
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') || '20')

  const orders = await getRecentOrders(limit)
  return NextResponse.json({ orders })
}
