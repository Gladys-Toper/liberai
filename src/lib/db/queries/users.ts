import { createServerSupabaseClient } from '../supabase'

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  return data
}

export async function getUser(id: string) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

  return data
}

export async function getAuthorByUserId(userId: string) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('authors')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data
}

export async function getAuthor(id: string) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('authors')
    .select('*, users!inner(email)')
    .eq('id', id)
    .single()

  return data
}

export async function ensureUserProfile(authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (existing) return existing

  const name = (authUser.user_metadata?.full_name as string) ||
    (authUser.user_metadata?.name as string) ||
    authUser.email?.split('@')[0] || 'Reader'

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: authUser.id,
      name,
      email: authUser.email || '',
      role: 'reader',
      avatar_url: (authUser.user_metadata?.avatar_url as string) || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating user profile:', error)
    return null
  }

  return data
}

export async function getUserLibrary(userId: string) {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('reading_progress')
    .select('*, books!inner(*, authors!inner(id, display_name, avatar_url, verified))')
    .eq('user_id', userId)
    .order('last_read_at', { ascending: false })

  if (error) {
    console.error('Error fetching user library:', error)
    return []
  }

  return data ?? []
}
