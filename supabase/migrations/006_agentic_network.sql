-- Sprint 6: Agentic Social Network Layer
-- Tables: agents, agent_event_subscriptions, agent_event_log, agent_swarms, swarm_members,
--         trust_ledger, a2a_tasks, book_costs, platform_cost_snapshots, author_cost_rollups
-- Extensions: activity_feed (new event types + agent columns)

-- ============================================================================
-- 1. AGENT REGISTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  agent_type VARCHAR(30) NOT NULL CHECK (agent_type IN (
    'reader', 'author_assistant', 'reviewer', 'researcher',
    'curator', 'translator', 'summarizer', 'custom'
  )),
  -- Agent Card (capability manifest)
  capabilities TEXT[] DEFAULT '{}',
  capability_embedding vector(1536),
  protocols TEXT[] DEFAULT ARRAY['mcp','a2a'],
  model_provider VARCHAR(50),
  model_id VARCHAR(100),
  -- Endpoint config
  webhook_url TEXT,
  mcp_endpoint TEXT,
  a2a_endpoint TEXT,
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  last_heartbeat_at TIMESTAMPTZ,
  -- Trust (denormalized from trust_ledger)
  trust_score DECIMAL(5,4) DEFAULT 0.5000,
  total_interactions INTEGER DEFAULT 0,
  successful_interactions INTEGER DEFAULT 0,
  -- Economics
  rate_per_call DECIMAL(10,6) DEFAULT 0,
  total_earned_usd DECIMAL(12,4) DEFAULT 0,
  total_spent_usd DECIMAL(12,4) DEFAULT 0,
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_owner ON agents(owner_id);
CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_status ON agents(status) WHERE status = 'active';
CREATE INDEX idx_agents_capability_embedding ON agents USING IVFFLAT(capability_embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX idx_agents_trust ON agents(trust_score DESC) WHERE status = 'active';

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents are publicly discoverable" ON agents FOR SELECT USING (true);
CREATE POLICY "Owners insert own agents" ON agents FOR INSERT WITH CHECK (auth.uid()::text = owner_id);
CREATE POLICY "Owners update own agents" ON agents FOR UPDATE USING (auth.uid()::text = owner_id);
CREATE POLICY "Owners delete own agents" ON agents FOR DELETE USING (auth.uid()::text = owner_id);

-- Add FK from api_keys.agent_id → agents(id)
ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_agent
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. EVENT SUBSCRIPTIONS (Pub/Sub)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_pattern VARCHAR(50) NOT NULL,
  filter JSONB DEFAULT '{}',
  delivery VARCHAR(20) DEFAULT 'webhook' CHECK (delivery IN ('webhook', 'a2a', 'poll')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_subs_agent ON agent_event_subscriptions(agent_id) WHERE active = true;
CREATE INDEX idx_event_subs_pattern ON agent_event_subscriptions(event_pattern) WHERE active = true;

ALTER TABLE agent_event_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents read own subs" ON agent_event_subscriptions FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid()::text));
CREATE POLICY "Agents insert own subs" ON agent_event_subscriptions FOR INSERT
  WITH CHECK (agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid()::text));
CREATE POLICY "Agents update own subs" ON agent_event_subscriptions FOR UPDATE
  USING (agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid()::text));
CREATE POLICY "Agents delete own subs" ON agent_event_subscriptions FOR DELETE
  USING (agent_id IN (SELECT id FROM agents WHERE owner_id = auth.uid()::text));

-- Event audit log
CREATE TABLE IF NOT EXISTS agent_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id VARCHAR(36),
  dispatched_to UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_log_type ON agent_event_log(event_type, created_at DESC);
CREATE INDEX idx_event_log_created ON agent_event_log(created_at DESC);

ALTER TABLE agent_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Event log publicly readable" ON agent_event_log FOR SELECT USING (true);

-- ============================================================================
-- 3. EPHEMERAL SWARMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_swarms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  purpose TEXT NOT NULL,
  initiator_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'forming' CHECK (status IN (
    'forming', 'active', 'completing', 'dissolved', 'failed'
  )),
  task_type VARCHAR(50),
  target_type VARCHAR(20),
  target_id VARCHAR(36),
  max_members INTEGER DEFAULT 10,
  ttl_minutes INTEGER DEFAULT 60,
  formed_at TIMESTAMPTZ,
  dissolved_at TIMESTAMPTZ,
  result JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_swarms_status ON agent_swarms(status) WHERE status IN ('forming', 'active');
CREATE INDEX idx_swarms_initiator ON agent_swarms(initiator_id);
CREATE INDEX idx_swarms_target ON agent_swarms(target_type, target_id);

CREATE TABLE IF NOT EXISTS swarm_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES agent_swarms(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role VARCHAR(30) DEFAULT 'participant',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  contribution JSONB DEFAULT '{}',
  UNIQUE(swarm_id, agent_id)
);

CREATE INDEX idx_swarm_members_swarm ON swarm_members(swarm_id) WHERE left_at IS NULL;
CREATE INDEX idx_swarm_members_agent ON swarm_members(agent_id) WHERE left_at IS NULL;

ALTER TABLE agent_swarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Swarms are publicly readable" ON agent_swarms FOR SELECT USING (true);
CREATE POLICY "Swarm members publicly readable" ON swarm_members FOR SELECT USING (true);

-- ============================================================================
-- 4. TRUST LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS trust_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  interaction_type VARCHAR(30) NOT NULL,
  counterparty_type VARCHAR(20) NOT NULL,
  counterparty_id VARCHAR(36),
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'failure', 'timeout', 'partial')),
  confidence DECIMAL(5,4),
  accuracy DECIMAL(5,4),
  latency_ms INTEGER,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trust_ledger_agent ON trust_ledger(agent_id, created_at DESC);
CREATE INDEX idx_trust_ledger_outcome ON trust_ledger(agent_id, outcome);

ALTER TABLE trust_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trust ledger publicly readable" ON trust_ledger FOR SELECT USING (true);

-- ============================================================================
-- 5. A2A PERSISTENT TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS a2a_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  responder_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  requester_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  method VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'working', 'completed', 'failed', 'cancelled'
  )),
  input JSONB NOT NULL,
  output JSONB,
  error JSONB,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  paid BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_a2a_tasks_requester ON a2a_tasks(requester_agent_id, created_at DESC);
CREATE INDEX idx_a2a_tasks_responder ON a2a_tasks(responder_agent_id, status);
CREATE INDEX idx_a2a_tasks_status ON a2a_tasks(status) WHERE status IN ('pending', 'working');

ALTER TABLE a2a_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tasks publicly readable" ON a2a_tasks FOR SELECT USING (true);

-- ============================================================================
-- 6. COST TABLES (referenced by Sprint 4 cron but never migrated)
-- ============================================================================

CREATE TABLE IF NOT EXISTS book_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id VARCHAR(36) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cost_date DATE NOT NULL,
  cost_type VARCHAR(30) NOT NULL,
  amount_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
  units DECIMAL(18,4) DEFAULT 0,
  unit_label VARCHAR(30),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, cost_date, cost_type)
);

CREATE INDEX idx_book_costs_book_date ON book_costs(book_id, cost_date DESC);

CREATE TABLE IF NOT EXISTS platform_cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  cost_category VARCHAR(30) NOT NULL,
  amount_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, cost_category)
);

CREATE TABLE IF NOT EXISTS author_cost_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id VARCHAR(36) NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  rollup_date DATE NOT NULL,
  total_book_costs DECIMAL(12,4) DEFAULT 0,
  ai_costs DECIMAL(12,4) DEFAULT 0,
  storage_costs DECIMAL(12,4) DEFAULT 0,
  infra_costs DECIMAL(12,4) DEFAULT 0,
  total_revenue DECIMAL(12,4) DEFAULT 0,
  net_profit DECIMAL(12,4) DEFAULT 0,
  author_share DECIMAL(12,4) DEFAULT 0,
  platform_share DECIMAL(12,4) DEFAULT 0,
  split_liberai_pct DECIMAL(5,2) DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(author_id, rollup_date)
);

CREATE INDEX idx_author_rollups_date ON author_cost_rollups(author_id, rollup_date DESC);

ALTER TABLE book_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_cost_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE author_cost_rollups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Book costs readable" ON book_costs FOR SELECT USING (true);
CREATE POLICY "Platform snapshots readable" ON platform_cost_snapshots FOR SELECT USING (true);
CREATE POLICY "Author rollups readable" ON author_cost_rollups FOR SELECT USING (true);

-- ============================================================================
-- 7. EXTEND ACTIVITY FEED FOR AGENT EVENTS
-- ============================================================================

-- Widen the event_type check constraint
ALTER TABLE activity_feed DROP CONSTRAINT IF EXISTS activity_feed_event_type_check;
ALTER TABLE activity_feed ADD CONSTRAINT activity_feed_event_type_check
  CHECK (event_type IN (
    'new_book', 'new_rating', 'new_follow', 'new_comment', 'book_update',
    'agent_registered', 'swarm_formed', 'swarm_dissolved', 'agent_task_completed',
    'agent_rating', 'trust_update'
  ));

ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'human';
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;

-- ============================================================================
-- 8. SEMANTIC MATCHMAKING RPC (pgvector KNN)
-- ============================================================================

CREATE OR REPLACE FUNCTION match_agents_by_capability(
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  min_trust decimal DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name varchar,
  description text,
  agent_type varchar,
  capabilities text[],
  capability_embedding vector(1536),
  protocols text[],
  model_provider varchar,
  model_id varchar,
  webhook_url text,
  mcp_endpoint text,
  a2a_endpoint text,
  status varchar,
  last_heartbeat_at timestamptz,
  trust_score decimal,
  total_interactions int,
  successful_interactions int,
  rate_per_call decimal,
  total_earned_usd decimal,
  total_spent_usd decimal,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  distance float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.owner_id, a.name, a.description, a.agent_type,
    a.capabilities, a.capability_embedding, a.protocols,
    a.model_provider, a.model_id,
    a.webhook_url, a.mcp_endpoint, a.a2a_endpoint,
    a.status, a.last_heartbeat_at,
    a.trust_score, a.total_interactions, a.successful_interactions,
    a.rate_per_call, a.total_earned_usd, a.total_spent_usd,
    a.metadata, a.created_at, a.updated_at,
    (a.capability_embedding <=> query_embedding)::float AS distance
  FROM agents a
  WHERE a.status = 'active'
    AND a.capability_embedding IS NOT NULL
    AND a.trust_score >= min_trust
  ORDER BY a.capability_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
