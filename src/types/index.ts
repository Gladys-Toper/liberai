export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  bio: string | null
  created_at: string
}

export interface Author {
  id: string
  user_id: string
  display_name: string
  bio: string
  avatar_url: string | null
  website: string | null
  social_links: Record<string, string>
  verified: boolean
  created_at: string
}

export interface Book {
  id: string
  author_id: string
  title: string
  subtitle: string | null
  description: string
  cover_url: string | null
  genre: string
  tags: string[]
  language: string
  published_at: string | null
  is_published: boolean
  price: number
  ai_enabled: boolean
  ai_config: BookAIConfig
  total_chapters: number
  estimated_reading_time: number
  created_at: string
}

export interface BookAIConfig {
  model: 'claude' | 'gpt' | 'gemini'
  system_prompt: string | null
  temperature: number
  max_context_chunks: number
}

export interface Chapter {
  id: string
  book_id: string
  title: string
  content: string
  chapter_number: number
  word_count: number
}

export interface BookChunk {
  id: string
  book_id: string
  chapter_id: string
  content: string
  embedding: number[]
  chunk_index: number
  metadata: Record<string, unknown>
}

export interface ReadingProgress {
  id: string
  user_id: string
  book_id: string
  chapter_id: string
  progress: number
  last_read_at: string
}

export interface ChatConversation {
  id: string
  user_id: string
  book_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  created_at: string
}

export interface Citation {
  chapter_id: string
  chapter_title: string
  chunk_content: string
  relevance_score: number
}

export interface SocialConnection {
  id: string
  user_id: string
  platform: 'twitter' | 'tiktok'
  platform_user_id: string
  username: string
  is_following: boolean
  verified_at: string | null
}

export interface Order {
  id: string
  user_id: string
  book_id: string
  type: 'digital' | 'print'
  status: 'pending' | 'completed' | 'shipped'
  amount: number
  created_at: string
}

export interface MarketplaceFilters {
  genre?: string
  minPrice?: number
  maxPrice?: number
  aiEnabled?: boolean
  search?: string
  sort?: 'newest' | 'popular' | 'price-low' | 'price-high'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface BookWithAuthor extends Book {
  author: Author
}

export interface AnalyticsOverview {
  totalReaders: number
  totalConversations: number
  totalRevenue: number
  avgRating: number
  readersTrend: number
  conversationsTrend: number
  revenueTrend: number
}
