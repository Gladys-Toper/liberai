import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface AgentEvent {
  eventType: string
  payload: Record<string, unknown>
  sourceType: 'human' | 'agent' | 'system'
  sourceId?: string
}

interface Subscription {
  id: string
  agent_id: string
  event_pattern: string
  filter: Record<string, unknown>
  delivery: 'webhook' | 'a2a' | 'poll'
}

interface AgentEndpoints {
  id: string
  webhook_url: string | null
  a2a_endpoint: string | null
}

/**
 * Dispatch an event to the agent pub/sub mesh.
 * 1. Logs event to agent_event_log
 * 2. Matches subscriptions by pattern
 * 3. Delivers via webhook/a2a (fire-and-forget)
 */
export async function dispatchEvent(event: AgentEvent): Promise<void> {
  const db = getServiceClient()

  // 1. Log the event
  const { data: logEntry } = await db
    .from('agent_event_log')
    .insert({
      event_type: event.eventType,
      payload: event.payload,
      source_type: event.sourceType,
      source_id: event.sourceId || null,
    })
    .select('id')
    .single()

  // 2. Find matching subscriptions
  const { data: subs } = await db
    .from('agent_event_subscriptions')
    .select('id, agent_id, event_pattern, filter, delivery')
    .eq('active', true)

  if (!subs || subs.length === 0) return

  const matchingSubs = subs.filter(sub =>
    matchesPattern(sub.event_pattern, event.eventType) &&
    matchesFilter(sub.filter, event.payload),
  )

  if (matchingSubs.length === 0) return

  // 3. Get agent endpoints for matched subs
  const agentIds = [...new Set(matchingSubs.map(s => s.agent_id))]
  const { data: agents } = await db
    .from('agents')
    .select('id, webhook_url, a2a_endpoint')
    .in('id', agentIds)
    .eq('status', 'active')

  if (!agents || agents.length === 0) return

  const agentMap = new Map(agents.map(a => [a.id, a as AgentEndpoints]))
  const dispatchedTo: string[] = []

  // 4. Fire-and-forget delivery
  const deliveryPromises = matchingSubs
    .map(sub => {
      const agent = agentMap.get(sub.agent_id)
      if (!agent) return null

      dispatchedTo.push(sub.agent_id)

      if (sub.delivery === 'webhook' && agent.webhook_url) {
        return deliverWebhook(agent.webhook_url, event, sub.agent_id)
      }
      if (sub.delivery === 'a2a' && agent.a2a_endpoint) {
        return deliverA2A(agent.a2a_endpoint, event)
      }
      // poll delivery = no-op (agent queries event_log)
      return null
    })
    .filter(Boolean)

  // Don't await — fire and forget with timeout
  Promise.allSettled(deliveryPromises).catch(() => {})

  // 5. Update dispatched_to list
  if (logEntry && dispatchedTo.length > 0) {
    await db
      .from('agent_event_log')
      .update({ dispatched_to: dispatchedTo })
      .eq('id', logEntry.id)
  }
}

/**
 * Match event_pattern against event_type.
 * Supports exact match and glob with '*'.
 */
function matchesPattern(pattern: string, eventType: string): boolean {
  if (pattern === '*') return true
  if (pattern === eventType) return true

  // Glob matching: 'swarm.*' matches 'swarm_formed', 'swarm_dissolved'
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2)
    return eventType.startsWith(prefix)
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return eventType.startsWith(prefix)
  }

  return false
}

/**
 * Check if event payload matches subscription filter.
 * Simple key-value equality matching.
 */
function matchesFilter(
  filter: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true

  for (const [key, value] of Object.entries(filter)) {
    // Support nested key access with dots
    const payloadValue = getNestedValue(payload, key)

    // minRating / maxRating special handling
    if (key === 'minRating' && typeof value === 'number') {
      if (typeof payloadValue !== 'number' || payloadValue < value) return false
      continue
    }
    if (key === 'maxRating' && typeof value === 'number') {
      if (typeof payloadValue !== 'number' || payloadValue > value) return false
      continue
    }

    if (payloadValue !== value) return false
  }

  return true
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((curr: unknown, key) => {
    if (curr && typeof curr === 'object') {
      return (curr as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/**
 * Deliver event via webhook POST with HMAC signature.
 */
async function deliverWebhook(
  url: string,
  event: AgentEvent,
  agentId: string,
): Promise<void> {
  const body = JSON.stringify({
    event_type: event.eventType,
    payload: event.payload,
    source_type: event.sourceType,
    source_id: event.sourceId,
    timestamp: new Date().toISOString(),
  })

  const signature = crypto
    .createHmac('sha256', agentId) // Use agentId as HMAC key for simplicity
    .update(body)
    .digest('hex')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LiberAI-Signature': signature,
        'X-LiberAI-Event': event.eventType,
      },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (err) {
    console.error(`Webhook delivery failed for ${agentId}:`, err)
  }
}

/**
 * Deliver event via A2A JSON-RPC call.
 */
async function deliverA2A(
  endpoint: string,
  event: AgentEvent,
): Promise<void> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    method: 'events/receive',
    params: {
      event_type: event.eventType,
      payload: event.payload,
      source_type: event.sourceType,
      source_id: event.sourceId,
    },
    id: crypto.randomUUID(),
  })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (err) {
    console.error(`A2A delivery failed to ${endpoint}:`, err)
  }
}
