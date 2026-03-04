-- ============================================================
-- Enable Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CREATE TRIGGER FUNCTION FOR UPDATED_AT
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  avatar_url TEXT,
  role VARCHAR(50) NOT NULL CHECK (role IN ('author', 'reader', 'admin')),
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- AUTHORS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS authors (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(255) NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  social_links JSONB DEFAULT '{}',
  total_books INTEGER DEFAULT 0,
  total_reads INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_authors_user_id ON authors(user_id);
CREATE INDEX idx_authors_verified ON authors(verified);

-- ============================================================
-- BOOKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS books (
  id VARCHAR(36) PRIMARY KEY,
  author_id VARCHAR(36) NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url TEXT,
  category VARCHAR(100) NOT NULL,
  tags TEXT[] DEFAULT '{}',
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  total_reads INTEGER DEFAULT 0,
  total_chats INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT FALSE,
  published_date TIMESTAMP WITH TIME ZONE,
  ai_config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_books_author_id ON books(author_id);
CREATE INDEX idx_books_category ON books(category);
CREATE INDEX idx_books_featured ON books(featured);
CREATE INDEX idx_books_tags ON books USING GIN(tags);
CREATE INDEX idx_books_price ON books(price);

-- ============================================================
-- CHAPTERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chapters (
  id VARCHAR(36) PRIMARY KEY,
  book_id VARCHAR(36) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content TEXT,
  word_count INTEGER DEFAULT 0,
  reading_time_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(book_id, chapter_number)
);

CREATE INDEX idx_chapters_book_id ON chapters(book_id);

-- ============================================================
-- BOOK_CHUNKS TABLE (for vector embeddings)
-- ============================================================
CREATE TABLE IF NOT EXISTS book_chunks (
  id VARCHAR(36) PRIMARY KEY,
  chapter_id VARCHAR(36) NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  book_id VARCHAR(36) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_book_chunks_chapter_id ON book_chunks(chapter_id);
CREATE INDEX idx_book_chunks_book_id ON book_chunks(book_id);
CREATE INDEX idx_book_chunks_embedding ON book_chunks USING IVFFLAT(embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- READING_PROGRESS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS reading_progress (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id VARCHAR(36) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  current_chapter_id VARCHAR(36) REFERENCES chapters(id),
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  last_read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, book_id)
);

CREATE INDEX idx_reading_progress_user_id ON reading_progress(user_id);
CREATE INDEX idx_reading_progress_book_id ON reading_progress(book_id);
CREATE INDEX idx_reading_progress_last_read ON reading_progress(last_read_at);

-- ============================================================
-- CHAT_CONVERSATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id VARCHAR(36) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX idx_chat_conversations_book_id ON chat_conversations(book_id);
CREATE INDEX idx_chat_conversations_created_at ON chat_conversations(created_at);

-- ============================================================
-- CHAT_MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_role ON chat_messages(role);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- ============================================================
-- SOCIAL_CONNECTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS social_connections (
  id VARCHAR(36) PRIMARY KEY,
  follower_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

CREATE INDEX idx_social_connections_follower ON social_connections(follower_id);
CREATE INDEX idx_social_connections_following ON social_connections(following_id);

-- ============================================================
-- BOOK_RATINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS book_ratings (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id VARCHAR(36) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, book_id)
);

CREATE INDEX idx_book_ratings_book_id ON book_ratings(book_id);
CREATE INDEX idx_book_ratings_user_id ON book_ratings(user_id);

-- ============================================================
-- ORDERS TABLE (for purchasing)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id VARCHAR(36) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_book_id ON orders(book_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ============================================================
-- CATEGORIES TABLE (reference)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Seed categories
INSERT INTO categories (id, name, description, created_at) VALUES
  ('cat-1', 'History', 'Historical works and analysis', CURRENT_TIMESTAMP),
  ('cat-2', 'Neuroscience', 'Brain science and cognitive research', CURRENT_TIMESTAMP),
  ('cat-3', 'Business', 'Business, leadership, and entrepreneurship', CURRENT_TIMESTAMP),
  ('cat-4', 'Psychology', 'Psychology, behavior, and mental health', CURRENT_TIMESTAMP),
  ('cat-5', 'Technology', 'Technology, AI, and software engineering', CURRENT_TIMESTAMP),
  ('cat-6', 'Philosophy', 'Philosophy and wisdom traditions', CURRENT_TIMESTAMP),
  ('cat-7', 'Science', 'General science and research', CURRENT_TIMESTAMP),
  ('cat-8', 'Self-Help', 'Personal development and self-improvement', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Books: Public read, authenticated write
CREATE POLICY "Books are publicly readable"
  ON books FOR SELECT USING (true);

CREATE POLICY "Only authors can create books"
  ON books FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Chapters: Public read
CREATE POLICY "Chapters are publicly readable"
  ON chapters FOR SELECT USING (true);

-- Book chunks: Public read
CREATE POLICY "Book chunks are publicly readable"
  ON book_chunks FOR SELECT USING (true);

-- Reading progress: Users can only read/write their own
CREATE POLICY "Users can only view their own reading progress"
  ON reading_progress FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can only insert their own reading progress"
  ON reading_progress FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can only update their own reading progress"
  ON reading_progress FOR UPDATE
  USING (auth.uid()::text = user_id);

-- Chat conversations: Users can only read/write their own
CREATE POLICY "Users can only view their own conversations"
  ON chat_conversations FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can only create their own conversations"
  ON chat_conversations FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Chat messages: Public read conversations they have access to, can insert to own
CREATE POLICY "Users can read messages from their conversations"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert messages to their conversations"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = conversation_id
      AND chat_conversations.user_id = auth.uid()::text
    )
  );

-- Book ratings: Public read, authenticated write own
CREATE POLICY "Ratings are publicly readable"
  ON book_ratings FOR SELECT USING (true);

CREATE POLICY "Users can only write their own ratings"
  ON book_ratings FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Orders: Users can only read their own
CREATE POLICY "Users can only view their own orders"
  ON orders FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can only insert their own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- View for books with author information
CREATE OR REPLACE VIEW books_with_authors AS
SELECT
  b.id,
  b.author_id,
  b.title,
  b.description,
  b.cover_url,
  b.category,
  b.tags,
  b.price,
  b.currency,
  b.total_reads,
  b.total_chats,
  b.average_rating,
  b.rating_count,
  b.featured,
  b.published_date,
  b.ai_config,
  b.created_at,
  b.updated_at,
  a.id as author_id,
  a.user_id,
  a.display_name,
  a.bio as author_bio,
  a.avatar_url as author_avatar,
  a.verified
FROM books b
LEFT JOIN authors a ON b.author_id = a.id;

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Composite indexes for common queries
CREATE INDEX idx_books_featured_reads ON books(featured, total_reads DESC);
CREATE INDEX idx_books_category_rating ON books(category, average_rating DESC);
CREATE INDEX idx_reading_progress_user_updated ON reading_progress(user_id, updated_at DESC);
CREATE INDEX idx_chat_conversations_user_updated ON chat_conversations(user_id, updated_at DESC);

