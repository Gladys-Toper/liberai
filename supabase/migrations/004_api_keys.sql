-- ============================================================
-- API KEYS TABLE
-- ============================================================
-- Enables programmatic access for authors, admins, and agents.
-- Key format: lbr_live_<32 hex chars> — shown once, stored as SHA-256 hash.

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_prefix VARCHAR(12) NOT NULL,
  key_hash TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('author', 'admin', 'agent')),
  author_id UUID REFERENCES authors(id),
  agent_id UUID,                                     -- Sprint 6: REFERENCES agents(id)
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  rate_limit_rpm INT DEFAULT 60,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_owner ON api_keys(owner_id);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys
CREATE POLICY "Users can view own api keys"
  ON api_keys FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own api keys"
  ON api_keys FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own api keys"
  ON api_keys FOR UPDATE
  USING (owner_id = auth.uid());
