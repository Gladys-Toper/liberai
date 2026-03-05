-- ============================================
-- Migration: Analytics functions + generated assets table
-- ============================================

-- 1. Generated assets table (for infographics, media)
CREATE TABLE IF NOT EXISTS generated_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  asset_type VARCHAR(50) NOT NULL DEFAULT 'infographic',
  title VARCHAR(255),
  storage_path TEXT NOT NULL,
  public_url TEXT,
  generation_prompt TEXT,
  style_preset VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_generated_assets_book_id ON generated_assets(book_id);
CREATE INDEX idx_generated_assets_type ON generated_assets(asset_type);

-- RLS: Authors can manage assets for their own books
ALTER TABLE generated_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors can view their book assets"
  ON generated_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN authors a ON a.id = b.author_id
      WHERE b.id = generated_assets.book_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Authors can insert assets for their books"
  ON generated_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books b
      JOIN authors a ON a.id = b.author_id
      WHERE b.id = generated_assets.book_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Authors can delete their book assets"
  ON generated_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN authors a ON a.id = b.author_id
      WHERE b.id = generated_assets.book_id
      AND a.user_id = auth.uid()
    )
  );

-- 2. Analytics indexes for fast time-series queries
CREATE INDEX IF NOT EXISTS idx_chat_conversations_book_created
  ON chat_conversations(book_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reading_progress_book_last_read
  ON reading_progress(book_id, last_read_at);

-- 3. Time-series function: daily stats for a single book
CREATE OR REPLACE FUNCTION get_book_daily_stats(
  p_book_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE(
  day DATE,
  conversation_count BIGINT,
  message_count BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date AS day
  ),
  daily_convos AS (
    SELECT
      created_at::date AS day,
      COUNT(*) AS cnt
    FROM chat_conversations
    WHERE book_id = p_book_id
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY created_at::date
  ),
  daily_msgs AS (
    SELECT
      cm.created_at::date AS day,
      COUNT(*) AS cnt
    FROM chat_messages cm
    JOIN chat_conversations cc ON cc.id = cm.conversation_id
    WHERE cc.book_id = p_book_id
      AND cm.created_at >= CURRENT_DATE - p_days
    GROUP BY cm.created_at::date
  )
  SELECT
    ds.day,
    COALESCE(dc.cnt, 0) AS conversation_count,
    COALESCE(dm.cnt, 0) AS message_count
  FROM date_series ds
  LEFT JOIN daily_convos dc ON dc.day = ds.day
  LEFT JOIN daily_msgs dm ON dm.day = ds.day
  ORDER BY ds.day;
$$;

-- 4. Time-series function: daily stats across all author's books
CREATE OR REPLACE FUNCTION get_author_daily_stats(
  p_author_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE(
  day DATE,
  conversation_count BIGINT,
  message_count BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH author_books AS (
    SELECT id FROM books WHERE author_id = p_author_id
  ),
  date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date AS day
  ),
  daily_convos AS (
    SELECT
      cc.created_at::date AS day,
      COUNT(*) AS cnt
    FROM chat_conversations cc
    WHERE cc.book_id IN (SELECT id FROM author_books)
      AND cc.created_at >= CURRENT_DATE - p_days
    GROUP BY cc.created_at::date
  ),
  daily_msgs AS (
    SELECT
      cm.created_at::date AS day,
      COUNT(*) AS cnt
    FROM chat_messages cm
    JOIN chat_conversations cc ON cc.id = cm.conversation_id
    WHERE cc.book_id IN (SELECT id FROM author_books)
      AND cm.created_at >= CURRENT_DATE - p_days
    GROUP BY cm.created_at::date
  )
  SELECT
    ds.day,
    COALESCE(dc.cnt, 0) AS conversation_count,
    COALESCE(dm.cnt, 0) AS message_count
  FROM date_series ds
  LEFT JOIN daily_convos dc ON dc.day = ds.day
  LEFT JOIN daily_msgs dm ON dm.day = ds.day
  ORDER BY ds.day;
$$;
