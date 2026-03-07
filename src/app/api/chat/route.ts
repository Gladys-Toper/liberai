import { createClient } from '@supabase/supabase-js'
import { streamText, type UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { searchBookChunks, buildSystemPrompt } from '@/lib/ai/rag'

export const maxDuration = 60

const MODEL_MAP = {
  claude: anthropic('claude-sonnet-4-20250514'),
  gpt: openai('gpt-5.4'),
  gemini: google('gemini-3-flash-preview'),
} as const

// Extract text content from a UI message (handles both v6 parts format and legacy content format)
function getMessageText(msg: any): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('')
  }
  return ''
}

// Convert UI messages (parts-based) to model messages (content-based) for streamText
function toModelMessages(uiMessages: any[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return uiMessages
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: getMessageText(m),
    }))
    .filter((m) => m.content.length > 0)
}

/** Get or create a conversation record for this session */
/** Get or create a conversation record for this session */
async function getOrCreateConversation(
  supabase: any,
  bookId: string,
  sessionId?: string,
) {
  // Use `as any` throughout because these columns were added in migration 002
  // and the Supabase client doesn't have generated types for them.
  const db = supabase as any

  // If we have a sessionId, try to find existing conversation
  if (sessionId) {
    const { data: existing } = await db
      .from('chat_conversations')
      .select('id')
      .eq('session_id', sessionId)
      .single()

    if (existing) {
      // Update last_message_at
      await db
        .from('chat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', existing.id)
      return existing.id
    }
  }

  // Create new conversation
  const { data: conv } = await db
    .from('chat_conversations')
    .insert({
      book_id: bookId,
      title: 'Chat Session',
      session_id: sessionId || null,
      message_count: 0,
    })
    .select('id')
    .single()

  return conv?.id || null
}

/** Log a chat message to the database (fire-and-forget) */
async function logMessage(
  supabase: any,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  extras?: {
    modelUsed?: string
    inputTokens?: number
    outputTokens?: number
    citedChunkIds?: string[]
  },
) {
  const db = supabase as any
  try {
    await db.from('chat_messages').insert({
      conversation_id: conversationId,
      role,
      content,
      model_used: extras?.modelUsed || null,
      input_tokens: extras?.inputTokens || null,
      output_tokens: extras?.outputTokens || null,
      cited_chunk_ids: extras?.citedChunkIds || [],
    })

    // Update conversation last_message_at
    // message_count is kept accurate by counting actual messages in queries
    await db
      .from('chat_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)
  } catch (e) {
    console.error('Failed to log chat message:', e)
  }
}

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { messages: rawMessages, bookId, sessionId } = await request.json()

  if (!bookId || !rawMessages?.length) {
    return new Response('Missing bookId or messages', { status: 400 })
  }

  // Convert UI messages to model messages
  const messages = toModelMessages(rawMessages)

  if (messages.length === 0) {
    return new Response('No valid messages', { status: 400 })
  }

  // Get book info + AI config
  const { data: book } = await supabase
    .from('books')
    .select('id, title, ai_config, authors!inner(display_name)')
    .eq('id', bookId)
    .single()

  if (!book) {
    return new Response('Book not found', { status: 404 })
  }

  const aiConfig = (book.ai_config as any) || {}
  const modelKey = (aiConfig.model || 'gemini') as keyof typeof MODEL_MAP
  const model = MODEL_MAP[modelKey] || MODEL_MAP.gemini
  const authorName = (book as any).authors?.display_name || 'Unknown Author'

  // Get the latest user message for RAG search
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user')

  let systemPrompt: string
  let citedChunkIds: string[] = []

  if (lastUserMessage) {
    const chunks = await searchBookChunks(
      bookId,
      lastUserMessage.content,
      aiConfig.max_context_chunks || 5
    )

    // Track which chunks were used as context
    citedChunkIds = chunks.map((c) => c.id)

    systemPrompt = buildSystemPrompt(
      book.title,
      authorName,
      chunks,
      aiConfig.system_prompt
    )
  } else {
    systemPrompt = `You are a knowledgeable AI assistant for the book "${book.title}" by ${authorName}.`
  }

  // Get or create conversation for logging (non-blocking)
  const conversationId = await getOrCreateConversation(supabase, bookId, sessionId)

  // Log the user message (fire-and-forget)
  if (conversationId && lastUserMessage) {
    logMessage(supabase, conversationId, 'user', lastUserMessage.content)
  }

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      temperature: aiConfig.temperature ?? 0.7,
      // Capture usage after streaming completes
      onFinish: async ({ text, usage }) => {
        if (conversationId) {
          logMessage(supabase, conversationId, 'assistant', text, {
            modelUsed: modelKey,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            citedChunkIds,
          })
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (e: any) {
    const msg = e?.message || 'Unknown error'
    if (msg.includes('API key') || msg.includes('apiKey') || msg.includes('ANTHROPIC_API_KEY') || msg.includes('OPENAI_API_KEY')) {
      return new Response('AI API key not configured. Please set the appropriate API key in your environment variables.', { status: 503 })
    }
    throw e
  }
}
