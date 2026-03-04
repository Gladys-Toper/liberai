import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { streamText, type UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { searchBookChunks, buildSystemPrompt } from '@/lib/ai/rag'

export const maxDuration = 60

const MODEL_MAP = {
  claude: anthropic('claude-sonnet-4-20250514'),
  gpt: openai('gpt-4o-mini'),
  gemini: google('gemini-2.0-flash'),
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

export async function POST(request: Request) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { messages: rawMessages, bookId } = await request.json()

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

  if (lastUserMessage) {
    const chunks = await searchBookChunks(
      bookId,
      lastUserMessage.content,
      aiConfig.max_context_chunks || 5
    )

    systemPrompt = buildSystemPrompt(
      book.title,
      authorName,
      chunks,
      aiConfig.system_prompt
    )
  } else {
    systemPrompt = `You are a knowledgeable AI assistant for the book "${book.title}" by ${authorName}.`
  }

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      temperature: aiConfig.temperature ?? 0.7,
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
