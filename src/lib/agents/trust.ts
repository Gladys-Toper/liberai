import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface TrustInteraction {
  agentId: string
  interactionType: 'a2a_task' | 'swarm_contribution' | 'rating' | 'webhook_delivery'
  counterpartyType: 'agent' | 'human' | 'system'
  counterpartyId?: string
  outcome: 'success' | 'failure' | 'timeout' | 'partial'
  confidence?: number
  accuracy?: number
  latencyMs?: number
  context?: Record<string, unknown>
}

const OUTCOME_WEIGHTS: Record<string, number> = {
  success: 1.0,
  partial: 0.5,
  timeout: 0.1,
  failure: 0.0,
}

const DECAY_RATE = 0.03 // Exponential decay per day

/**
 * Record an interaction and recalculate the agent's trust score.
 */
export async function recordInteraction(entry: TrustInteraction): Promise<void> {
  const db = getServiceClient()

  // 1. Insert trust ledger entry
  await db.from('trust_ledger').insert({
    agent_id: entry.agentId,
    interaction_type: entry.interactionType,
    counterparty_type: entry.counterpartyType,
    counterparty_id: entry.counterpartyId || null,
    outcome: entry.outcome,
    confidence: entry.confidence ?? null,
    accuracy: entry.accuracy ?? null,
    latency_ms: entry.latencyMs ?? null,
    context: entry.context || {},
  })

  // 2. Recalculate trust score (exponentially-weighted moving average)
  const { data: ledger } = await db
    .from('trust_ledger')
    .select('outcome, created_at')
    .eq('agent_id', entry.agentId)
    .order('created_at', { ascending: false })
    .limit(200) // Recent history window

  if (!ledger || ledger.length === 0) return

  const now = Date.now()
  let weightedSum = 0
  let totalWeight = 0

  for (const record of ledger) {
    const ageDays = (now - new Date(record.created_at).getTime()) / (1000 * 60 * 60 * 24)
    const weight = Math.exp(-DECAY_RATE * ageDays)
    const outcomeScore = OUTCOME_WEIGHTS[record.outcome] ?? 0
    weightedSum += outcomeScore * weight
    totalWeight += weight
  }

  const trustScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5
  const total = ledger.length
  const successful = ledger.filter(r => r.outcome === 'success').length

  // 3. Update agent's denormalized trust fields
  const updates: Record<string, unknown> = {
    trust_score: Number(trustScore.toFixed(4)),
    total_interactions: total,
    successful_interactions: successful,
    updated_at: new Date().toISOString(),
  }

  // Auto-suspend agents with very low trust
  if (trustScore < 0.2 && total >= 10) {
    updates.status = 'suspended'
  }

  await db
    .from('agents')
    .update(updates)
    .eq('id', entry.agentId)
}

/**
 * Get trust history for an agent.
 */
export async function getTrustHistory(
  agentId: string,
  days = 30,
): Promise<{
  currentScore: number
  history: Array<{ date: string; score: number; interactions: number }>
  recentLedger: Array<Record<string, unknown>>
  breakdown: Record<string, number>
}> {
  const db = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [{ data: agent }, { data: ledger }] = await Promise.all([
    db.from('agents').select('trust_score').eq('id', agentId).single(),
    db.from('trust_ledger')
      .select('*')
      .eq('agent_id', agentId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true }),
  ])

  const records = ledger || []

  // Group by date for history chart
  const dateMap = new Map<string, { scores: number[]; count: number }>()
  for (const r of records) {
    const date = r.created_at.split('T')[0]
    const entry = dateMap.get(date) || { scores: [], count: 0 }
    entry.scores.push(OUTCOME_WEIGHTS[r.outcome] ?? 0)
    entry.count++
    dateMap.set(date, entry)
  }

  const history = [...dateMap.entries()].map(([date, { scores, count }]) => ({
    date,
    score: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4)),
    interactions: count,
  }))

  // Breakdown by outcome
  const breakdown: Record<string, number> = { success: 0, failure: 0, timeout: 0, partial: 0 }
  for (const r of records) {
    breakdown[r.outcome] = (breakdown[r.outcome] || 0) + 1
  }

  return {
    currentScore: Number(agent?.trust_score || 0),
    history,
    recentLedger: records.slice(-20).reverse(),
    breakdown,
  }
}
