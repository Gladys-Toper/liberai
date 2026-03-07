// Sprint 8: Arena Sponsors API
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/arena/sponsors — List active sponsors
export async function GET() {
  const db = getServiceClient()

  const { data: sponsors } = await db
    .from('arena_sponsors')
    .select('id, name, tagline, logo_url, tier')
    .eq('is_active', true)
    .order('tier')

  return NextResponse.json({ sponsors: sponsors || [] })
}

// POST /api/arena/sponsors — Create sponsor (admin only)
export async function POST(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { name, tagline, logoUrl, tier, contextPrompt } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const db = getServiceClient()

  const { data: sponsor, error } = await db
    .from('arena_sponsors')
    .insert({
      name,
      tagline,
      logo_url: logoUrl,
      tier: tier || 'bronze',
      context_prompt: contextPrompt,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create sponsor:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sponsor })
}
