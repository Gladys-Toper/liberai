import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/resolve-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  if (!auth.authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const { id } = await params
  const db = getServiceClient()

  const { data: book, error } = await db
    .from('books')
    .select('*, chapters(*)')
    .eq('id', id)
    .eq('author_id', auth.authorId)
    .single()

  if (error || !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  return NextResponse.json({ book })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request, 'author')
  if (auth instanceof Response) return auth

  if (!auth.authorId) {
    return NextResponse.json({ error: 'No author profile found' }, { status: 404 })
  }

  const { id } = await params
  const db = getServiceClient()

  // Verify ownership
  const { data: existing } = await db
    .from('books')
    .select('id')
    .eq('id', id)
    .eq('author_id', auth.authorId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  const body = await request.json()
  const { title, description, category, price, tags, aiConfig, chapters } = body

  // Update book metadata
  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (category !== undefined) updates.category = category
  if (price !== undefined) updates.price = price
  if (tags !== undefined) updates.tags = tags
  if (aiConfig !== undefined) updates.ai_config = aiConfig

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await db
      .from('books')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  // Update chapters if provided (replace all)
  if (chapters?.length) {
    // Delete existing chapters
    await db.from('chapters').delete().eq('book_id', id)

    // Insert new chapters
    const chapterRows = chapters.map(
      (ch: { title: string; content: string }, idx: number) => ({
        id: crypto.randomUUID(),
        book_id: id,
        chapter_number: idx + 1,
        title: ch.title || `Chapter ${idx + 1}`,
        content: ch.content || '',
        word_count: (ch.content || '').split(/\s+/).filter(Boolean).length,
        reading_time_minutes: Math.ceil(
          (ch.content || '').split(/\s+/).filter(Boolean).length / 250,
        ),
      }),
    )

    const { error: chapterError } = await db.from('chapters').insert(chapterRows)
    if (chapterError) {
      return NextResponse.json({ error: chapterError.message }, { status: 500 })
    }

    // Delete existing embeddings so they can be re-generated
    await db.from('book_chunks').delete().eq('book_id', id)

    // Trigger re-embedding (async — embeddings will be regenerated on next access)
    // In Sprint 6, this will be a background job
  }

  // Fetch updated book
  const { data: updated } = await db
    .from('books')
    .select('id, title, description, category, price, tags')
    .eq('id', id)
    .single()

  return NextResponse.json({
    book: updated,
    chaptersUpdated: !!chapters?.length,
    reEmbeddingRequired: !!chapters?.length,
  })
}
