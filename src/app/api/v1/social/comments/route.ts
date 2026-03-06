import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getBookComments, createActivityEvent, createNotification } from '@/lib/db/queries/social'

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
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

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
      user_id: auth.userId,
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

  const [{ data: book }, { data: actor }] = await Promise.all([
    client.from('books').select('title, author_id, authors!inner(user_id)').eq('id', bookId).single(),
    client.from('users').select('name').eq('id', auth.userId).single(),
  ])

  if (book) {
    const promises: Promise<void>[] = [
      createActivityEvent({
        actorId: auth.userId,
        eventType: 'new_comment',
        targetType: 'book',
        targetId: bookId,
        metadata: { bookTitle: book.title, snippet: content.slice(0, 100), actorName: actor?.name },
      }),
    ]

    if (parentId) {
      const { data: parentComment } = await client.from('book_comments').select('user_id').eq('id', parentId).single()
      if (parentComment) {
        promises.push(
          createNotification({
            userId: parentComment.user_id,
            type: 'new_comment',
            actorId: auth.userId,
            targetType: 'book',
            targetId: bookId,
            metadata: { bookTitle: book.title, snippet: content.slice(0, 100), actorName: actor?.name, isReply: true },
          }),
        )
      }
    } else {
      promises.push(
        createNotification({
          userId: (book.authors as any).user_id,
          type: 'new_comment',
          actorId: auth.userId,
          targetType: 'book',
          targetId: bookId,
          metadata: { bookTitle: book.title, snippet: content.slice(0, 100), actorName: actor?.name },
        }),
      )
    }

    await Promise.all(promises)
  }

  return NextResponse.json(comment)
}
