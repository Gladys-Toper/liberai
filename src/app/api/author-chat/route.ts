import { createClient } from '@supabase/supabase-js'
import { streamText, tool, stepCountIs } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { formatChapterForPlatform, type ChapterData } from '@/lib/formatters'

export const maxDuration = 120

// ─── Helpers ─────────────────────────────────────────────────

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

function periodToDays(period: string): number {
  switch (period) {
    case '7d': return 7
    case '90d': return 90
    default: return 30
  }
}

// ─── POST Handler ────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const db = supabase as any

  const { messages: rawMessages, authorId } = await request.json()

  if (!authorId || !rawMessages?.length) {
    return new Response('Missing authorId or messages', { status: 400 })
  }

  const messages = toModelMessages(rawMessages)
  if (messages.length === 0) {
    return new Response('No valid messages', { status: 400 })
  }

  // ─── Fetch author context (same as before) ────────────────

  const { data: author } = await db
    .from('authors')
    .select('display_name, bio, total_books, total_reads')
    .eq('id', authorId)
    .single()

  const { data: books } = await db
    .from('books')
    .select('id, title, total_reads, total_chats, average_rating, category, tags, published_date')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  const bookIds = (books || []).map((b: any) => b.id)

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

  // Most-cited chunks
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

  // ─── Build system prompt context ──────────────────────────

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

  // Book list for tool context
  const bookListForTools = (books || []).map((b: any, i: number) =>
    `${i + 1}. "${b.title}" (ID: ${b.id})`
  ).join('\n')

  const systemPrompt = `You are an AI command center for the author "${author?.display_name || 'Unknown'}".
You help this author understand reader interactions, create content, and manage their books through conversation.

YOUR ROLE:
- Analyze reader interaction data to provide actionable insights
- Create infographics, tweet threads, newsletter content, and Substack posts
- Show engagement analytics and trends
- Identify patterns in what readers ask about
- Suggest improvements based on reader questions
- Be conversational, insightful, and specific — cite actual data when answering

AUTHOR'S BOOKS:
${bookSummary || 'No books yet.'}

BOOK IDS (use these when calling tools):
${bookListForTools || 'No books.'}

INTERACTION STATISTICS:
- Total conversations: ${totalConversations}
- Total messages: ${totalMessages} (${totalUserMessages} reader questions, ${totalAssistantMessages} AI answers)

RECENT READER QUESTIONS:
${questionSummary}

MOST-CITED BOOK PASSAGES:
${citedPassages || 'No cited passages yet.'}

YOU HAVE TOOLS AVAILABLE:
- getAnalytics: Fetch engagement trends, chapter stats, period comparisons. Use when asked about trends, analytics, performance, engagement.
- getRevenue: Fetch revenue and P&L data with cost breakdowns. Use when asked about earnings, revenue, sales, costs, P&L, profits, or financial performance.
- getChapterContent: Fetch full chapter text. Use before formatting or generating infographics.
- generateInfographic: Create a visual infographic from chapter content. Ask the user which chapter and style if not specified.
- formatChapter: Format a chapter for Substack, Twitter/X thread, or email newsletter. Use when asked to share, export, or publish content.

GUIDELINES:
- When the author asks about patterns, analyze the reader questions above for themes
- When asked about improvements, look for gaps — questions readers ask that aren't well covered
- Be specific: reference actual reader questions and cited passages
- If data is limited, say so honestly and suggest how to gather more insights
- When using formatChapter for Twitter, present each tweet as a numbered item
- When using generateInfographic, display the image and offer to generate another style
- When using getAnalytics, summarize the key trends and highlight notable patterns
- If the author doesn't specify a book, use their most recent or most popular book
- Keep responses concise but data-driven
- Use markdown formatting for readability`

  // ─── Tool Definitions ─────────────────────────────────────

  const getAnalyticsTool = tool({
    description: 'Fetch engagement analytics and trends for a specific book or across all books. Returns daily conversation counts, message counts, and engagement stats. Use when the author asks about trends, performance, analytics, engagement, or stats.',
    inputSchema: z.object({
      bookId: z.string().optional().describe('Book ID to get analytics for. If omitted, returns analytics across all books.'),
      period: z.enum(['7d', '30d', '90d']).default('30d').describe('Time period for analytics'),
    }),
    execute: async ({ bookId, period }) => {
      const days = periodToDays(period)

      let dailyStats: any[] = []
      if (bookId) {
        const { data } = await db.rpc('get_book_daily_stats', { p_book_id: bookId, p_days: days })
        dailyStats = data || []
      } else {
        const { data } = await db.rpc('get_author_daily_stats', { p_author_id: authorId, p_days: days })
        dailyStats = data || []
      }

      // Compute summary stats
      const totalConvos = dailyStats.reduce((sum: number, d: any) => sum + Number(d.conversation_count), 0)
      const totalMsgs = dailyStats.reduce((sum: number, d: any) => sum + Number(d.message_count), 0)
      const peakDay = dailyStats.reduce((max: any, d: any) =>
        Number(d.conversation_count) > Number(max?.conversation_count || 0) ? d : max, dailyStats[0])

      // Chapter engagement (which chapters get the most questions)
      let chapterEngagement: any[] = []
      if (bookId) {
        const { data: chapters } = await db
          .from('chapters')
          .select('id, title, chapter_number')
          .eq('book_id', bookId)
          .order('chapter_number')

        if (chapters?.length) {
          // Count messages per chapter by looking at cited chunk chapter_ids
          const { data: chunks } = await db
            .from('book_chunks')
            .select('id, chapter_id')
            .eq('book_id', bookId)

          if (chunks?.length) {
            const chunkToChapter = new Map<string, string>(chunks.map((c: any) => [c.id, c.chapter_id]))
            const chapterCounts = new Map<string, number>()
            for (const msg of recentMessages) {
              for (const chunkId of (msg.cited_chunk_ids || [])) {
                const chId = chunkToChapter.get(chunkId as string)
                if (chId) chapterCounts.set(chId, (chapterCounts.get(chId) || 0) + 1)
              }
            }

            chapterEngagement = (chapters || []).map((ch: any) => ({
              chapterId: ch.id,
              title: ch.title,
              chapterNumber: ch.chapter_number,
              citationCount: chapterCounts.get(ch.id) || 0,
            }))
          }
        }
      }

      return {
        period,
        dailyStats: dailyStats.map((d: any) => ({
          day: d.day,
          conversations: Number(d.conversation_count),
          messages: Number(d.message_count),
        })),
        topStats: {
          totalConversations: totalConvos,
          totalMessages: totalMsgs,
          peakDay: peakDay?.day || null,
          peakConversations: Number(peakDay?.conversation_count || 0),
          avgDailyConversations: days > 0 ? Math.round(totalConvos / days * 10) / 10 : 0,
        },
        chapterEngagement,
      }
    },
  })

  const getChapterContentTool = tool({
    description: 'Fetch the full text content of a specific chapter. Use this before formatting for export or generating infographics.',
    inputSchema: z.object({
      bookId: z.string().describe('The book ID'),
      chapterNumber: z.number().describe('The chapter number (1-indexed)'),
    }),
    execute: async ({ bookId, chapterNumber }) => {
      const { data: chapter } = await db
        .from('chapters')
        .select('id, title, content, word_count, chapter_number')
        .eq('book_id', bookId)
        .eq('chapter_number', chapterNumber)
        .single()

      if (!chapter) {
        // List available chapters
        const { data: allChapters } = await db
          .from('chapters')
          .select('chapter_number, title')
          .eq('book_id', bookId)
          .order('chapter_number')

        return {
          error: `Chapter ${chapterNumber} not found.`,
          availableChapters: (allChapters || []).map((c: any) => ({
            number: c.chapter_number,
            title: c.title,
          })),
        }
      }

      return {
        chapterId: chapter.id,
        title: chapter.title,
        content: chapter.content,
        wordCount: chapter.word_count || chapter.content?.length || 0,
        chapterNumber: chapter.chapter_number,
      }
    },
  })

  const generateInfographicTool = tool({
    description: 'Generate a visual infographic for a chapter. Extracts key points and creates an image. Ask the author which chapter and style (modern/minimal/bold/academic) if not specified.',
    inputSchema: z.object({
      bookId: z.string().describe('The book ID'),
      chapterId: z.string().describe('The chapter ID'),
      chapterTitle: z.string().describe('Title of the chapter'),
      keyPoints: z.array(z.string()).optional().describe('Key points to feature. If omitted, they will be extracted from content.'),
      style: z.enum(['modern', 'minimal', 'bold', 'academic']).default('modern').describe('Visual style for the infographic'),
    }),
    execute: async ({ bookId, chapterId, chapterTitle, keyPoints, style }) => {
      // If no key points, fetch chapter content and extract them
      let points = keyPoints
      if (!points || points.length === 0) {
        const { data: chapter } = await db
          .from('chapters')
          .select('content')
          .eq('id', chapterId)
          .single()

        if (chapter?.content) {
          // Use simple extraction: first sentences of each paragraph
          const paragraphs = chapter.content.split(/\n{2,}/).filter(Boolean)
          points = paragraphs
            .slice(0, 5)
            .map((p: string) => {
              const firstSentence = p.match(/^[^.!?]+[.!?]/)
              return firstSentence ? firstSentence[0].trim() : p.slice(0, 120).trim()
            })
        }
      }

      if (!points || points.length === 0) {
        points = ['No content available for this chapter']
      }

      // Try Imagen 3 API
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
      let imageUrl: string | null = null

      if (apiKey) {
        const styleDescriptions: Record<string, string> = {
          modern: 'clean modern infographic with geometric shapes, gradient backgrounds, and sans-serif typography',
          minimal: 'minimalist infographic with lots of whitespace, thin lines, and monochromatic color scheme',
          bold: 'bold eye-catching infographic with vibrant colors, large text, and strong contrast',
          academic: 'scholarly infographic with structured layout, serif fonts, and muted professional colors',
        }

        const prompt = `Create a ${styleDescriptions[style]} for a book chapter titled "${chapterTitle}". The infographic should visually present these key points:\n${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nMake it suitable for social media sharing. Include the title "${chapterTitle}" prominently.`

        try {
          const imagenRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instances: [{ prompt }],
                parameters: {
                  sampleCount: 1,
                  aspectRatio: '9:16',
                  safetyFilterLevel: 'BLOCK_MEDIUM_AND_ABOVE',
                },
              }),
            }
          )

          if (imagenRes.ok) {
            const imagenData = await imagenRes.json()
            const base64Image = imagenData?.predictions?.[0]?.bytesBase64Encoded

            if (base64Image) {
              // Upload to Supabase Storage
              const fileName = `infographics/${bookId}/${chapterId}_${style}_${Date.now()}.png`
              const buffer = Buffer.from(base64Image, 'base64')

              const { error: uploadError } = await supabase.storage
                .from('book-covers')
                .upload(fileName, buffer, {
                  contentType: 'image/png',
                  upsert: true,
                })

              if (!uploadError) {
                const { data: publicData } = supabase.storage
                  .from('book-covers')
                  .getPublicUrl(fileName)
                imageUrl = publicData?.publicUrl || null

                // Save to generated_assets
                await db.from('generated_assets').insert({
                  book_id: bookId,
                  chapter_id: chapterId,
                  asset_type: 'infographic',
                  title: `${chapterTitle} — ${style} infographic`,
                  storage_path: fileName,
                  public_url: imageUrl,
                  generation_prompt: prompt,
                  style_preset: style,
                })
              }
            }
          }
        } catch (e) {
          console.error('Imagen generation failed:', e)
        }
      }

      return {
        imageUrl: imageUrl || null,
        keyPoints: points,
        style,
        chapterTitle,
        fallback: !imageUrl,
        message: imageUrl
          ? 'Infographic generated successfully!'
          : 'Image generation unavailable. Here are the key points that would be featured:',
      }
    },
  })

  const formatChapterTool = tool({
    description: 'Format a chapter for export to Substack, Twitter/X thread, or email newsletter. Fetches the chapter content and formats it appropriately for the chosen platform.',
    inputSchema: z.object({
      bookId: z.string().describe('The book ID'),
      chapterNumber: z.number().describe('The chapter number (1-indexed)'),
      platform: z.enum(['substack', 'twitter', 'newsletter']).describe('Target platform for formatting'),
    }),
    execute: async ({ bookId: toolBookId, chapterNumber, platform }) => {
      // Fetch chapter
      const { data: chapter } = await db
        .from('chapters')
        .select('id, title, content, word_count, chapter_number')
        .eq('book_id', toolBookId)
        .eq('chapter_number', chapterNumber)
        .single()

      if (!chapter?.content) {
        const { data: allChapters } = await db
          .from('chapters')
          .select('chapter_number, title')
          .eq('book_id', toolBookId)
          .order('chapter_number')

        return {
          error: `Chapter ${chapterNumber} not found or has no content.`,
          availableChapters: (allChapters || []).map((c: any) => ({
            number: c.chapter_number,
            title: c.title,
          })),
        }
      }

      // Get book and author info for formatting
      const { data: bookInfo } = await db
        .from('books')
        .select('title, authors!inner(display_name)')
        .eq('id', toolBookId)
        .single()

      const chapterData: ChapterData = {
        title: chapter.title,
        content: chapter.content,
        chapterNumber: chapter.chapter_number,
        bookTitle: bookInfo?.title || 'Unknown Book',
        authorName: (bookInfo as any)?.authors?.display_name || author?.display_name || 'Unknown Author',
      }

      const result = formatChapterForPlatform(chapterData, platform)

      return {
        formatted: result.formatted,
        platform: result.platform,
        tweetCount: result.tweetCount,
        chapterTitle: chapter.title,
        wordCount: chapter.word_count || chapter.content.length,
      }
    },
  })

  const getRevenueTool = tool({
    description: 'Fetch revenue, costs, and P&L data for the author. Returns per-book cost breakdowns (AI, storage, infra), revenue, net profit, and author/platform shares. Use when asked about earnings, revenue, sales, costs, P&L, profits, or financial performance.',
    inputSchema: z.object({
      bookId: z.string().optional().describe('Specific book ID to get P&L for. If omitted, returns P&L for all books.'),
      period: z.enum(['7d', '30d', '90d']).default('30d').describe('Time period for revenue data'),
    }),
    execute: async ({ bookId, period }) => {
      const days = periodToDays(period)

      if (bookId) {
        // Single book P&L
        const { data: bookCheck } = await db
          .from('books')
          .select('id')
          .eq('id', bookId)
          .eq('author_id', authorId)
          .single()

        if (!bookCheck) {
          return { error: 'Book not found or does not belong to this author.' }
        }

        const { getBookPnL } = await import('@/lib/db/queries/costs')
        const pnl = await getBookPnL(bookId, days)
        return {
          type: 'book_pnl' as const,
          period,
          book: {
            title: pnl.bookTitle,
            price: pnl.price,
            revenue: pnl.revenue,
            orderCount: pnl.orderCount,
            costs: {
              ai: pnl.costs.aiCost,
              storage: pnl.costs.storageCost,
              infra: pnl.costs.infraCost,
              embedding: pnl.costs.embeddingCost,
              total: pnl.costs.total,
            },
            netProfit: pnl.netProfit,
            authorShare: pnl.authorShare,
            platformShare: pnl.platformShare,
          },
        }
      }

      // Author-wide P&L
      const { getAuthorPnL: fetchAuthorPnL } = await import('@/lib/db/queries/costs')
      const pnl = await fetchAuthorPnL(authorId, days)
      return {
        type: 'author_pnl' as const,
        period,
        books: pnl.books.map(b => ({
          title: b.bookTitle,
          price: b.price,
          revenue: b.revenue,
          orderCount: b.orderCount,
          costs: {
            ai: b.costs.aiCost,
            storage: b.costs.storageCost,
            infra: b.costs.infraCost,
            embedding: b.costs.embeddingCost,
            total: b.costs.total,
          },
          netProfit: b.netProfit,
          authorShare: b.authorShare,
          platformShare: b.platformShare,
        })),
        totals: {
          revenue: pnl.totals.revenue,
          totalCosts: pnl.totals.totalCosts,
          netProfit: pnl.totals.netProfit,
          authorShare: pnl.totals.authorShare,
          platformShare: pnl.totals.platformShare,
        },
        splitLiberaiPct: pnl.splitLiberaiPct,
      }
    },
  })

  // ─── Stream response ──────────────────────────────────────

  try {
    const result = streamText({
      model: google('gemini-3-flash-preview'),
      system: systemPrompt,
      messages,
      tools: {
        getAnalytics: getAnalyticsTool,
        getRevenue: getRevenueTool,
        getChapterContent: getChapterContentTool,
        generateInfographic: generateInfographicTool,
        formatChapter: formatChapterTool,
      },
      stopWhen: stepCountIs(3),
      temperature: 0.7,
      onFinish: async ({ text, usage }) => {
        // Log author-chat messages with token usage for cost tracking
        try {
          await db.from('chat_messages').insert({
            conversation_id: authorId, // Use authorId as a stable identifier
            role: 'assistant',
            content: text.slice(0, 10000),
            model_used: 'gemini',
            input_tokens: usage?.inputTokens || null,
            output_tokens: usage?.outputTokens || null,
            cited_chunk_ids: [],
          })
        } catch (e) {
          console.error('Failed to log author-chat usage:', e)
        }
      },
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
