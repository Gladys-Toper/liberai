import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface MeterResult {
  allowed: boolean
  cost: number
  reason?: string
}

/**
 * Meter an agent-to-agent API call.
 * Checks target agent's rate_per_call, logs cost, updates economics.
 */
export async function meterAgentCall(opts: {
  callerAgentId: string
  targetAgentId: string
  taskId?: string
  callType: 'a2a_task' | 'matchmaking' | 'event_dispatch'
}): Promise<MeterResult> {
  const db = getServiceClient()

  // Get target agent's rate
  const { data: target } = await db
    .from('agents')
    .select('rate_per_call, status')
    .eq('id', opts.targetAgentId)
    .single()

  if (!target || target.status !== 'active') {
    return { allowed: false, cost: 0, reason: 'Target agent unavailable' }
  }

  const cost = Number(target.rate_per_call || 0)

  // If free, allow immediately
  if (cost === 0) {
    return { allowed: true, cost: 0 }
  }

  // Update economics: caller spends, target earns
  const updates = [
    db.rpc('increment_agent_spent', {
      p_agent_id: opts.callerAgentId,
      p_amount: cost,
    }),
    db.rpc('increment_agent_earned', {
      p_agent_id: opts.targetAgentId,
      p_amount: cost,
    }),
  ]

  // If task exists, update its cost
  if (opts.taskId) {
    updates.push(
      db.from('a2a_tasks')
        .update({ cost_usd: cost })
        .eq('id', opts.taskId) as any,
    )
  }

  await Promise.allSettled(updates)

  return { allowed: true, cost }
}

/**
 * Get agent economics summary.
 */
export async function getAgentEconomics(
  agentId: string,
  days = 30,
): Promise<{
  totalEarned: number
  totalSpent: number
  netBalance: number
  ratePerCall: number
  taskBreakdown: Array<{ callType: string; count: number; totalCost: number }>
  topCounterparties: Array<{ agentId: string; agentName: string; volume: number }>
}> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [{ data: agent }, { data: tasksAsRequester }, { data: tasksAsResponder }] = await Promise.all([
    db.from('agents').select('total_earned_usd, total_spent_usd, rate_per_call').eq('id', agentId).single(),
    db.from('a2a_tasks')
      .select('method, cost_usd, responder_agent_id')
      .eq('requester_agent_id', agentId)
      .gte('created_at', since.toISOString()),
    db.from('a2a_tasks')
      .select('method, cost_usd, requester_agent_id')
      .eq('responder_agent_id', agentId)
      .gte('created_at', since.toISOString()),
  ])

  // Task breakdown by method
  const methodMap = new Map<string, { count: number; totalCost: number }>()
  for (const t of [...(tasksAsRequester || []), ...(tasksAsResponder || [])]) {
    const entry = methodMap.get(t.method) || { count: 0, totalCost: 0 }
    entry.count++
    entry.totalCost += Number(t.cost_usd || 0)
    methodMap.set(t.method, entry)
  }

  const taskBreakdown = [...methodMap.entries()].map(([callType, data]) => ({
    callType,
    ...data,
  }))

  // Top counterparties
  const counterpartyMap = new Map<string, number>()
  for (const t of tasksAsRequester || []) {
    if (t.responder_agent_id) {
      counterpartyMap.set(
        t.responder_agent_id,
        (counterpartyMap.get(t.responder_agent_id) || 0) + Number(t.cost_usd || 0),
      )
    }
  }
  for (const t of tasksAsResponder || []) {
    if (t.requester_agent_id) {
      counterpartyMap.set(
        t.requester_agent_id,
        (counterpartyMap.get(t.requester_agent_id) || 0) + Number(t.cost_usd || 0),
      )
    }
  }

  const topIds = [...counterpartyMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  let topCounterparties: Array<{ agentId: string; agentName: string; volume: number }> = []
  if (topIds.length > 0) {
    const ids = topIds.map(([id]) => id)
    const { data: agents } = await db
      .from('agents')
      .select('id, name')
      .in('id', ids)

    const nameMap = new Map((agents || []).map(a => [a.id, a.name]))
    topCounterparties = topIds.map(([id, volume]) => ({
      agentId: id,
      agentName: nameMap.get(id) || 'Unknown',
      volume,
    }))
  }

  return {
    totalEarned: Number(agent?.total_earned_usd || 0),
    totalSpent: Number(agent?.total_spent_usd || 0),
    netBalance: Number(agent?.total_earned_usd || 0) - Number(agent?.total_spent_usd || 0),
    ratePerCall: Number(agent?.rate_per_call || 0),
    taskBreakdown,
    topCounterparties,
  }
}
