import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getBookComments, createActivityEvent, createNotification } from '@/lib/db/queries/social'
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
  const bookId = searchParams.get('bookId')
  if (!bookId) {
    return NextResponse.json({ error: 'bookId required' }, { status: 400 })
  }

  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const result = await getBookComments(bookId, page, limit)
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bookId, content, parentId } = await request.json()
  if (!bookId || !content || content.trim().length === 0) {
    return NextResponse.json({ error: 'bookId and content required' }, { status: 400 })
  }

  if (content.length > 2000) {
    return NextResponse.json({ error: 'Comment too long (max 2000 chars)' }, { status: 400 })
  }

  const client = db()
  const now = new Date().toISOString()

  const { data: comment, error } = await client
    .from('book_comments')
    .insert({
      book_id: bookId,
      user_id: user.id,
      parent_id: parentId || null,
      content: content.trim(),
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get book info + actor name
  const [{ data: book }, { data: actor }] = await Promise.all([
    client.from('books').select('title, author_id, authors!inner(user_id)').eq('id', bookId).single(),
    client.from('users').select('name').eq('id', user.id).single(),
  ])

  if (book) {
    const promises: Promise<void>[] = [
      createActivityEvent({
        actorId: user.id,
        eventType: 'new_comment',
        targetType: 'book',
        targetId: bookId,
        metadata: { bookTitle: book.title, snippet: content.slice(0, 100), actorName: actor?.name },
      }),
    ]

    if (parentId) {
      // Notify parent commenter
      const { data: parentComment } = await client.from('book_comments').select('user_id').eq('id', parentId).single()
      if (parentComment) {
        promises.push(
          createNotification({
            userId: parentComment.user_id,
            type: 'new_comment',
            actorId: user.id,
            targetType: 'book',
            targetId: bookId,
            metadata: { bookTitle: book.title, snippet: content.slice(0, 100), actorName: actor?.name, isReply: true },
          }),
        )
      }
    } else {
      // Notify author
      promises.push(
        createNotification({
          userId: (book.authors as any).user_id,
          type: 'new_comment',
          actorId: user.id,
          targetType: 'book',
          targetId: bookId,
          metadata: { bookTitle: book.title, snippet: content.slice(0, 100), actorName: actor?.name },
        }),
      )
    }

    promises.push(
      dispatchEvent({
        eventType: 'new_comment',
        payload: { bookId, bookTitle: book.title, snippet: content.slice(0, 100), commenterName: actor?.name },
        sourceType: 'human',
        sourceId: user.id,
      }),
    )

    await Promise.all(promises)
  }

  return NextResponse.json(comment)
}

export async function DELETE(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { commentId } = await request.json()
  if (!commentId) {
    return NextResponse.json({ error: 'commentId required' }, { status: 400 })
  }

  const client = db()

  // Verify ownership
  const { data: comment } = await client
    .from('book_comments')
    .select('user_id')
    .eq('id', commentId)
    .single()

  if (!comment || comment.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 })
  }

  await client.from('book_comments').delete().eq('id', commentId)
  return NextResponse.json({ success: true })
}
