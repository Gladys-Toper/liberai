import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getBookRatings, createActivityEvent, createNotification } from '@/lib/db/queries/social'

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
  const limit = parseInt(searchParams.get('limit') || '10')
  const result = await getBookRatings(bookId, page, limit)
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { bookId, rating, reviewText } = await request.json()
  if (!bookId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'bookId and rating (1-5) required' }, { status: 400 })
  }

  const client = db()

  const { error } = await client
    .from('book_ratings')
    .upsert(
      {
        id: crypto.randomUUID(),
        user_id: auth.userId,
        book_id: bookId,
        rating,
        review_text: reviewText || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,book_id' },
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Recalculate average
  const { data: allRatings } = await client
    .from('book_ratings')
    .select('rating')
    .eq('book_id', bookId)

  if (allRatings && allRatings.length > 0) {
    const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
    await client
      .from('books')
      .update({ average_rating: parseFloat(avg.toFixed(2)) })
      .eq('id', bookId)
  }

  const { data: book } = await client
    .from('books')
    .select('title, author_id, authors!inner(user_id)')
    .eq('id', bookId)
    .single()

  const { data: actor } = await client.from('users').select('name').eq('id', auth.userId).single()

  if (book) {
    await Promise.all([
      createActivityEvent({
        actorId: auth.userId,
        eventType: 'new_rating',
        targetType: 'book',
        targetId: bookId,
        metadata: { bookTitle: book.title, rating, actorName: actor?.name },
      }),
      createNotification({
        userId: (book.authors as any).user_id,
        type: 'new_rating',
        actorId: auth.userId,
        targetType: 'book',
        targetId: bookId,
        metadata: { bookTitle: book.title, rating, actorName: actor?.name },
      }),
    ])
  }

  return NextResponse.json({ success: true })
}
