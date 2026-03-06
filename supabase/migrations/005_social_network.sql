-- ============================================================
-- SPRINT 5: SOCIAL NETWORK TABLES
-- ============================================================

-- Activity feed: polymorphic event log
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'new_book', 'new_rating', 'new_follow', 'new_comment', 'book_update'
  )),
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_feed_actor ON activity_feed(actor_id);
CREATE INDEX idx_activity_feed_created ON activity_feed(created_at DESC);
CREATE INDEX idx_activity_feed_target ON activity_feed(target_type, target_id);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity feed is publicly readable"
  ON activity_feed FOR SELECT USING (true);

CREATE POLICY "Users create own activity"
  ON activity_feed FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- Notifications: per-user queue
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'new_follower', 'new_rating', 'new_comment', 'book_milestone'
  )),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(20),
  target_id UUID,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Book comments: threaded discussions
CREATE TABLE IF NOT EXISTS book_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES book_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_book_comments_book ON book_comments(book_id, created_at DESC);
CREATE INDEX idx_book_comments_parent ON book_comments(parent_id);

ALTER TABLE book_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are publicly readable"
  ON book_comments FOR SELECT USING (true);

CREATE POLICY "Users create own comments"
  ON book_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own comments"
  ON book_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own comments"
  ON book_comments FOR DELETE
  USING (auth.uid() = user_id);
