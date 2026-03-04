import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateEmbedding } from './embeddings'

interface SearchResult {
  id: string
  chapterId: string
  content: string
  chunkIndex: number
  score: number
  chapterTitle?: string
}

export async function searchBookChunks(
  bookId: string,
  query: string,
  maxResults = 5
): Promise<SearchResult[]> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored
          }
        },
      },
    }
  )

  // Try to generate embedding; fall back to keyword-only search if OpenAI key is missing
  let queryEmbedding: number[] | null = null
  try {
    queryEmbedding = await generateEmbedding(query)
  } catch (e) {
    console.warn('Embedding generation failed, falling back to keyword search:', (e as Error).message)
  }

  // Use keyword-only weights when embeddings are unavailable
  const hasEmbedding = queryEmbedding !== null
  const zeroVector = hasEmbedding ? undefined : new Array(1536).fill(0)

  const { data, error } = await supabase.rpc('hybrid_search_chunks', {
    query_text: query,
    query_embedding: JSON.stringify(hasEmbedding ? queryEmbedding : zeroVector),
    match_book_id: bookId,
    keyword_weight: hasEmbedding ? 0.3 : 1.0,
    semantic_weight: hasEmbedding ? 0.7 : 0.0,
    match_count: maxResults,
  })

  if (error) {
    console.error('Search error:', error)
    return []
  }

  if (!data || data.length === 0) return []

  // Fetch chapter titles for the results
  const chapterIds = [...new Set(data.map((r: any) => r.chapter_id))]
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, title')
    .in('id', chapterIds)

  const chapterMap = new Map(
    (chapters || []).map((c: any) => [c.id, c.title])
  )

  return data.map((row: any) => ({
    id: row.id,
    chapterId: row.chapter_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    score: row.combined_score,
    chapterTitle: chapterMap.get(row.chapter_id) || 'Unknown Chapter',
  }))
}

export function buildSystemPrompt(
  bookTitle: string,
  authorName: string,
  chunks: SearchResult[],
  customPrompt?: string | null
): string {
  const contextBlock = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1} - ${c.chapterTitle}]\n${c.content}`
    )
    .join('\n\n---\n\n')

  const base = customPrompt
    || `You are a knowledgeable AI assistant for the book "${bookTitle}" by ${authorName}. Answer questions using the provided context from the book. Be accurate, helpful, and cite specific passages when relevant. If the context doesn't contain enough information to answer fully, say so honestly.`

  return `${base}

Here are relevant passages from the book:

${contextBlock}

Instructions:
- Answer based on the provided passages above.
- When referencing specific information, mention which source it comes from (e.g., "According to [Source 1]...").
- If the passages don't contain relevant information, acknowledge this and provide what general insight you can.
- Keep responses conversational and engaging.`
}
