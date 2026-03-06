import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getNotifications, getUnreadNotificationCount } from '@/lib/db/queries/social'

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(request.url)

  if (searchParams.get('countOnly') === 'true') {
    const count = await getUnreadNotificationCount(auth.userId)
    return NextResponse.json({ count })
  }

  const unreadOnly = searchParams.get('unreadOnly') === 'true'
  const limit = parseInt(searchParams.get('limit') || '20')
  const notifications = await getNotifications(auth.userId, unreadOnly, limit)
  return NextResponse.json({ notifications })
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { notificationIds } = await request.json()

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
    await db
      .from('notifications')
      .update({ read: true })
      .in('id', notificationIds)
      .eq('user_id', auth.userId)
  } else {
    await db
      .from('notifications')
      .update({ read: true })
      .eq('user_id', auth.userId)
      .eq('read', false)
  }

  return NextResponse.json({ success: true })
}
