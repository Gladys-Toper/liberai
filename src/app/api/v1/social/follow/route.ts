import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getFollowStatus, createActivityEvent, createNotification } from '@/lib/db/queries/social'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const status = await getFollowStatus(auth.userId, userId)
  return NextResponse.json(status)
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { followingId } = await request.json()
  if (!followingId || followingId === auth.userId) {
    return NextResponse.json({ error: 'Invalid followingId' }, { status: 400 })
  }

  const { error } = await db()
    .from('social_connections')
    .insert({
      id: crypto.randomUUID(),
      follower_id: auth.userId,
      following_id: followingId,
      created_at: new Date().toISOString(),
    })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already following' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: actor } = await db().from('users').select('name').eq('id', auth.userId).single()

  await Promise.all([
    createActivityEvent({
      actorId: auth.userId,
      eventType: 'new_follow',
      targetType: 'user',
      targetId: followingId,
      metadata: { actorName: actor?.name },
    }),
    createNotification({
      userId: followingId,
      type: 'new_follower',
      actorId: auth.userId,
      targetType: 'user',
      targetId: auth.userId,
      metadata: { actorName: actor?.name },
    }),
  ])

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { followingId } = await request.json()
  if (!followingId) {
    return NextResponse.json({ error: 'followingId required' }, { status: 400 })
  }

  await db()
    .from('social_connections')
    .delete()
    .eq('follower_id', auth.userId)
    .eq('following_id', followingId)

  return NextResponse.json({ success: true })
}
