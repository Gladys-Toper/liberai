import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { createApiKey, listApiKeys, revokeApiKey } from '@/lib/auth/api-key'

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const keys = await listApiKeys(auth.userId)
  return NextResponse.json({ keys })
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { name, scope, permissions } = await request.json()

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Validate scope
  const allowedScope = scope || (auth.role === 'admin' ? 'admin' : 'author')
  if (allowedScope === 'admin' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Cannot create admin-scoped keys' }, { status: 403 })
  }

  const { rawKey, id } = await createApiKey({
    ownerId: auth.userId,
    scope: allowedScope,
    name,
    authorId: auth.authorId,
    permissions: permissions || [],
  })

  return NextResponse.json({ id, key: rawKey }, { status: 201 })
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const keyId = url.searchParams.get('id')

  if (!keyId) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const success = await revokeApiKey(keyId, auth.userId)
  if (!success) {
    return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 })
  }

  return NextResponse.json({ revoked: true })
}
