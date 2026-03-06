import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: agentId } = await params
  const db = getServiceClient()

  // Verify ownership
  const { data: agent } = await db
    .from('agents')
    .select('owner_id')
    .eq('id', agentId)
    .single()

  if (!agent || agent.owner_id !== auth.userId) {
    return NextResponse.json({ error: 'Agent not found or not owned by you' }, { status: 404 })
  }

  const body = await request.json()
  const { eventPattern, filter, delivery } = body

  if (!eventPattern) {
    return NextResponse.json({ error: 'eventPattern is required' }, { status: 400 })
  }

  const validDelivery = ['webhook', 'a2a', 'poll']
  if (delivery && !validDelivery.includes(delivery)) {
    return NextResponse.json(
      { error: `delivery must be one of: ${validDelivery.join(', ')}` },
      { status: 400 },
    )
  }

  const { data: sub, error } = await db
    .from('agent_event_subscriptions')
    .insert({
      agent_id: agentId,
      event_pattern: eventPattern,
      filter: filter || {},
      delivery: delivery || 'webhook',
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ subscription: sub }, { status: 201 })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: agentId } = await params
  const db = getServiceClient()

  const { data: subs } = await db
    .from('agent_event_subscriptions')
    .select('*')
    .eq('agent_id', agentId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  return NextResponse.json({ subscriptions: subs || [] })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: agentId } = await params
  const body = await request.json()
  const { subscriptionId } = body

  if (!subscriptionId) {
    return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Verify ownership via agent
  const { data: agent } = await db
    .from('agents')
    .select('owner_id')
    .eq('id', agentId)
    .single()

  if (!agent || agent.owner_id !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await db
    .from('agent_event_subscriptions')
    .update({ active: false })
    .eq('id', subscriptionId)
    .eq('agent_id', agentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ message: 'Subscription removed' })
}
