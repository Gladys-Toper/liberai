import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getUserList } from '@/lib/db/queries/admin'

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'admin')
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const search = url.searchParams.get('search') || undefined
  const role = url.searchParams.get('role') || undefined
  const page = Number(url.searchParams.get('page') || '1')
  const perPage = Number(url.searchParams.get('perPage') || '20')

  const result = await getUserList({ search, role, page, perPage })
  return NextResponse.json(result)
}
