import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  const { data: book } = await supabase
    .from('books')
    .select('id, title, description, cover_url, category, tags, ai_config, status, authors!inner(id, display_name, avatar_url)')
    .eq('id', id)
    .single()

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  // Check if embeddings exist
  const { count } = await supabase
    .from('book_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', id)

  const author = (book as any).authors
  return NextResponse.json({
    book: {
      id: book.id,
      title: book.title,
      description: book.description,
      cover_url: book.cover_url,
      category: book.category,
      tags: book.tags,
      ai_config: book.ai_config,
      status: book.status,
      authorName: author?.display_name || 'Unknown Author',
      authorId: author?.id,
      authorAvatar: author?.avatar_url,
    },
    embeddingsReady: (count || 0) > 0,
  })
}
