// @ts-nocheck
// This entire mock data layer will be replaced with real Supabase queries
import type {
  Book, Author, Chapter, BookChunk, User, ReadingProgress,
  ChatConversation, ChatMessage, MarketplaceFilters, BookWithAuthor,
  PaginatedResponse, AnalyticsOverview
} from "@/types";
import {
  mockUsers, mockAuthors, mockBooks, mockChapters, mockChunks,
  mockReadingProgress, mockConversations, mockMessages, mockBooksWithAuthors,
  mockSocialConnections
} from "./mock-data";

// ============================================================
// BOOKS
// ============================================================

export async function getBooks(
  filters?: MarketplaceFilters,
  page = 1,
  perPage = 12
): Promise<PaginatedResponse<BookWithAuthor>> {
  let results = [...mockBooksWithAuthors];

  // Apply search filter
  if (filters?.search) {
    const query = filters.search.toLowerCase();
    results = results.filter(book =>
      book.title.toLowerCase().includes(query) ||
      book.description.toLowerCase().includes(query) ||
      book.author.display_name.toLowerCase().includes(query)
    );
  }

  // Apply category filter
  if (filters?.category) {
    results = results.filter(book => book.category === filters.category);
  }

  // Apply tags filter
  if (filters?.tags && filters.tags.length > 0) {
    results = results.filter(book =>
      filters.tags!.some(tag => book.tags.includes(tag))
    );
  }

  // Apply sorting
  if (filters?.sort_by) {
    switch (filters.sort_by) {
      case "newest":
        results.sort((a, b) =>
          new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
        );
        break;
      case "most_read":
        results.sort((a, b) => b.total_reads - a.total_reads);
        break;
      case "highest_rated":
        results.sort((a, b) => b.average_rating - a.average_rating);
        break;
      case "price_low_to_high":
        results.sort((a, b) => a.price - b.price);
        break;
      case "price_high_to_low":
        results.sort((a, b) => b.price - a.price);
        break;
      default:
        break;
    }
  }

  // Paginate
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const paginatedResults = results.slice(start, end);

  return {
    data: paginatedResults,
    pagination: {
      page,
      perPage,
      total: results.length,
      hasMore: end < results.length,
    },
  };
}

export async function getBook(id: string): Promise<BookWithAuthor | null> {
  return mockBooksWithAuthors.find(b => b.id === id) || null;
}

export async function getFeaturedBooks(): Promise<BookWithAuthor[]> {
  return mockBooksWithAuthors
    .filter(b => b.featured)
    .sort((a, b) => b.total_reads - a.total_reads)
    .slice(0, 6);
}

export async function getBooksByAuthor(authorId: string): Promise<Book[]> {
  return mockBooks.filter(b => b.author_id === authorId);
}

export async function searchBooks(query: string): Promise<BookWithAuthor[]> {
  const lowerQuery = query.toLowerCase();
  return mockBooksWithAuthors.filter(book =>
    book.title.toLowerCase().includes(lowerQuery) ||
    book.description.toLowerCase().includes(lowerQuery) ||
    book.author.display_name.toLowerCase().includes(lowerQuery) ||
    book.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

// ============================================================
// AUTHORS
// ============================================================

export async function getAuthor(id: string): Promise<Author | null> {
  return mockAuthors.find(a => a.id === id) || null;
}

export async function getAuthors(): Promise<Author[]> {
  return mockAuthors;
}

// ============================================================
// CHAPTERS
// ============================================================

export async function getChapters(bookId: string): Promise<Chapter[]> {
  return mockChapters.filter(c => c.book_id === bookId);
}

export async function getChapter(id: string): Promise<Chapter | null> {
  return mockChapters.find(c => c.id === id) || null;
}

// ============================================================
// BOOK CHUNKS
// ============================================================

export async function getChunksByChapter(chapterId: string): Promise<BookChunk[]> {
  return mockChunks.filter(c => c.chapter_id === chapterId);
}

export async function getChunksByBook(bookId: string): Promise<BookChunk[]> {
  return mockChunks.filter(c => c.book_id === bookId);
}

// ============================================================
// READING PROGRESS
// ============================================================

export async function getReadingProgress(
  userId: string,
  bookId: string
): Promise<ReadingProgress | null> {
  return (
    mockReadingProgress.find(p => p.user_id === userId && p.book_id === bookId) || null
  );
}

export async function getUserLibrary(
  userId: string
): Promise<(BookWithAuthor & { progress: ReadingProgress })[]> {
  const progressEntries = mockReadingProgress.filter(p => p.user_id === userId);

  return progressEntries
    .map(progress => {
      const book = mockBooksWithAuthors.find(b => b.id === progress.book_id);
      if (!book) return null;
      return {
        ...book,
        progress,
      };
    })
    .filter((item): item is BookWithAuthor & { progress: ReadingProgress } => item !== null);
}

export async function updateReadingProgress(
  userId: string,
  bookId: string,
  currentChapterId: string,
  progressPercent: number
): Promise<ReadingProgress> {
  const existing = mockReadingProgress.find(p => p.user_id === userId && p.book_id === bookId);
  if (existing) {
    existing.current_chapter_id = currentChapterId;
    existing.progress_percent = progressPercent;
    existing.last_read_at = new Date().toISOString();
    existing.updated_at = new Date().toISOString();
    return existing;
  }

  const newProgress: ReadingProgress = {
    id: `progress-${Date.now()}`,
    user_id: userId,
    book_id: bookId,
    current_chapter_id: currentChapterId,
    progress_percent: progressPercent,
    last_read_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  mockReadingProgress.push(newProgress);
  return newProgress;
}

// ============================================================
// CHAT
// ============================================================

export async function getConversations(
  userId: string,
  bookId: string
): Promise<ChatConversation[]> {
  return mockConversations.filter(c => c.user_id === userId && c.book_id === bookId);
}

export async function getConversation(id: string): Promise<ChatConversation | null> {
  return mockConversations.find(c => c.id === id) || null;
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  return mockMessages.filter(m => m.conversation_id === conversationId);
}

export async function createConversation(
  userId: string,
  bookId: string,
  title: string
): Promise<ChatConversation> {
  const newConversation: ChatConversation = {
    id: `conv-${Date.now()}`,
    user_id: userId,
    book_id: bookId,
    title,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    message_count: 0,
  };

  mockConversations.push(newConversation);
  return newConversation;
}

export async function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  citations?: Array<{ chapter_id: string; passage: string; relevance: number }>
): Promise<ChatMessage> {
  const newMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    conversation_id: conversationId,
    role,
    content,
    citations: citations || [],
    created_at: new Date().toISOString(),
  };

  mockMessages.push(newMessage);

  // Update conversation
  const conversation = mockConversations.find(c => c.id === conversationId);
  if (conversation) {
    conversation.message_count += 1;
    conversation.updated_at = new Date().toISOString();
  }

  return newMessage;
}

// ============================================================
// CATEGORIES & ANALYTICS
// ============================================================

export async function getCategories(): Promise<{ name: string; count: number }[]> {
  const categoryMap = new Map<string, number>();

  mockBooks.forEach(book => {
    const count = categoryMap.get(book.category) || 0;
    categoryMap.set(book.category, count + 1);
  });

  return Array.from(categoryMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));
}

export async function getAuthorAnalytics(authorId: string): Promise<AnalyticsOverview> {
  const author = mockAuthors.find(a => a.id === authorId);
  const authorBooks = mockBooks.filter(b => b.author_id === authorId);

  const totalReads = authorBooks.reduce((sum, b) => sum + b.total_reads, 0);
  const totalChats = authorBooks.reduce((sum, b) => sum + b.total_chats, 0);
  const avgRating =
    authorBooks.length > 0
      ? authorBooks.reduce((sum, b) => sum + b.average_rating, 0) / authorBooks.length
      : 0;

  return {
    author: author!,
    books: authorBooks,
    totalReads,
    totalChats,
    averageRating: Math.round(avgRating * 10) / 10,
    totalReaders: Math.floor(totalReads / 5), // Estimate
  };
}

// ============================================================
// USERS
// ============================================================

export async function getUser(id: string): Promise<User | null> {
  return mockUsers.find(u => u.id === id) || null;
}

export async function getCurrentUser(): Promise<User> {
  // Returns mock user-1 (author user) for demo purposes
  return mockUsers[0];
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return mockUsers.find(u => u.email === email) || null;
}

// ============================================================
// SOCIAL
// ============================================================

export async function getFollowers(userId: string): Promise<User[]> {
  const followerIds = mockSocialConnections
    .filter(c => c.following_id === userId)
    .map(c => c.follower_id);

  return mockUsers.filter(u => followerIds.includes(u.id));
}

export async function getFollowing(userId: string): Promise<User[]> {
  const followingIds = mockSocialConnections
    .filter(c => c.follower_id === userId)
    .map(c => c.following_id);

  return mockUsers.filter(u => followingIds.includes(u.id));
}

export async function isFollowing(userId: string, targetId: string): Promise<boolean> {
  return mockSocialConnections.some(
    c => c.follower_id === userId && c.following_id === targetId
  );
}
