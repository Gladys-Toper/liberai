import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createClient } from '@supabase/supabase-js'
import { dispatchEvent } from '@/lib/agents/event-dispatcher'
import { recordInteraction } from '@/lib/agents/trust'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = getServiceClient()

  const { data: swarm } = await db
    .from('agent_swarms')
    .select('*')
    .eq('id', id)
    .single()

  if (!swarm) {
    return NextResponse.json({ error: 'Swarm not found' }, { status: 404 })
  }

  const { data: members } = await db
    .from('swarm_members')
    .select('*, agents!inner(id, name, agent_type, trust_score)')
    .eq('swarm_id', id)
    .order('joined_at', { ascending: true })

  return NextResponse.json({ swarm, members: members || [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: swarmId } = await params
  const body = await request.json()
  const { action, agentId, contribution } = body

  if (!action || !agentId) {
    return NextResponse.json({ error: 'action and agentId are required' }, { status: 400 })
  }

  const db = getServiceClient()

  // Verify agent ownership
  const { data: agent } = await db
    .from('agents')
    .select('id, owner_id, name')
    .eq('id', agentId)
    .single()

  if (!agent || agent.owner_id !== auth.userId) {
    return NextResponse.json({ error: 'Agent not found or not owned by you' }, { status: 404 })
  }

  // Get swarm
  const { data: swarm } = await db
    .from('agent_swarms')
    .select('*')
    .eq('id', swarmId)
    .single()

  if (!swarm) {
    return NextResponse.json({ error: 'Swarm not found' }, { status: 404 })
  }

  switch (action) {
    case 'join': {
      if (!['forming', 'active'].includes(swarm.status)) {
        return NextResponse.json({ error: 'Swarm is not accepting members' }, { status: 400 })
      }

      // Check member count
      const { count } = await db
        .from('swarm_members')
        .select('id', { count: 'exact', head: true })
        .eq('swarm_id', swarmId)
        .is('left_at', null)

      if ((count || 0) >= swarm.max_members) {
        return NextResponse.json({ error: 'Swarm is full' }, { status: 400 })
      }

      const { error } = await db.from('swarm_members').insert({
        swarm_id: swarmId,
        agent_id: agentId,
        role: 'participant',
      })

      if (error?.code === '23505') {
        return NextResponse.json({ error: 'Agent already in swarm' }, { status: 409 })
      }
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Activate swarm if still forming
      if (swarm.status === 'forming') {
        await db.from('agent_swarms')
          .update({ status: 'active', formed_at: new Date().toISOString() })
          .eq('id', swarmId)
      }

      return NextResponse.json({ message: 'Joined swarm' })
    }

    case 'leave': {
      await db.from('swarm_members')
        .update({ left_at: new Date().toISOString() })
        .eq('swarm_id', swarmId)
        .eq('agent_id', agentId)

      return NextResponse.json({ message: 'Left swarm' })
    }

    case 'contribute': {
      if (!contribution) {
        return NextResponse.json({ error: 'contribution is required' }, { status: 400 })
      }

      await db.from('swarm_members')
        .update({ contribution })
        .eq('swarm_id', swarmId)
        .eq('agent_id', agentId)

      return NextResponse.json({ message: 'Contribution recorded' })
    }

    case 'dissolve': {
      // Only initiator can dissolve
      if (swarm.initiator_id !== agentId) {
        return NextResponse.json({ error: 'Only initiator can dissolve' }, { status: 403 })
      }

      await db.from('agent_swarms')
        .update({
          status: 'dissolved',
          dissolved_at: new Date().toISOString(),
        })
        .eq('id', swarmId)

      // Record trust for all active members
      const { data: members } = await db
        .from('swarm_members')
        .select('agent_id, contribution')
        .eq('swarm_id', swarmId)
        .is('left_at', null)

      for (const member of members || []) {
        const hasContribution = member.contribution && Object.keys(member.contribution).length > 0
        await recordInteraction({
          agentId: member.agent_id,
          interactionType: 'swarm_contribution',
          counterpartyType: 'agent',
          counterpartyId: swarm.initiator_id,
          outcome: hasContribution ? 'success' : 'partial',
          context: { swarmId, swarmName: swarm.name },
        })
      }

      // Dispatch dissolution event
      await dispatchEvent({
        eventType: 'swarm_dissolved',
        payload: {
          swarmId,
          name: swarm.name,
          purpose: swarm.purpose,
          memberCount: (members || []).length,
        },
        sourceType: 'agent',
        sourceId: agentId,
      })

      return NextResponse.json({ message: 'Swarm dissolved' })
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}. Use join, leave, contribute, or dissolve` },
        { status: 400 },
      )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: swarmId } = await params
  const body = await request.json()
  const { result } = body

  const db = getServiceClient()

  // Verify initiator ownership
  const { data: swarm } = await db
    .from('agent_swarms')
    .select('initiator_id')
    .eq('id', swarmId)
    .single()

  if (!swarm) {
    return NextResponse.json({ error: 'Swarm not found' }, { status: 404 })
  }

  const { data: initiator } = await db
    .from('agents')
    .select('owner_id')
    .eq('id', swarm.initiator_id)
    .single()

  if (!initiator || initiator.owner_id !== auth.userId) {
    return NextResponse.json({ error: 'Only initiator owner can set result' }, { status: 403 })
  }

  await db.from('agent_swarms')
    .update({ result, status: 'completing' })
    .eq('id', swarmId)

  return NextResponse.json({ message: 'Result saved' })
}
