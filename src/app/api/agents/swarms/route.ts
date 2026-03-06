import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createClient } from '@supabase/supabase-js'
import { searchAgentsByCapability } from '@/lib/db/queries/agents'
import { dispatchEvent } from '@/lib/agents/event-dispatcher'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    name,
    purpose,
    initiatorAgentId,
    taskType,
    targetType,
    targetId,
    maxMembers = 10,
    ttlMinutes = 60,
    requiredCapabilities,
  } = body

  if (!name || !purpose || !initiatorAgentId) {
    return NextResponse.json(
      { error: 'name, purpose, and initiatorAgentId are required' },
      { status: 400 },
    )
  }

  const db = getServiceClient()

  // Verify initiator agent belongs to user
  const { data: initiator } = await db
    .from('agents')
    .select('id, owner_id, name')
    .eq('id', initiatorAgentId)
    .single()

  if (!initiator || initiator.owner_id !== auth.userId) {
    return NextResponse.json({ error: 'Initiator agent not found or not owned by you' }, { status: 404 })
  }

  // Create the swarm
  const { data: swarm, error } = await db
    .from('agent_swarms')
    .insert({
      name,
      purpose,
      initiator_id: initiatorAgentId,
      task_type: taskType || null,
      target_type: targetType || null,
      target_id: targetId || null,
      max_members: maxMembers,
      ttl_minutes: ttlMinutes,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Add initiator as first member
  await db.from('swarm_members').insert({
    swarm_id: swarm.id,
    agent_id: initiatorAgentId,
    role: 'initiator',
  })

  // Auto-match agents if requiredCapabilities provided
  let matchedAgents: Array<{ id: string; name: string; distance: number }> = []
  if (requiredCapabilities && requiredCapabilities.length > 0) {
    const capabilityQuery = requiredCapabilities.join(', ')
    const agents = await searchAgentsByCapability(capabilityQuery, maxMembers - 1)

    // Filter out the initiator
    const candidates = agents.filter(a => a.id !== initiatorAgentId)

    // Auto-add matched agents
    if (candidates.length > 0) {
      await db.from('swarm_members').insert(
        candidates.map(a => ({
          swarm_id: swarm.id,
          agent_id: a.id,
          role: 'participant',
        })),
      )

      matchedAgents = candidates.map(a => ({
        id: a.id,
        name: a.name,
        distance: a.distance,
      }))

      // Set swarm to active since we have members
      await db.from('agent_swarms')
        .update({ status: 'active', formed_at: new Date().toISOString() })
        .eq('id', swarm.id)

      swarm.status = 'active'
      swarm.formed_at = new Date().toISOString()
    }
  }

  // Dispatch swarm_formed event
  await dispatchEvent({
    eventType: 'swarm_formed',
    payload: {
      swarmId: swarm.id,
      name: swarm.name,
      purpose: swarm.purpose,
      taskType: swarm.task_type,
      initiator: initiator.name,
      memberCount: 1 + matchedAgents.length,
    },
    sourceType: 'agent',
    sourceId: initiatorAgentId,
  })

  return NextResponse.json({ swarm, matchedAgents }, { status: 201 })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const status = url.searchParams.get('status') || 'active'
  const limit = Number(url.searchParams.get('limit') || '20')

  const db = getServiceClient()

  let query = db
    .from('agent_swarms')
    .select('*, swarm_members(id, agent_id, role, joined_at, left_at)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: swarms } = await query
  return NextResponse.json({ swarms: swarms || [] })
}
