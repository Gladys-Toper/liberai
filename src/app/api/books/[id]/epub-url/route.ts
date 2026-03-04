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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find the upload record for this book to get the storage path
  const { data: upload } = await supabase
    .from('book_uploads')
    .select('file_path')
    .eq('book_id', id)
    .single()

  if (!upload) {
    return NextResponse.json({ error: 'Book file not found' }, { status: 404 })
  }

  // Generate a signed URL (valid for 1 hour)
  const { data: signedUrl, error } = await supabase.storage
    .from('book-files')
    .createSignedUrl(upload.file_path, 3600)

  if (error || !signedUrl) {
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    )
  }

  return NextResponse.json({ url: signedUrl.signedUrl })
}
