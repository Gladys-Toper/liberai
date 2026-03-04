import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if already an author
  const { data: existing } = await supabase
    .from('authors')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ authorId: existing.id })
  }

  const body = await request.json()
  const displayName = body.displayName?.trim() || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Author'
  const bio = body.bio?.trim() || ''

  const { data: author, error } = await supabase
    .from('authors')
    .insert({
      user_id: user.id,
      display_name: displayName,
      bio,
      avatar_url: user.user_metadata?.avatar_url || null,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ authorId: author.id })
}
