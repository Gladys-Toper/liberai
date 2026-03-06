import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getBookRatings, createActivityEvent, createNotification } from '@/lib/db/queries/social'
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
  const limit = parseInt(searchParams.get('limit') || '10')
  const result = await getBookRatings(bookId, page, limit)
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bookId, rating, reviewText } = await request.json()
  if (!bookId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'bookId and rating (1-5) required' }, { status: 400 })
  }

  const client = db()

  // Upsert rating
  const { error } = await client
    .from('book_ratings')
    .upsert(
      {
        id: crypto.randomUUID(),
        user_id: user.id,
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

  // Recalculate average rating on the book
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

  // Get book info for activity/notification
  const { data: book } = await client
    .from('books')
    .select('title, author_id, authors!inner(user_id)')
    .eq('id', bookId)
    .single()

  const { data: actor } = await client.from('users').select('name').eq('id', user.id).single()

  if (book) {
    await Promise.all([
      createActivityEvent({
        actorId: user.id,
        eventType: 'new_rating',
        targetType: 'book',
        targetId: bookId,
        metadata: { bookTitle: book.title, rating, actorName: actor?.name },
      }),
      createNotification({
        userId: (book.authors as any).user_id,
        type: 'new_rating',
        actorId: user.id,
        targetType: 'book',
        targetId: bookId,
        metadata: { bookTitle: book.title, rating, actorName: actor?.name },
      }),
      dispatchEvent({
        eventType: 'new_rating',
        payload: { bookId, bookTitle: book.title, rating, reviewerName: actor?.name },
        sourceType: 'human',
        sourceId: user.id,
      }),
    ])
  }

  return NextResponse.json({ success: true })
}
