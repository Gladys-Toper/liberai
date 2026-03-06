import { NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/auth/api-key'
import { createClient } from '@supabase/supabase-js'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { searchAgentsByCapability, getAgent } from '@/lib/db/queries/agents'
import { recordInteraction } from '@/lib/agents/trust'
import { meterAgentCall } from '@/lib/agents/metering'
import { dispatchEvent } from '@/lib/agents/event-dispatcher'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface A2ARequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

function jsonRpcResult(id: string | number, result: unknown) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    result,
  })
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonRpcError(null, -32000, 'Missing or invalid Authorization header')
  }

  const key = await validateApiKey(authHeader.slice(7))
  if (!key) {
    return jsonRpcError(null, -32000, 'Invalid or revoked API key')
  }

  let body: A2ARequest
  try {
    body = await request.json()
  } catch {
    return jsonRpcError(null, -32700, 'Parse error')
  }

  if (body.jsonrpc !== '2.0' || !body.method || !body.id) {
    return jsonRpcError(body?.id ?? null, -32600, 'Invalid JSON-RPC request')
  }

  const ctx = {
    ownerId: key.owner_id,
    agentId: key.agent_id as string | null,
    scope: key.scope,
    keyName: key.name,
  }

  switch (body.method) {
    case 'tasks/send':
      return handleTaskSend(body, ctx)
    case 'tasks/get':
      return handleTaskGet(body)
    case 'tasks/cancel':
      return handleTaskCancel(body)
    case 'agents/discover':
      return handleAgentsDiscover(body)
    case 'agents/card':
      return handleAgentsCard(body)
    case 'events/subscribe':
      return handleEventsSubscribe(body, ctx)
    case 'swarms/create':
      return handleSwarmsCreate(body, ctx)
    case 'swarms/join':
      return handleSwarmsJoin(body, ctx)
    case 'swarms/contribute':
      return handleSwarmsContribute(body, ctx)
    default:
      return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`)
  }
}

// ─── tasks/send (persistent) ─────────────────────────

async function handleTaskSend(
  req: A2ARequest,
  ctx: { ownerId: string; agentId: string | null; scope: string; keyName: string },
) {
  const params = req.params as {
    id?: string
    message?: { role: string; parts: Array<{ type: string; text?: string }> }
    responderAgentId?: string
    query?: string
  } | undefined

  if (!params?.message) {
    return jsonRpcError(req.id, -32602, 'Missing message parameter')
  }

  const textParts = params.message.parts
    ?.filter(p => p.type === 'text' && p.text)
    .map(p => p.text!)

  if (!textParts?.length) {
    return jsonRpcError(req.id, -32602, 'No text content in message')
  }

  const db = getServiceClient()
  const userMessage = textParts.join('\n')
  const taskId = params.id || crypto.randomUUID()

  // Resolve responder: explicit ID, semantic match, or self-handle
  let responderAgentId = params.responderAgentId || null
  if (!responderAgentId && params.query) {
    const matched = await searchAgentsByCapability(params.query, 1)
    if (matched.length > 0) {
      responderAgentId = matched[0].id
    }
  }

  // Persist task
  const { data: task, error: insertErr } = await db
    .from('a2a_tasks')
    .insert({
      id: taskId,
      requester_agent_id: ctx.agentId || null,
      responder_agent_id: responderAgentId,
      requester_user_id: ctx.ownerId,
      method: 'tasks/send',
      status: 'working',
      input: { message: params.message },
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertErr) {
    return jsonRpcError(req.id, -32000, `Failed to create task: ${insertErr.message}`)
  }

  // Meter the call if responder has a rate
  if (responderAgentId && ctx.agentId) {
    await meterAgentCall({
      callerAgentId: ctx.agentId,
      targetAgentId: responderAgentId,
      taskId,
      callType: 'a2a_task',
    })
  }

  try {
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      system: `You are LiberAi's A2A agent assistant. You help other agents interact with the LiberAi platform.
Scope: ${ctx.scope}. Agent: ${ctx.keyName}.
Respond concisely with structured data when possible.`,
      prompt: userMessage,
    })

    // Update task as completed
    await db.from('a2a_tasks').update({
      status: 'completed',
      output: { artifacts: [{ parts: [{ type: 'text', text }] }] },
      completed_at: new Date().toISOString(),
    }).eq('id', taskId)

    // Record trust
    if (responderAgentId) {
      await recordInteraction({
        agentId: responderAgentId,
        interactionType: 'a2a_task',
        counterpartyType: ctx.agentId ? 'agent' : 'human',
        counterpartyId: ctx.agentId || ctx.ownerId,
        outcome: 'success',
        context: { taskId, method: 'tasks/send' },
      })
    }

    // Dispatch event
    await dispatchEvent({
      eventType: 'agent_task_completed',
      payload: { taskId, method: 'tasks/send', status: 'completed' },
      sourceType: 'agent',
      sourceId: responderAgentId || ctx.agentId || undefined,
    })

    return jsonRpcResult(req.id, {
      id: taskId,
      status: 'completed',
      artifacts: [{ parts: [{ type: 'text', text }] }],
    })
  } catch (err) {
    await db.from('a2a_tasks').update({
      status: 'failed',
      error: { code: -32000, message: err instanceof Error ? err.message : 'Unknown error' },
      completed_at: new Date().toISOString(),
    }).eq('id', taskId)

    if (responderAgentId) {
      await recordInteraction({
        agentId: responderAgentId,
        interactionType: 'a2a_task',
        counterpartyType: ctx.agentId ? 'agent' : 'human',
        counterpartyId: ctx.agentId || ctx.ownerId,
        outcome: 'failure',
        context: { taskId, error: err instanceof Error ? err.message : 'Unknown' },
      })
    }

    return jsonRpcResult(req.id, {
      id: taskId,
      status: 'failed',
      error: { code: -32000, message: err instanceof Error ? err.message : 'Unknown error' },
    })
  }
}

// ─── tasks/get (persistent) ─────────────────────────

async function handleTaskGet(req: A2ARequest) {
  const taskId = (req.params as { id?: string })?.id
  if (!taskId) {
    return jsonRpcError(req.id, -32602, 'Missing id parameter')
  }

  const db = getServiceClient()
  const { data: task } = await db
    .from('a2a_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (!task) {
    return jsonRpcError(req.id, -32602, 'Task not found')
  }

  return jsonRpcResult(req.id, {
    id: task.id,
    status: task.status,
    artifacts: task.output?.artifacts || null,
    error: task.error || null,
    cost_usd: task.cost_usd,
    created_at: task.created_at,
    completed_at: task.completed_at,
  })
}

// ─── tasks/cancel ─────────────────────────

async function handleTaskCancel(req: A2ARequest) {
  const taskId = (req.params as { id?: string })?.id
  if (!taskId) {
    return jsonRpcError(req.id, -32602, 'Missing id parameter')
  }

  const db = getServiceClient()
  const { error } = await db
    .from('a2a_tasks')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .in('status', ['pending', 'working'])

  if (error) {
    return jsonRpcError(req.id, -32000, error.message)
  }

  return jsonRpcResult(req.id, { id: taskId, status: 'cancelled' })
}

// ─── agents/discover ─────────────────────────

async function handleAgentsDiscover(req: A2ARequest) {
  const params = req.params as { query?: string; limit?: number; minTrust?: number } | undefined
  if (!params?.query) {
    return jsonRpcError(req.id, -32602, 'Missing query parameter')
  }

  const agents = await searchAgentsByCapability(params.query, params.limit || 5, params.minTrust)
  const results = agents.map(({ capability_embedding: _, ...a }) => a)

  return jsonRpcResult(req.id, { agents: results })
}

// ─── agents/card ─────────────────────────

async function handleAgentsCard(req: A2ARequest) {
  const agentId = (req.params as { id?: string })?.id
  if (!agentId) {
    return jsonRpcError(req.id, -32602, 'Missing id parameter')
  }

  const agent = await getAgent(agentId)
  if (!agent) {
    return jsonRpcError(req.id, -32602, 'Agent not found')
  }

  const { capability_embedding: _, ...agentPublic } = agent
  return jsonRpcResult(req.id, { agent: agentPublic })
}

// ─── events/subscribe ─────────────────────────

async function handleEventsSubscribe(
  req: A2ARequest,
  ctx: { agentId: string | null },
) {
  if (!ctx.agentId) {
    return jsonRpcError(req.id, -32000, 'Agent scope required')
  }

  const params = req.params as { eventPattern?: string; filter?: Record<string, unknown>; delivery?: string } | undefined
  if (!params?.eventPattern) {
    return jsonRpcError(req.id, -32602, 'Missing eventPattern parameter')
  }

  const db = getServiceClient()
  const { data: sub, error } = await db
    .from('agent_event_subscriptions')
    .insert({
      agent_id: ctx.agentId,
      event_pattern: params.eventPattern,
      filter: params.filter || {},
      delivery: params.delivery || 'webhook',
    })
    .select('*')
    .single()

  if (error) {
    return jsonRpcError(req.id, -32000, error.message)
  }

  return jsonRpcResult(req.id, { subscription: sub })
}

// ─── swarms/create ─────────────────────────

async function handleSwarmsCreate(
  req: A2ARequest,
  ctx: { agentId: string | null },
) {
  if (!ctx.agentId) {
    return jsonRpcError(req.id, -32000, 'Agent scope required')
  }

  const params = req.params as {
    name?: string; purpose?: string; taskType?: string
    maxMembers?: number; ttlMinutes?: number; requiredCapabilities?: string[]
  } | undefined

  if (!params?.name || !params?.purpose) {
    return jsonRpcError(req.id, -32602, 'Missing name and purpose parameters')
  }

  const db = getServiceClient()
  const { data: swarm, error } = await db
    .from('agent_swarms')
    .insert({
      name: params.name,
      purpose: params.purpose,
      initiator_id: ctx.agentId,
      task_type: params.taskType || null,
      max_members: params.maxMembers || 10,
      ttl_minutes: params.ttlMinutes || 60,
    })
    .select('*')
    .single()

  if (error) {
    return jsonRpcError(req.id, -32000, error.message)
  }

  await db.from('swarm_members').insert({
    swarm_id: swarm.id,
    agent_id: ctx.agentId,
    role: 'initiator',
  })

  return jsonRpcResult(req.id, { swarm })
}

// ─── swarms/join ─────────────────────────

async function handleSwarmsJoin(
  req: A2ARequest,
  ctx: { agentId: string | null },
) {
  if (!ctx.agentId) {
    return jsonRpcError(req.id, -32000, 'Agent scope required')
  }

  const swarmId = (req.params as { swarmId?: string })?.swarmId
  if (!swarmId) {
    return jsonRpcError(req.id, -32602, 'Missing swarmId parameter')
  }

  const db = getServiceClient()
  const { error } = await db.from('swarm_members').insert({
    swarm_id: swarmId,
    agent_id: ctx.agentId,
    role: 'participant',
  })

  if (error?.code === '23505') {
    return jsonRpcError(req.id, -32000, 'Already a member')
  }
  if (error) {
    return jsonRpcError(req.id, -32000, error.message)
  }

  return jsonRpcResult(req.id, { message: 'Joined swarm' })
}

// ─── swarms/contribute ─────────────────────────

async function handleSwarmsContribute(
  req: A2ARequest,
  ctx: { agentId: string | null },
) {
  if (!ctx.agentId) {
    return jsonRpcError(req.id, -32000, 'Agent scope required')
  }

  const params = req.params as { swarmId?: string; contribution?: Record<string, unknown> } | undefined
  if (!params?.swarmId || !params?.contribution) {
    return jsonRpcError(req.id, -32602, 'Missing swarmId and contribution parameters')
  }

  const db = getServiceClient()
  const { error } = await db.from('swarm_members')
    .update({ contribution: params.contribution })
    .eq('swarm_id', params.swarmId)
    .eq('agent_id', ctx.agentId)

  if (error) {
    return jsonRpcError(req.id, -32000, error.message)
  }

  return jsonRpcResult(req.id, { message: 'Contribution recorded' })
}
