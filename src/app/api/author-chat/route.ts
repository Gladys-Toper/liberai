import { createClient } from '@supabase/supabase-js'
import { streamText } from 'ai'
import { google } from '@ai-sdk/google'

export const maxDuration = 60

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
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { messages: rawMessages, authorId } = await request.json()

  if (!authorId || !rawMessages?.length) {
    return new Response('Missing authorId or messages', { status: 400 })
  }

  const messages = toModelMessages(rawMessages)
  if (messages.length === 0) {
    return new Response('No valid messages', { status: 400 })
  }

  // Fetch the author's complete interaction data for context
  const db = supabase as any

  // 1. Author info
  const { data: author } = await db
    .from('authors')
    .select('display_name, bio, total_books, total_reads')
    .eq('id', authorId)
    .single()

  // 2. Books
  const { data: books } = await db
    .from('books')
    .select('id, title, total_reads, total_chats, average_rating, category, tags, published_date')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  const bookIds = (books || []).map((b: any) => b.id)

  // 3. Recent conversations (last 50)
  let conversations: any[] = []
  if (bookIds.length > 0) {
    const { data: convos } = await db
      .from('chat_conversations')
      .select('id, book_id, title, message_count, created_at, last_message_at')
      .in('book_id', bookIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50)
    conversations = convos || []
  }

  // 4. Recent messages (last 200 across all conversations)
  const convIds = conversations.map((c: any) => c.id)
  let recentMessages: any[] = []
  if (convIds.length > 0) {
    const { data: msgs } = await db
      .from('chat_messages')
      .select('id, conversation_id, role, content, model_used, input_tokens, output_tokens, cited_chunk_ids, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(200)
    recentMessages = (msgs || []).reverse()
  }

  // 5. Most-cited chunks
  const allCitedIds = recentMessages
    .flatMap((m: any) => m.cited_chunk_ids || [])
    .filter(Boolean)
  const citedIdCounts = new Map<string, number>()
  for (const id of allCitedIds) {
    citedIdCounts.set(id, (citedIdCounts.get(id) || 0) + 1)
  }
  const topCitedIds = [...citedIdCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id)

  let citedChunks: any[] = []
  if (topCitedIds.length > 0) {
    const { data: chunks } = await db
      .from('book_chunks')
      .select('id, content, chapter_id')
      .in('id', topCitedIds)
    citedChunks = chunks || []
  }

  // Build context for the AI
  const bookSummary = (books || []).map((b: any) =>
    `- "${b.title}" (${b.category}) — ${b.total_reads} reads, ${b.total_chats} chats, ${b.average_rating} rating, tags: ${(b.tags || []).join(', ')}`
  ).join('\n')

  const userQuestions = recentMessages
    .filter((m: any) => m.role === 'user')
    .map((m: any) => m.content)

  const questionSummary = userQuestions.length > 0
    ? userQuestions.slice(0, 30).map((q: string, i: number) => `${i + 1}. "${q}"`).join('\n')
    : 'No reader questions yet.'

  const citedPassages = citedChunks.map((c: any) => {
    const count = citedIdCounts.get(c.id) || 0
    return `[Cited ${count}x] ${c.content.slice(0, 300)}...`
  }).join('\n\n')

  const totalMessages = recentMessages.length
  const totalUserMessages = recentMessages.filter((m: any) => m.role === 'user').length
  const totalAssistantMessages = recentMessages.filter((m: any) => m.role === 'assistant').length
  const totalConversations = conversations.length

  const systemPrompt = `You are an AI insights assistant for the author "${author?.display_name || 'Unknown'}". 
You help this author understand how readers interact with their books through AI chat.

YOUR ROLE:
- Analyze reader interaction data to provide actionable insights
- Identify patterns in what readers ask about
- Suggest improvements to the book based on reader questions
- Help the author understand which parts of their book resonate or confuse readers
- Be conversational, insightful, and specific — cite actual data when answering

AUTHOR'S BOOKS:
${bookSummary || 'No books yet.'}

INTERACTION STATISTICS:
- Total conversations: ${totalConversations}
- Total messages: ${totalMessages} (${totalUserMessages} reader questions, ${totalAssistantMessages} AI answers)

RECENT READER QUESTIONS (what readers are asking the AI about their books):
${questionSummary}

MOST-CITED BOOK PASSAGES (passages the AI references most when answering readers):
${citedPassages || 'No cited passages yet.'}

GUIDELINES:
- When the author asks about patterns, analyze the reader questions above for themes
- When asked about improvements, look for gaps — questions the AI struggled to answer, or topics readers ask about that aren't well covered
- Be specific: reference actual reader questions and cited passages
- If data is limited, say so honestly and suggest how to gather more insights
- Keep responses concise but data-driven
- Use markdown formatting for readability`

  try {
    const result = streamText({
      model: google('gemini-2.0-flash'),
      system: systemPrompt,
      messages,
      temperature: 0.7,
    })

    return result.toUIMessageStreamResponse()
  } catch (e: any) {
    const msg = e?.message || 'Unknown error'
    if (msg.includes('API key')) {
      return new Response('AI API key not configured.', { status: 503 })
    }
    throw e
  }
}
