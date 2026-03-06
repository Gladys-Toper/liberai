import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { parseEpub } from '@/lib/upload/parser'

export const maxDuration = 60

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
            // Ignored in server component context
          }
        },
      },
    }
  )

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string | null
    const description = formData.get('description') as string | null
    const genre = formData.get('genre') as string | null
    const priceStr = formData.get('price') as string | null
    const price = priceStr ? parseFloat(priceStr) : 0

    if (isNaN(price) || price < 0) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const validTypes = [
      'application/epub+zip',
      'application/epub',
    ]
    if (!validTypes.includes(file.type) && !file.name.endsWith('.epub')) {
      return NextResponse.json(
        { error: 'Only EPUB files are supported' },
        { status: 400 }
      )
    }

    // Ensure author profile exists
    let { data: author } = await supabase
      .from('authors')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!author) {
      const { data: newAuthor, error: authorErr } = await supabase
        .from('authors')
        .insert({
          user_id: user.id,
          display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Author',
          bio: '',
        })
        .select('id')
        .single()

      if (authorErr) {
        return NextResponse.json(
          { error: 'Failed to create author profile' },
          { status: 500 }
        )
      }
      author = newAuthor
    }

    // Upload file to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const fileName = `${user.id}/${Date.now()}-${file.name}`

    const { error: uploadErr } = await supabase.storage
      .from('book-files')
      .upload(fileName, fileBuffer, {
        contentType: file.type || 'application/epub+zip',
        upsert: false,
      })

    if (uploadErr) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadErr.message}` },
        { status: 500 }
      )
    }

    // Create book_uploads tracking record
    const { data: upload, error: trackErr } = await supabase
      .from('book_uploads')
      .insert({
        author_id: author.id,
        file_name: file.name,
        file_size_bytes: file.size,
        file_type: 'epub',
        file_path: fileName,
        status: 'parsing',
      })
      .select('id')
      .single()

    if (trackErr) {
      console.error('Failed to track upload:', trackErr)
    }

    // Parse EPUB
    let parsed
    try {
      parsed = await parseEpub(fileBuffer)
    } catch (parseErr) {
      // Update upload status to failed
      if (upload) {
        await supabase
          .from('book_uploads')
          .update({ status: 'failed', error_message: 'EPUB parsing failed' })
          .eq('id', upload.id)
      }
      return NextResponse.json(
        { error: 'Failed to parse EPUB file' },
        { status: 422 }
      )
    }

    // Calculate totals
    const totalWords = parsed.chapters.reduce((sum, ch) => sum + ch.wordCount, 0)
    const readingTime = Math.ceil(totalWords / 250)

    // Upload cover image if extracted
    let coverUrl: string | null = null
    if (parsed.coverImage) {
      const coverPath = `${user.id}/${Date.now()}-cover.jpg`
      const { error: coverErr } = await supabase.storage
        .from('book-covers')
        .upload(coverPath, parsed.coverImage, {
          contentType: parsed.coverMimeType || 'image/jpeg',
          upsert: false,
        })

      if (!coverErr) {
        const { data: publicUrl } = supabase.storage
          .from('book-covers')
          .getPublicUrl(coverPath)
        coverUrl = publicUrl.publicUrl
      }
    }

    // Create book record
    const { data: book, error: bookErr } = await supabase
      .from('books')
      .insert({
        author_id: author.id,
        title: title || parsed.title,
        description: description || parsed.description || '',
        category: genre || 'General',
        cover_url: coverUrl,
        language: parsed.language,
        word_count: totalWords,
        page_count: Math.ceil(totalWords / 250),
        price,
        status: 'draft',
        source_file_type: 'epub',
        ai_config: {
          model: 'claude',
          system_prompt: null,
          temperature: 0.7,
          max_context_chunks: 5,
        },
      })
      .select('id')
      .single()

    if (bookErr) {
      if (upload) {
        await supabase
          .from('book_uploads')
          .update({ status: 'failed', error_message: bookErr.message })
          .eq('id', upload.id)
      }
      return NextResponse.json(
        { error: `Failed to create book: ${bookErr.message}` },
        { status: 500 }
      )
    }

    // Insert chapters
    const chapterRows = parsed.chapters.map((ch) => ({
      book_id: book.id,
      title: ch.title,
      content: ch.content,
      chapter_number: ch.chapterNumber,
      word_count: ch.wordCount,
    }))

    const { error: chapterErr } = await supabase
      .from('chapters')
      .insert(chapterRows)

    if (chapterErr) {
      console.error('Failed to insert chapters:', chapterErr)
    }

    // Update upload status
    if (upload) {
      await supabase
        .from('book_uploads')
        .update({
          book_id: book.id,
          status: 'chunking', // Next step is embedding generation
        })
        .eq('id', upload.id)
    }

    return NextResponse.json({
      bookId: book.id,
      title: title || parsed.title,
      chapters: parsed.chapters.length,
      wordCount: totalWords,
      readingTime,
    })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
