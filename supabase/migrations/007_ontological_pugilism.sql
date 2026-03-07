-- Sprint 7: Ontological Pugilism Arena
-- Tables: debate_sessions, debate_axioms, debate_rounds, debate_arguments
-- Extensions: agents (new agent_type values), activity_feed (new event types)

-- ============================================================================
-- 1. EXTEND AGENT TYPES
-- ============================================================================

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN (
    'reader', 'author_assistant', 'reviewer', 'researcher',
    'curator', 'translator', 'summarizer', 'custom',
    'debater', 'referee', 'commentator', 'synthesizer'
  ));

-- ============================================================================
-- 2. DEBATE SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID REFERENCES agent_swarms(id) ON DELETE SET NULL,
  book_a_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  book_b_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  agent_a_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_b_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  referee_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  commentator_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  synthesizer_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  crucible_question TEXT NOT NULL,
  max_rounds INT NOT NULL DEFAULT 5,
  current_round INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'setup' CHECK (status IN (
    'setup', 'extracting', 'active', 'paused', 'completed', 'abandoned'
  )),
  winner VARCHAR(1) CHECK (winner IN ('a', 'b')),
  win_condition VARCHAR(20) CHECK (win_condition IN ('knockout', 'hp_advantage', 'forfeit', 'draw')),
  synthesis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT different_books CHECK (book_a_id != book_b_id)
);

CREATE INDEX idx_debate_sessions_status ON debate_sessions(status);
CREATE INDEX idx_debate_sessions_initiated ON debate_sessions(initiated_by);
CREATE INDEX idx_debate_sessions_created ON debate_sessions(created_at DESC);

ALTER TABLE debate_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debate_sessions_read" ON debate_sessions
  FOR SELECT USING (true);

CREATE POLICY "debate_sessions_insert" ON debate_sessions
  FOR INSERT WITH CHECK (auth.uid() = initiated_by);

CREATE POLICY "debate_sessions_update" ON debate_sessions
  FOR UPDATE USING (auth.uid() = initiated_by);

-- Service role bypass for agent operations
CREATE POLICY "debate_sessions_service" ON debate_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. DEBATE AXIOMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_axioms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  side VARCHAR(1) NOT NULL CHECK (side IN ('a', 'b')),
  axiom_index INT NOT NULL CHECK (axiom_index >= 0 AND axiom_index <= 4),
  label TEXT NOT NULL,
  description TEXT,
  source_chunk_ids TEXT[] DEFAULT '{}',
  hp_current INT NOT NULL DEFAULT 100 CHECK (hp_current >= 0 AND hp_current <= 100),
  is_destroyed BOOLEAN NOT NULL DEFAULT false,
  destroyed_at_round INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, side, axiom_index)
);

CREATE INDEX idx_debate_axioms_session ON debate_axioms(session_id);

ALTER TABLE debate_axioms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debate_axioms_read" ON debate_axioms
  FOR SELECT USING (true);

CREATE POLICY "debate_axioms_service" ON debate_axioms
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 4. DEBATE ROUNDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  attacker_side VARCHAR(1) NOT NULL CHECK (attacker_side IN ('a', 'b')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'attacking', 'defending', 'judging', 'commenting', 'completed'
  )),
  hp_deltas JSONB DEFAULT '[]',
  commentary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(session_id, round_number)
);

CREATE INDEX idx_debate_rounds_session ON debate_rounds(session_id);

ALTER TABLE debate_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debate_rounds_read" ON debate_rounds
  FOR SELECT USING (true);

CREATE POLICY "debate_rounds_service" ON debate_rounds
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 5. DEBATE ARGUMENTS (Toulmin structured payloads)
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES debate_rounds(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  side VARCHAR(1) NOT NULL CHECK (side IN ('a', 'b')),
  move_type VARCHAR(20) NOT NULL CHECK (move_type IN ('attack', 'defense', 'concession')),
  target_axiom_id UUID REFERENCES debate_axioms(id) ON DELETE SET NULL,
  -- Toulmin model fields
  claim TEXT NOT NULL,
  grounds TEXT,
  warrant TEXT,
  backing TEXT,
  qualifier TEXT,
  rebuttal TEXT,
  -- Provenance
  source_chunk_ids TEXT[] DEFAULT '{}',
  source_quotes JSONB DEFAULT '[]',
  -- Referee assessment
  referee_verdict JSONB,
  -- Debug
  raw_llm_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debate_arguments_round ON debate_arguments(round_id);
CREATE INDEX idx_debate_arguments_session ON debate_arguments(session_id);

ALTER TABLE debate_arguments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debate_arguments_read" ON debate_arguments
  FOR SELECT USING (true);

CREATE POLICY "debate_arguments_service" ON debate_arguments
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 6. EXTEND ACTIVITY FEED EVENT TYPES
-- ============================================================================

ALTER TABLE activity_feed DROP CONSTRAINT IF EXISTS activity_feed_event_type_check;
ALTER TABLE activity_feed ADD CONSTRAINT activity_feed_event_type_check
  CHECK (event_type IN (
    'new_book', 'new_rating', 'new_follow', 'new_comment', 'book_update',
    'agent_registered', 'swarm_formed', 'swarm_dissolved', 'agent_task_completed',
    'agent_rating', 'trust_update',
    'debate_started', 'debate_round_completed', 'debate_axiom_destroyed',
    'debate_completed', 'debate_synthesis_generated'
  ));
