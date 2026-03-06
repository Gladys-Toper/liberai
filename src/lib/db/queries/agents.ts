import { createClient } from '@supabase/supabase-js'
import { generateEmbedding } from '@/lib/ai/embeddings'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ============================================================
// TYPES
// ============================================================

export interface AgentRow {
  id: string
  owner_id: string
  name: string
  description: string | null
  agent_type: string
  capabilities: string[]
  capability_embedding: number[] | null
  protocols: string[]
  model_provider: string | null
  model_id: string | null
  webhook_url: string | null
  mcp_endpoint: string | null
  a2a_endpoint: string | null
  status: string
  last_heartbeat_at: string | null
  trust_score: number
  total_interactions: number
  successful_interactions: number
  rate_per_call: number
  total_earned_usd: number
  total_spent_usd: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AgentRegistration {
  name: string
  description?: string
  agentType: string
  capabilities: string[]
  webhookUrl?: string
  mcpEndpoint?: string
  a2aEndpoint?: string
  modelProvider?: string
  modelId?: string
  ratePerCall?: number
  protocols?: string[]
  metadata?: Record<string, unknown>
}

export interface AgentMatchResult extends AgentRow {
  distance: number
}

export interface AgentStats {
  totalAgents: number
  activeAgents: number
  suspendedAgents: number
  avgTrustScore: number
  byType: Record<string, number>
  totalSwarms: number
  activeSwarms: number
  events24h: number
  agentRevenue30d: number
}

// ============================================================
// CAPABILITY EMBEDDING
// ============================================================

async function embedCapabilities(agent: {
  name: string
  description?: string | null
  capabilities: string[]
  agent_type: string
}): Promise<number[]> {
  const text = `${agent.agent_type}: ${agent.name}. ${agent.description || ''}. Capabilities: ${agent.capabilities.join(', ')}`
  return generateEmbedding(text)
}

// ============================================================
// AGENT CRUD
// ============================================================

export async function registerAgent(
  ownerId: string,
  card: AgentRegistration,
): Promise<AgentRow> {
  const db = getServiceClient()

  const embedding = card.capabilities.length > 0
    ? await embedCapabilities({
        name: card.name,
        description: card.description,
        capabilities: card.capabilities,
        agent_type: card.agentType,
      })
    : null

  const { data, error } = await db
    .from('agents')
    .insert({
      owner_id: ownerId,
      name: card.name,
      description: card.description || null,
      agent_type: card.agentType,
      capabilities: card.capabilities,
      capability_embedding: embedding ? `[${embedding.join(',')}]` : null,
      protocols: card.protocols || ['mcp', 'a2a'],
      model_provider: card.modelProvider || null,
      model_id: card.modelId || null,
      webhook_url: card.webhookUrl || null,
      mcp_endpoint: card.mcpEndpoint || null,
      a2a_endpoint: card.a2aEndpoint || null,
      rate_per_call: card.ratePerCall || 0,
      metadata: card.metadata || {},
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to register agent: ${error.message}`)
  return data as AgentRow
}

export async function updateAgent(
  agentId: string,
  ownerId: string,
  updates: Partial<AgentRegistration>,
): Promise<AgentRow> {
  const db = getServiceClient()

  // Build update payload
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (updates.name !== undefined) payload.name = updates.name
  if (updates.description !== undefined) payload.description = updates.description
  if (updates.agentType !== undefined) payload.agent_type = updates.agentType
  if (updates.webhookUrl !== undefined) payload.webhook_url = updates.webhookUrl
  if (updates.mcpEndpoint !== undefined) payload.mcp_endpoint = updates.mcpEndpoint
  if (updates.a2aEndpoint !== undefined) payload.a2a_endpoint = updates.a2aEndpoint
  if (updates.modelProvider !== undefined) payload.model_provider = updates.modelProvider
  if (updates.modelId !== undefined) payload.model_id = updates.modelId
  if (updates.ratePerCall !== undefined) payload.rate_per_call = updates.ratePerCall
  if (updates.protocols !== undefined) payload.protocols = updates.protocols
  if (updates.metadata !== undefined) payload.metadata = updates.metadata

  // Re-embed if capabilities changed
  if (updates.capabilities !== undefined) {
    payload.capabilities = updates.capabilities

    // Need current agent data for embedding context
    const { data: current } = await db
      .from('agents')
      .select('name, description, agent_type')
      .eq('id', agentId)
      .single()

    if (current) {
      const embedding = await embedCapabilities({
        name: (updates.name as string) || current.name,
        description: (updates.description as string) ?? current.description,
        capabilities: updates.capabilities,
        agent_type: (updates.agentType as string) || current.agent_type,
      })
      payload.capability_embedding = `[${embedding.join(',')}]`
    }
  }

  const { data, error } = await db
    .from('agents')
    .update(payload)
    .eq('id', agentId)
    .eq('owner_id', ownerId)
    .select('*')
    .single()

  if (error) throw new Error(`Failed to update agent: ${error.message}`)
  return data as AgentRow
}

export async function getAgent(agentId: string): Promise<AgentRow | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single()
  return data as AgentRow | null
}

export async function getAgentsByOwner(ownerId: string): Promise<AgentRow[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('agents')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  return (data || []) as AgentRow[]
}

export async function deactivateAgent(agentId: string, ownerId: string): Promise<boolean> {
  const db = getServiceClient()
  const { error } = await db
    .from('agents')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', agentId)
    .eq('owner_id', ownerId)
  return !error
}

export async function updateAgentStatus(agentId: string, status: string): Promise<void> {
  const db = getServiceClient()
  await db
    .from('agents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', agentId)
}

// ============================================================
// SEMANTIC MATCHMAKING (KNN via pgvector)
// ============================================================

export async function searchAgentsByCapability(
  queryText: string,
  limit = 10,
  minTrust?: number,
): Promise<AgentMatchResult[]> {
  const db = getServiceClient()
  const embedding = await generateEmbedding(queryText)

  // Use RPC for vector similarity search since Supabase JS doesn't support <=> operator directly
  const { data, error } = await db.rpc('match_agents_by_capability', {
    query_embedding: `[${embedding.join(',')}]`,
    match_count: limit,
    min_trust: minTrust || 0,
  })

  if (error) {
    // Fallback: if RPC doesn't exist yet, do a basic text search
    console.error('match_agents_by_capability RPC error:', error.message)
    return searchAgentsByText(queryText, limit)
  }

  return (data || []) as AgentMatchResult[]
}

export async function searchAgentsByVector(
  embedding: number[],
  limit = 10,
  minTrust?: number,
): Promise<AgentMatchResult[]> {
  const db = getServiceClient()

  const { data, error } = await db.rpc('match_agents_by_capability', {
    query_embedding: `[${embedding.join(',')}]`,
    match_count: limit,
    min_trust: minTrust || 0,
  })

  if (error) {
    console.error('match_agents_by_capability RPC error:', error.message)
    return []
  }

  return (data || []) as AgentMatchResult[]
}

async function searchAgentsByText(queryText: string, limit = 10): Promise<AgentMatchResult[]> {
  const db = getServiceClient()
  const terms = queryText.toLowerCase().split(/\s+/)

  const { data } = await db
    .from('agents')
    .select('*')
    .eq('status', 'active')
    .order('trust_score', { ascending: false })
    .limit(limit * 3) // Over-fetch for filtering

  if (!data) return []

  // Client-side capability matching
  const scored = data
    .map(agent => {
      const agentCaps = (agent.capabilities || []).map((c: string) => c.toLowerCase())
      const agentDesc = `${agent.name} ${agent.description || ''} ${agentCaps.join(' ')}`.toLowerCase()
      const matchCount = terms.filter(t => agentDesc.includes(t)).length
      return { ...agent, distance: matchCount > 0 ? 1 - matchCount / terms.length : 2 }
    })
    .filter(a => a.distance < 2)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)

  return scored as AgentMatchResult[]
}

// ============================================================
// AGENT STATS (Admin)
// ============================================================

export async function getAgentStats(): Promise<AgentStats> {
  const db = getServiceClient()
  const now = new Date()
  const since24h = new Date(now)
  since24h.setHours(since24h.getHours() - 24)
  const since30d = new Date(now)
  since30d.setDate(since30d.getDate() - 30)

  const [
    { data: agents },
    { count: activeSwarms },
    { count: totalSwarms },
    { count: events24h },
    { data: earnings },
  ] = await Promise.all([
    db.from('agents').select('status, agent_type, trust_score'),
    db.from('agent_swarms').select('id', { count: 'exact', head: true })
      .in('status', ['forming', 'active']),
    db.from('agent_swarms').select('id', { count: 'exact', head: true }),
    db.from('agent_event_log').select('id', { count: 'exact', head: true })
      .gte('created_at', since24h.toISOString()),
    db.from('agents').select('total_earned_usd')
      .eq('status', 'active'),
  ])

  const allAgents = agents || []
  const active = allAgents.filter(a => a.status === 'active')
  const suspended = allAgents.filter(a => a.status === 'suspended')
  const avgTrust = active.length > 0
    ? active.reduce((sum, a) => sum + Number(a.trust_score), 0) / active.length
    : 0

  const byType: Record<string, number> = {}
  for (const a of allAgents) {
    byType[a.agent_type] = (byType[a.agent_type] || 0) + 1
  }

  const agentRevenue30d = (earnings || []).reduce((sum, a) => sum + Number(a.total_earned_usd), 0)

  return {
    totalAgents: allAgents.length,
    activeAgents: active.length,
    suspendedAgents: suspended.length,
    avgTrustScore: Number(avgTrust.toFixed(4)),
    byType,
    totalSwarms: totalSwarms || 0,
    activeSwarms: activeSwarms || 0,
    events24h: events24h || 0,
    agentRevenue30d,
  }
}

// ============================================================
// SWARM QUERIES
// ============================================================

export async function getActiveSwarms() {
  const db = getServiceClient()

  const { data: swarms } = await db
    .from('agent_swarms')
    .select('*, swarm_members(id, agent_id, role, joined_at)')
    .in('status', ['forming', 'active'])
    .order('created_at', { ascending: false })

  return swarms || []
}

// ============================================================
// EVENT LOG QUERIES
// ============================================================

export async function getAgentEventLog(limit = 50, eventType?: string) {
  const db = getServiceClient()

  let query = db
    .from('agent_event_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (eventType) {
    query = query.eq('event_type', eventType)
  }

  const { data } = await query
  return data || []
}

// ============================================================
// AGENT LIST (Admin - paginated)
// ============================================================

export async function getAgentList(opts: {
  page?: number
  perPage?: number
  type?: string
  status?: string
} = {}): Promise<{ agents: AgentRow[]; total: number }> {
  const db = getServiceClient()
  const { page = 1, perPage = 20, type, status } = opts
  const from = (page - 1) * perPage

  let query = db
    .from('agents')
    .select('*', { count: 'exact' })

  if (type) query = query.eq('agent_type', type)
  if (status) query = query.eq('status', status)

  const { data, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1)

  return {
    agents: (data || []) as AgentRow[],
    total: count || 0,
  }
}
