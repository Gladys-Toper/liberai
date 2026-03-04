import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Create a Supabase server client for use in server components and route handlers.
 */
async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

// ============================================================
// BOOKS
// ============================================================

export interface BookRow {
  id: string
  author_id: string
  title: string
  description: string | null
  cover_url: string | null
  category: string
  tags: string[]
  price: number
  total_reads: number
  total_chats: number
  average_rating: number
  featured: boolean
  published_date: string | null
  ai_config: Record<string, unknown>
  created_at: string
}

export interface AuthorRow {
  id: string
  user_id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  social_links: Record<string, string>
  total_books: number
  total_reads: number
  verified: boolean
}

export interface BookWithAuthor extends BookRow {
  authors: AuthorRow
}

export interface ChapterRow {
  id: string
  book_id: string
  chapter_number: number
  title: string
  word_count: number
  reading_time_minutes: number
}

/**
 * Get featured books with author info, ordered by reads.
 */
export async function getFeaturedBooks(limit = 6) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('books')
    .select('*, authors!inner(*)')
    .eq('featured', true)
    .order('total_reads', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getFeaturedBooks error:', error)
    return []
  }
  return data as BookWithAuthor[]
}

/**
 * Get all published books with author info, with optional filters.
 */
export async function getBooks({
  category,
  search,
  sort = 'newest',
  limit = 50,
}: {
  category?: string
  search?: string
  sort?: string
  limit?: number
} = {}) {
  const supabase = await getSupabase()
  let query = supabase
    .from('books')
    .select('*, authors!inner(*)')

  if (category) {
    query = query.ilike('category', category)
  }

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%`
    )
  }

  switch (sort) {
    case 'popular':
      query = query.order('total_reads', { ascending: false })
      break
    case 'price-asc':
      query = query.order('price', { ascending: true })
      break
    case 'price-desc':
      query = query.order('price', { ascending: false })
      break
    case 'chats':
      query = query.order('total_chats', { ascending: false })
      break
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  const { data, error } = await query.limit(limit)

  if (error) {
    console.error('getBooks error:', error)
    return []
  }
  return data as BookWithAuthor[]
}

/**
 * Get a single book by ID with author info.
 */
export async function getBook(id: string) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('books')
    .select('*, authors!inner(*)')
    .eq('id', id)
    .single()

  if (error) {
    console.error('getBook error:', error)
    return null
  }
  return data as BookWithAuthor
}

/**
 * Get chapters for a book, ordered by chapter number.
 */
export async function getChapters(bookId: string) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('chapters')
    .select('id, book_id, chapter_number, title, word_count, reading_time_minutes')
    .eq('book_id', bookId)
    .order('chapter_number', { ascending: true })

  if (error) {
    console.error('getChapters error:', error)
    return []
  }
  return data as ChapterRow[]
}

/**
 * Get all categories.
 */
export async function getCategories() {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) {
    console.error('getCategories error:', error)
    return []
  }
  return data as { id: string; name: string }[]
}

// ============================================================
// AUTHORS
// ============================================================

/**
 * Get an author by ID with aggregate stats.
 */
export async function getAuthor(id: string) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('authors')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('getAuthor error:', error)
    return null
  }
  return data as AuthorRow
}

/**
 * Get books by a specific author.
 */
export async function getBooksByAuthor(authorId: string) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('books')
    .select('*, authors!inner(*)')
    .eq('author_id', authorId)
    .order('total_reads', { ascending: false })

  if (error) {
    console.error('getBooksByAuthor error:', error)
    return []
  }
  return data as BookWithAuthor[]
}

// ============================================================
// LIBRARY & READING PROGRESS
// ============================================================

/**
 * Get the current user's library (books with reading progress).
 */
export async function getUserLibrary() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('reading_progress')
    .select(`
      progress_percent,
      last_read_at,
      epub_cfi,
      books!inner(
        id, title, cover_url, category,
        authors!inner(id, display_name, avatar_url)
      )
    `)
    .eq('user_id', user.id)
    .order('last_read_at', { ascending: false })

  if (error) {
    console.error('getUserLibrary error:', error)
    return []
  }
  return (data as unknown) as Array<{
    progress_percent: number
    last_read_at: string
    epub_cfi: string | null
    books: {
      id: string
      title: string
      cover_url: string | null
      category: string
      authors: { id: string; display_name: string; avatar_url: string | null }
    }
  }>
}

// ============================================================
// DASHBOARD (Author analytics)
// ============================================================

/**
 * Get the current authenticated user (from Supabase Auth).
 */
export async function getCurrentUser() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Get the current user's author profile.
 */
export async function getCurrentAuthor() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('authors')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) return null
  return data as AuthorRow
}

/**
 * Get author's books with stats for the dashboard.
 */
export async function getAuthorDashboardBooks(authorId: string) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('books')
    .select('id, title, total_reads, total_chats, published_date, created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getAuthorDashboardBooks error:', error)
    return []
  }
  return data
}

/**
 * Get recent conversations about an author's books.
 */
export async function getAuthorRecentConversations(authorId: string, limit = 5) {
  const supabase = await getSupabase()

  // Get the author's book IDs first
  const { data: books } = await supabase
    .from('books')
    .select('id, title')
    .eq('author_id', authorId)

  if (!books || books.length === 0) return []

  const bookIds = books.map(b => b.id)
  const bookTitleMap = Object.fromEntries(books.map(b => [b.id, b.title]))

  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, book_id, title, message_count, created_at, updated_at')
    .in('book_id', bookIds)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getAuthorRecentConversations error:', error)
    return []
  }

  return (data || []).map(conv => ({
    ...conv,
    bookTitle: bookTitleMap[conv.book_id] || 'Unknown Book',
  }))
}
