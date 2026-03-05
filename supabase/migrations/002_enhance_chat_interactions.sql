-- ============================================
-- Migration: Enhance chat tables for interaction tracking
-- ============================================

-- 1. Allow anonymous users in chat_conversations (make user_id nullable)
ALTER TABLE chat_conversations ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add tracking columns to chat_conversations
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS session_id text;

-- 3. Add tracking columns to chat_messages
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS cited_chunk_ids uuid[] DEFAULT '{}';

-- 4. Index for fast lookups by book (author dashboard queries)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_book_id ON chat_conversations(book_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message ON chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);

-- 5. RLS policies for author access to conversations about their books
-- Authors can read all conversations for books they own
CREATE POLICY "Authors can view conversations for their books"
  ON chat_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN authors a ON a.id = b.author_id
      WHERE b.id = chat_conversations.book_id
      AND a.user_id = auth.uid()
    )
  );

-- Authors can read all messages in conversations for their books
CREATE POLICY "Authors can view messages for their book conversations"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_conversations cc
      JOIN books b ON b.id = cc.book_id
      JOIN authors a ON a.id = b.author_id
      WHERE cc.id = chat_messages.conversation_id
      AND a.user_id = auth.uid()
    )
  );

-- Service role can insert conversations and messages (API route uses service role)
-- No additional policy needed since service role bypasses RLS
