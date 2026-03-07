-- Sprint 8: Multi-Model Arena, Prediction Market & Sponsorships
-- Tables: pug_wallets, pug_pools, pug_bets, arena_sponsors, debate_sponsor_assignments
-- Alterations: debate_sessions (model_a, model_b columns)
-- Functions: place_pug_bet, settle_pug_pool, grant_pug_bonus

-- ============================================================================
-- 1. ADD MODEL TRACKING TO DEBATE SESSIONS
-- ============================================================================

ALTER TABLE debate_sessions ADD COLUMN IF NOT EXISTS model_a VARCHAR(20) DEFAULT 'gemini';
ALTER TABLE debate_sessions ADD COLUMN IF NOT EXISTS model_b VARCHAR(20) DEFAULT 'gemini';

-- ============================================================================
-- 2. PUG WALLETS — Virtual currency for prediction market
-- ============================================================================

CREATE TABLE IF NOT EXISTS pug_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 1000,  -- signup bonus
  total_earned BIGINT NOT NULL DEFAULT 1000,
  total_wagered BIGINT NOT NULL DEFAULT 0,
  total_won BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  CONSTRAINT positive_balance CHECK (balance >= 0)
);

ALTER TABLE pug_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pug_wallets_own_read" ON pug_wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "pug_wallets_service" ON pug_wallets
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. PUG POOLS — Per-debate betting pools
-- ============================================================================

CREATE TABLE IF NOT EXISTS pug_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  pool_a BIGINT NOT NULL DEFAULT 0,
  pool_b BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'locked', 'settled', 'refunded'
  )),
  settled_side VARCHAR(1) CHECK (settled_side IN ('a', 'b')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  UNIQUE(session_id)
);

CREATE INDEX idx_pug_pools_session ON pug_pools(session_id);

ALTER TABLE pug_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pug_pools_read" ON pug_pools
  FOR SELECT USING (true);

CREATE POLICY "pug_pools_service" ON pug_pools
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 4. PUG BETS — Individual user bets
-- ============================================================================

CREATE TABLE IF NOT EXISTS pug_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES pug_pools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side VARCHAR(1) NOT NULL CHECK (side IN ('a', 'b')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  payout BIGINT,  -- null until settled
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pool_id, user_id)  -- one bet per user per debate
);

CREATE INDEX idx_pug_bets_pool ON pug_bets(pool_id);
CREATE INDEX idx_pug_bets_user ON pug_bets(user_id);

ALTER TABLE pug_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pug_bets_own_read" ON pug_bets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "pug_bets_service" ON pug_bets
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 5. ARENA SPONSORS — Sponsor registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS arena_sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tagline TEXT,
  logo_url TEXT,
  tier VARCHAR(10) NOT NULL DEFAULT 'bronze' CHECK (tier IN ('gold', 'silver', 'bronze')),
  context_prompt TEXT,  -- injected into commentator system prompt
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE arena_sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arena_sponsors_read" ON arena_sponsors
  FOR SELECT USING (true);

CREATE POLICY "arena_sponsors_service" ON arena_sponsors
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 6. DEBATE SPONSOR ASSIGNMENTS — Sponsor-debate mapping
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_sponsor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  sponsor_id UUID NOT NULL REFERENCES arena_sponsors(id) ON DELETE CASCADE,
  chyron_text TEXT,
  inserted_at_round INT,  -- null = all rounds
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debate_sponsors_session ON debate_sponsor_assignments(session_id);

ALTER TABLE debate_sponsor_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debate_sponsors_read" ON debate_sponsor_assignments
  FOR SELECT USING (true);

CREATE POLICY "debate_sponsors_service" ON debate_sponsor_assignments
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 7. ATOMIC WALLET FUNCTIONS
-- ============================================================================

-- Place a bet: atomic debit wallet + insert bet + update pool
CREATE OR REPLACE FUNCTION place_pug_bet(
  p_user_id UUID,
  p_pool_id UUID,
  p_side VARCHAR(1),
  p_amount BIGINT
) RETURNS UUID AS $$
DECLARE
  v_bet_id UUID;
  v_pool_status VARCHAR(20);
  v_balance BIGINT;
BEGIN
  -- Check pool is open
  SELECT status INTO v_pool_status FROM pug_pools WHERE id = p_pool_id FOR UPDATE;
  IF v_pool_status IS NULL THEN
    RAISE EXCEPTION 'Pool not found';
  END IF;
  IF v_pool_status != 'open' THEN
    RAISE EXCEPTION 'Pool is %, not open', v_pool_status;
  END IF;

  -- Check & debit wallet (auto-create if not exists)
  INSERT INTO pug_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM pug_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_balance, p_amount;
  END IF;

  UPDATE pug_wallets
    SET balance = balance - p_amount,
        total_wagered = total_wagered + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

  -- Insert bet
  INSERT INTO pug_bets (pool_id, user_id, side, amount)
    VALUES (p_pool_id, p_user_id, p_side, p_amount)
    RETURNING id INTO v_bet_id;

  -- Update pool totals
  IF p_side = 'a' THEN
    UPDATE pug_pools SET pool_a = pool_a + p_amount WHERE id = p_pool_id;
  ELSE
    UPDATE pug_pools SET pool_b = pool_b + p_amount WHERE id = p_pool_id;
  END IF;

  RETURN v_bet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Settle a pool: calculate pari-mutuel payouts and credit winners
CREATE OR REPLACE FUNCTION settle_pug_pool(
  p_pool_id UUID,
  p_winning_side VARCHAR(1)
) RETURNS VOID AS $$
DECLARE
  v_total_pool BIGINT;
  v_winning_pool BIGINT;
  v_bet RECORD;
BEGIN
  -- Lock pool
  UPDATE pug_pools
    SET status = 'settled',
        settled_side = p_winning_side,
        settled_at = now()
    WHERE id = p_pool_id AND status IN ('open', 'locked');

  -- Calculate totals
  SELECT pool_a + pool_b INTO v_total_pool FROM pug_pools WHERE id = p_pool_id;
  IF p_winning_side = 'a' THEN
    SELECT pool_a INTO v_winning_pool FROM pug_pools WHERE id = p_pool_id;
  ELSE
    SELECT pool_b INTO v_winning_pool FROM pug_pools WHERE id = p_pool_id;
  END IF;

  -- If no one bet on the winning side, refund everyone
  IF v_winning_pool = 0 THEN
    UPDATE pug_pools SET status = 'refunded' WHERE id = p_pool_id;
    FOR v_bet IN SELECT * FROM pug_bets WHERE pool_id = p_pool_id LOOP
      UPDATE pug_wallets
        SET balance = balance + v_bet.amount,
            updated_at = now()
        WHERE user_id = v_bet.user_id;
      UPDATE pug_bets SET payout = v_bet.amount WHERE id = v_bet.id;
    END LOOP;
    RETURN;
  END IF;

  -- Pari-mutuel payout: each winner gets (their_bet / winning_pool) * total_pool
  FOR v_bet IN SELECT * FROM pug_bets WHERE pool_id = p_pool_id LOOP
    IF v_bet.side = p_winning_side THEN
      DECLARE v_payout BIGINT;
      BEGIN
        v_payout := (v_bet.amount * v_total_pool) / v_winning_pool;
        UPDATE pug_wallets
          SET balance = balance + v_payout,
              total_won = total_won + v_payout,
              updated_at = now()
          WHERE user_id = v_bet.user_id;
        UPDATE pug_bets SET payout = v_payout WHERE id = v_bet.id;
      END;
    ELSE
      -- Losers get 0 payout
      UPDATE pug_bets SET payout = 0 WHERE id = v_bet.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant bonus PUG to a user (admin operation)
CREATE OR REPLACE FUNCTION grant_pug_bonus(
  p_user_id UUID,
  p_amount BIGINT,
  p_reason TEXT DEFAULT 'bonus'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO pug_wallets (user_id, balance, total_earned)
    VALUES (p_user_id, 1000 + p_amount, 1000 + p_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = pug_wallets.balance + p_amount,
        total_earned = pug_wallets.total_earned + p_amount,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
