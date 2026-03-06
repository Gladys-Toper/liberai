import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { validateApiKey } from './api-key'

export interface AuthContext {
  userId: string
  role: 'reader' | 'author' | 'admin'
  scope: 'author' | 'admin' | 'agent'
  authorId?: string
  agentId?: string
  permissions: string[]
}

/**
 * Unified auth resolver for API routes.
 * Tries cookie-based auth first, falls back to API key.
 * Returns null if unauthenticated.
 */
export async function resolveAuth(request: Request): Promise<AuthContext | null> {
  // 1. Try API key from Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer lbr_live_')) {
    const token = authHeader.slice(7) // "Bearer ".length
    const key = await validateApiKey(token)
    if (!key) return null

    // Look up user role
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: user } = await db
      .from('users')
      .select('role')
      .eq('id', key.owner_id)
      .single()

    return {
      userId: key.owner_id,
      role: (user?.role as AuthContext['role']) || 'reader',
      scope: key.scope as AuthContext['scope'],
      authorId: key.author_id || undefined,
      agentId: key.agent_id || undefined,
      permissions: Array.isArray(key.permissions) ? key.permissions : [],
    }
  }

  // 2. Try cookie-based auth (for browser requests)
  try {
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
                cookieStore.set(name, value, options),
              )
            } catch {
              // Ignored in server component context
            }
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    // Get role and author info
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const [{ data: userData }, { data: authorData }] = await Promise.all([
      db.from('users').select('role').eq('id', user.id).single(),
      db.from('authors').select('id').eq('user_id', user.id).single(),
    ])

    const role = (userData?.role as AuthContext['role']) || 'reader'

    return {
      userId: user.id,
      role,
      scope: role === 'admin' ? 'admin' : 'author',
      authorId: authorData?.id || undefined,
      permissions: [], // Full access via cookie auth
    }
  } catch {
    return null
  }
}

/**
 * Require auth with a specific scope. Returns 401/403 Response on failure.
 */
export async function requireAuth(
  request: Request,
  requiredScope?: 'author' | 'admin',
): Promise<AuthContext | Response> {
  const auth = await resolveAuth(request)

  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (requiredScope === 'admin' && auth.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (requiredScope === 'author' && !auth.authorId && auth.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden: author access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return auth
}
