import { createServerSupabaseClient } from '../supabase'

export async function getBooks(options?: {
  category?: string
  search?: string
  featured?: boolean
  limit?: number
  offset?: number
  sort?: 'newest' | 'popular' | 'rating'
}) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return { data: [], count: 0 }

  let query = supabase
    .from('books')
    .select('*, authors!inner(id, display_name, avatar_url, verified)', { count: 'exact' })
    .eq('status', 'published')

  if (options?.category) {
    query = query.eq('category', options.category)
  }
  if (options?.search) {
    query = query.or(`title.ilike.%${options.search}%,description.ilike.%${options.search}%`)
  }
  if (options?.featured) {
    query = query.eq('featured', true)
  }

  switch (options?.sort) {
    case 'newest':
      query = query.order('published_date', { ascending: false })
      break
    case 'popular':
      query = query.order('total_reads', { ascending: false })
      break
    case 'rating':
      query = query.order('average_rating', { ascending: false })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  const limit = options?.limit ?? 12
  const offset = options?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching books:', error)
    return { data: [], count: 0 }
  }

  return { data: data ?? [], count: count ?? 0 }
}

export async function getBook(id: string) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('books')
    .select('*, authors!inner(id, user_id, display_name, bio, avatar_url, social_links, verified)')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching book:', error)
    return null
  }

  return data
}

export async function getFeaturedBooks() {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('books')
    .select('*, authors!inner(id, display_name, avatar_url, verified)')
    .eq('featured', true)
    .eq('status', 'published')
    .order('total_reads', { ascending: false })
    .limit(6)

  if (error) {
    console.error('Error fetching featured books:', error)
    return []
  }

  return data ?? []
}

export async function getBooksByAuthor(authorId: string) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching author books:', error)
    return []
  }

  return data ?? []
}

export async function getChapters(bookId: string) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('book_id', bookId)
    .order('chapter_number', { ascending: true })

  if (error) {
    console.error('Error fetching chapters:', error)
    return []
  }

  return data ?? []
}

export async function getCategories() {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }

  return data ?? []
}
