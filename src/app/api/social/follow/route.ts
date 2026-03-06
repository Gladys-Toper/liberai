import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getFollowStatus, createActivityEvent, createNotification } from '@/lib/db/queries/social'
import { dispatchEvent } from '@/lib/agents/event-dispatcher'

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const user = await getUser()
  const status = await getFollowStatus(user?.id ?? null, userId)
  return NextResponse.json(status)
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { followingId } = await request.json()
  if (!followingId || followingId === user.id) {
    return NextResponse.json({ error: 'Invalid followingId' }, { status: 400 })
  }

  const { error } = await db()
    .from('social_connections')
    .insert({
      id: crypto.randomUUID(),
      follower_id: user.id,
      following_id: followingId,
      created_at: new Date().toISOString(),
    })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already following' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get actor name for metadata
  const { data: actor } = await db().from('users').select('name').eq('id', user.id).single()

  // Fire-and-forget: activity event + notification + agent dispatch
  await Promise.all([
    createActivityEvent({
      actorId: user.id,
      eventType: 'new_follow',
      targetType: 'user',
      targetId: followingId,
      metadata: { actorName: actor?.name },
    }),
    createNotification({
      userId: followingId,
      type: 'new_follower',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { actorName: actor?.name },
    }),
    dispatchEvent({
      eventType: 'new_follow',
      payload: { followerId: user.id, followingId, followerName: actor?.name },
      sourceType: 'human',
      sourceId: user.id,
    }),
  ])

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { followingId } = await request.json()
  if (!followingId) {
    return NextResponse.json({ error: 'followingId required' }, { status: 400 })
  }

  await db()
    .from('social_connections')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', followingId)

  return NextResponse.json({ success: true })
}
