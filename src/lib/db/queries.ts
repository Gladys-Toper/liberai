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

// ============================================================
// BOOK INTERACTIONS (Author dashboard — per-book detail)
// ============================================================

export interface ConversationWithMessages {
  id: string
  book_id: string
  title: string
  message_count: number
  session_id: string | null
  last_message_at: string | null
  created_at: string
  messages: ChatMessageRow[]
}

export interface ChatMessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  cited_chunk_ids: string[]
  created_at: string
}

/**
 * Get conversations for a specific book with their messages, for the interactions dashboard.
 */
export async function getBookConversations(bookId: string, limit = 50) {
  const supabase = await getSupabase()

  const { data: conversations, error } = await supabase
    .from('chat_conversations')
    .select('id, book_id, title, message_count, session_id, last_message_at, created_at')
    .eq('book_id', bookId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    console.error('getBookConversations error:', error)
    return []
  }

  if (!conversations || conversations.length === 0) return []

  // Fetch messages for all conversations
  const convIds = conversations.map(c => c.id)
  const { data: messages, error: msgError } = await supabase
    .from('chat_messages')
    .select('id, conversation_id, role, content, model_used, input_tokens, output_tokens, cited_chunk_ids, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true })

  if (msgError) {
    console.error('getBookConversations messages error:', msgError)
  }

  const messagesByConv = new Map<string, ChatMessageRow[]>()
  for (const msg of (messages || [])) {
    const list = messagesByConv.get(msg.conversation_id) || []
    list.push(msg as ChatMessageRow)
    messagesByConv.set(msg.conversation_id, list)
  }

  return conversations.map(conv => ({
    ...conv,
    messages: messagesByConv.get(conv.id) || [],
  })) as ConversationWithMessages[]
}

/**
 * Get interaction stats for a specific book: total conversations, messages, top questions, most-cited chunks.
 */
export async function getBookInteractionStats(bookId: string) {
  const supabase = await getSupabase()

  // Total conversations
  const { count: totalConversations } = await supabase
    .from('chat_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId)

  // Total messages (join via conversations)
  const { data: convIds } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('book_id', bookId)

  let totalMessages = 0
  let totalUserMessages = 0
  let totalAssistantMessages = 0
  const questionCounts = new Map<string, number>()
  const chunkCitationCounts = new Map<string, number>()

  if (convIds && convIds.length > 0) {
    const ids = convIds.map(c => c.id)
    const { data: allMessages } = await supabase
      .from('chat_messages')
      .select('role, content, cited_chunk_ids')
      .in('conversation_id', ids)

    if (allMessages) {
      totalMessages = allMessages.length
      for (const msg of allMessages) {
        if (msg.role === 'user') {
          totalUserMessages++
          // Track question frequency (normalize to lowercase, trim)
          const q = msg.content.trim().toLowerCase().slice(0, 200)
          questionCounts.set(q, (questionCounts.get(q) || 0) + 1)
        } else if (msg.role === 'assistant') {
          totalAssistantMessages++
        }
        // Track cited chunks
        if (msg.cited_chunk_ids && Array.isArray(msg.cited_chunk_ids)) {
          for (const chunkId of msg.cited_chunk_ids) {
            chunkCitationCounts.set(chunkId, (chunkCitationCounts.get(chunkId) || 0) + 1)
          }
        }
      }
    }
  }

  // Top questions (sorted by frequency)
  const topQuestions = [...questionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }))

  // Most-cited chunks (fetch actual content)
  const topChunkEntries = [...chunkCitationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  let topCitedChunks: Array<{ id: string; content: string; chapterTitle: string; count: number }> = []

  if (topChunkEntries.length > 0) {
    const chunkIds = topChunkEntries.map(([id]) => id)
    const { data: chunks } = await supabase
      .from('book_chunks')
      .select('id, content, chapter_id')
      .in('id', chunkIds)

    if (chunks && chunks.length > 0) {
      // Fetch chapter titles
      const chapterIds = [...new Set(chunks.map(c => c.chapter_id))]
      const { data: chapters } = await supabase
        .from('chapters')
        .select('id, title')
        .in('id', chapterIds)

      const chapterMap = new Map((chapters || []).map(c => [c.id, c.title]))
      const chunkMap = new Map(chunks.map(c => [c.id, c]))

      topCitedChunks = topChunkEntries.map(([id, count]) => {
        const chunk = chunkMap.get(id)
        return {
          id,
          content: chunk?.content?.slice(0, 300) || 'Content unavailable',
          chapterTitle: chapterMap.get(chunk?.chapter_id || '') || 'Unknown Chapter',
          count,
        }
      })
    }
  }

  return {
    totalConversations: totalConversations || 0,
    totalMessages,
    totalUserMessages,
    totalAssistantMessages,
    topQuestions,
    topCitedChunks,
  }
}
