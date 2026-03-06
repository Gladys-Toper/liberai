import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ============================================================
// FOLLOW
// ============================================================

export async function getFollowStatus(currentUserId: string | null, targetUserId: string) {
  const db = getServiceClient()

  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    db.from('social_connections').select('id', { count: 'exact', head: true }).eq('following_id', targetUserId),
    db.from('social_connections').select('id', { count: 'exact', head: true }).eq('follower_id', targetUserId),
  ])

  let isFollowing = false
  if (currentUserId && currentUserId !== targetUserId) {
    const { data } = await db
      .from('social_connections')
      .select('id')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetUserId)
      .single()
    isFollowing = !!data
  }

  return {
    isFollowing,
    followerCount: followerCount || 0,
    followingCount: followingCount || 0,
  }
}

// ============================================================
// RATINGS
// ============================================================

export async function getBookRatings(bookId: string, page = 1, limit = 10) {
  const db = getServiceClient()
  const offset = (page - 1) * limit

  const [{ data: ratings, count }, { data: stats }] = await Promise.all([
    db
      .from('book_ratings')
      .select('*, users!inner(id, name, avatar_url)', { count: 'exact' })
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    db
      .from('book_ratings')
      .select('rating')
      .eq('book_id', bookId),
  ])

  const total = count || 0
  const allRatings = stats || []
  const avgRating = allRatings.length > 0
    ? allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
    : 0

  // Distribution: count of each star level as Record<star, count>
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of allRatings) {
    distribution[r.rating]++
  }

  return {
    ratings: ratings || [],
    total,
    avgRating,
    distribution,
  }
}

export async function getUserRating(userId: string, bookId: string) {
  const db = getServiceClient()
  const { data } = await db
    .from('book_ratings')
    .select('*')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .single()
  return data
}

// ============================================================
// COMMENTS
// ============================================================

export async function getBookComments(bookId: string, page = 1, limit = 20) {
  const db = getServiceClient()
  const offset = (page - 1) * limit

  // Get top-level comments
  const { data: comments, count } = await db
    .from('book_comments')
    .select('*, users!inner(id, name, avatar_url)', { count: 'exact' })
    .eq('book_id', bookId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (!comments || comments.length === 0) {
    return { comments: [], total: count || 0 }
  }

  // Get replies for these comments (1 level deep)
  const parentIds = comments.map((c) => c.id)
  const { data: replies } = await db
    .from('book_comments')
    .select('*, users!inner(id, name, avatar_url)')
    .in('parent_id', parentIds)
    .order('created_at', { ascending: true })

  // Group replies by parent
  const replyMap = new Map<string, typeof replies>()
  for (const reply of replies || []) {
    const list = replyMap.get(reply.parent_id!) || []
    list.push(reply)
    replyMap.set(reply.parent_id!, list)
  }

  const commentsWithReplies = comments.map((c) => ({
    ...c,
    replies: replyMap.get(c.id) || [],
  }))

  return { comments: commentsWithReplies, total: count || 0 }
}

// ============================================================
// ACTIVITY FEED
// ============================================================

export async function getFeedForUser(userId: string, page = 1, limit = 20) {
  const db = getServiceClient()
  const offset = (page - 1) * limit

  // Get IDs of users this person follows
  const { data: connections } = await db
    .from('social_connections')
    .select('following_id')
    .eq('follower_id', userId)

  if (!connections || connections.length === 0) {
    return { items: [], hasMore: false }
  }

  const followedIds = connections.map((c) => c.following_id)

  const { data: items, count } = await db
    .from('activity_feed')
    .select('*, users!activity_feed_actor_id_fkey(id, name, avatar_url)', { count: 'exact' })
    .in('actor_id', followedIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  return {
    items: items || [],
    hasMore: (count || 0) > offset + limit,
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export async function getUnreadNotificationCount(userId: string) {
  const db = getServiceClient()
  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  return count || 0
}

export async function getNotifications(userId: string, unreadOnly = false, limit = 20) {
  const db = getServiceClient()
  let query = db
    .from('notifications')
    .select('*, actor:users!notifications_actor_id_fkey(id, name, avatar_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.eq('read', false)
  }

  const { data } = await query
  return data || []
}

// ============================================================
// HELPERS: Create activity + notification (service role)
// ============================================================

export async function createActivityEvent(params: {
  actorId: string
  eventType: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
}) {
  const db = getServiceClient()
  await db.from('activity_feed').insert({
    actor_id: params.actorId,
    event_type: params.eventType,
    target_type: params.targetType,
    target_id: params.targetId,
    metadata: params.metadata || {},
  })
}

export async function createNotification(params: {
  userId: string
  type: string
  actorId: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}) {
  const db = getServiceClient()
  // Don't notify yourself
  if (params.userId === params.actorId) return

  await db.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    actor_id: params.actorId,
    target_type: params.targetType,
    target_id: params.targetId,
    metadata: params.metadata || {},
  })
}
