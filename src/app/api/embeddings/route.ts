import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chunkChapters } from '@/lib/ai/chunking'
import { generateEmbeddings } from '@/lib/ai/embeddings'

export const maxDuration = 300

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bookId } = await request.json()

  if (!bookId) {
    return NextResponse.json({ error: 'bookId required' }, { status: 400 })
  }

  // Verify the user owns this book (via author)
  const { data: book } = await supabase
    .from('books')
    .select('id, author_id, title, authors!inner(user_id)')
    .eq('id', bookId)
    .single()

  if (!book || (book as any).authors?.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Get chapters
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, title, content, chapter_number')
    .eq('book_id', bookId)
    .order('chapter_number')

  if (!chapters || chapters.length === 0) {
    return NextResponse.json({ error: 'No chapters found' }, { status: 404 })
  }

  // Update upload status to 'embedding'
  await supabase
    .from('book_uploads')
    .update({ status: 'embedding', started_at: new Date().toISOString() })
    .eq('book_id', bookId)

  try {
    // Delete existing chunks for this book (re-embedding)
    await supabase.from('book_chunks').delete().eq('book_id', bookId)

    // Chunk the chapters
    const chunks = chunkChapters(
      chapters.map((c) => ({
        title: c.title,
        content: c.content || '',
        chapterNumber: c.chapter_number,
      }))
    )

    // Update total chunks count
    await supabase
      .from('book_uploads')
      .update({ total_chunks: chunks.length })
      .eq('book_id', bookId)

    // Build chapter ID lookup
    const chapterIdMap = new Map(
      chapters.map((c) => [c.chapter_number, c.id])
    )

    // Generate embeddings in batches
    const texts = chunks.map((c) => c.content)
    const embeddings = await generateEmbeddings(texts)

    // Insert chunks with embeddings in batches of 50
    const BATCH_SIZE = 50
    let embedded = 0

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const rows = batch.map((chunk, j) => ({
        book_id: bookId,
        chapter_id: chapterIdMap.get(chunk.chapterNumber) || chapters[0].id,
        content: chunk.content,
        embedding: JSON.stringify(embeddings[i + j]),
        chunk_index: chunk.chunkIndex,
        metadata: {
          chapter_title: chunk.chapterTitle,
          chapter_number: chunk.chapterNumber,
          start_char: chunk.metadata.startChar,
          end_char: chunk.metadata.endChar,
        },
      }))

      const { error: insertError } = await supabase
        .from('book_chunks')
        .insert(rows)

      if (insertError) {
        console.error('Chunk insert error:', insertError)
        throw new Error(`Failed to insert chunks: ${insertError.message}`)
      }

      embedded += batch.length

      // Update progress
      await supabase
        .from('book_uploads')
        .update({ embedded_chunks: embedded })
        .eq('book_id', bookId)
    }

    // Mark as completed
    await supabase
      .from('book_uploads')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('book_id', bookId)

    return NextResponse.json({
      success: true,
      totalChunks: chunks.length,
      bookId,
    })
  } catch (err) {
    console.error('Embedding error:', err)

    await supabase
      .from('book_uploads')
      .update({
        status: 'failed',
        error_message:
          err instanceof Error ? err.message : 'Embedding generation failed',
      })
      .eq('book_id', bookId)

    return NextResponse.json(
      { error: 'Embedding generation failed' },
      { status: 500 }
    )
  }
}
