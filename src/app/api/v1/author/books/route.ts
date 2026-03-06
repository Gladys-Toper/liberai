import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/resolve-auth'
import { getAuthorDashboardBooks } from '@/lib/db/queries'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  if (!auth.authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const books = await getAuthorDashboardBooks(auth.authorId)
  return NextResponse.json({ books })
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  if (!auth.authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const body = await request.json()
  const { title, description, category, price, tags, aiConfig, chapters } = body

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Create book
  const { data: book, error: bookError } = await db
    .from('books')
    .insert({
      id: crypto.randomUUID(),
      author_id: auth.authorId,
      title,
      description: description || null,
      category: category || 'general',
      price: price || 0,
      tags: tags || [],
      ai_config: aiConfig || {},
      published_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select('id, title')
    .single()

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 500 })
  }

  // Create chapters if provided
  if (chapters?.length) {
    const chapterRows = chapters.map(
      (ch: { title: string; content: string }, idx: number) => ({
        id: crypto.randomUUID(),
        book_id: book.id,
        chapter_number: idx + 1,
        title: ch.title || `Chapter ${idx + 1}`,
        content: ch.content || '',
        word_count: (ch.content || '').split(/\s+/).filter(Boolean).length,
        reading_time_minutes: Math.ceil(
          (ch.content || '').split(/\s+/).filter(Boolean).length / 250,
        ),
      }),
    )

    await db.from('chapters').insert(chapterRows)
  }

  // Update author book count
  try {
    await db.rpc('increment_author_books', { author_id_input: auth.authorId })
  } catch {
    // RPC may not exist — ignore
  }

  return NextResponse.json({ book }, { status: 201 })
}
