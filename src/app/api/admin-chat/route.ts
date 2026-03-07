import { createClient } from '@supabase/supabase-js'
import { streamText, tool, stepCountIs } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import {
  getPlatformOverview,
  getTopBooksByRevenue,
  getAuthorLeaderboard,
  getRecentOrders,
  getUserList,
  getAuthorList,
  getPlatformPnL,
  getRevenueTimeSeries,
} from '@/lib/db/queries/admin'

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

  const { messages: rawMessages } = await request.json()

  if (!rawMessages?.length) {
    return new Response('Missing messages', { status: 400 })
  }

  const messages = toModelMessages(rawMessages)
  if (messages.length === 0) {
    return new Response('No valid messages', { status: 400 })
  }

  // ─── Build system prompt ──────────────────────────────────

  const systemPrompt = `You are LiberAi's admin intelligence assistant with platform-wide data access.
You help the admin team understand business performance, manage users and authors, and make data-driven decisions.

YOUR ROLE:
- Provide real-time platform analytics and business intelligence
- Analyze revenue trends, cost structure, and profitability
- Surface top-performing books and authors
- Help with user and author management
- Identify growth opportunities and cost optimizations
- Be data-driven, precise, and actionable

YOU HAVE TOOLS AVAILABLE:
- getPlatformStats: Platform-wide metrics (users, authors, revenue, costs, profit). Use for overview questions.
- getRevenueReport: Revenue time series + P&L breakdown. Use for revenue trends, financial analysis.
- getCostReport: Detailed cost breakdown (AI, storage, infra, embeddings). Use for cost analysis, margin optimization.
- getTopBooks: Ranked books by revenue with engagement metrics. Use for content performance analysis.
- getTopAuthors: Author leaderboard by revenue. Use for author performance analysis.
- getUserInfo: Search and list users with order counts. Use for user lookup and CRM.
- getAuthorInfo: Search and list authors with revenue and book counts. Use for author management.
- getOrderHistory: Recent orders with cost/revenue breakdown. Use for transaction analysis.

GUIDELINES:
- Always cite specific numbers from tool results
- When comparing periods, call tools for each period and compute deltas
- Proactively suggest follow-up analyses when patterns emerge
- Format currency consistently as $X.XX
- Use markdown tables for tabular data
- Keep responses concise but comprehensive
- If a query is ambiguous, ask for clarification`

  // ─── Tool Definitions ─────────────────────────────────────

  const getPlatformStatsTool = tool({
    description: 'Get platform-wide overview metrics: total users, authors, readers, signups, revenue, orders, costs, and net profit. Use when asked about platform health, overview, KPIs, or general metrics.',
    inputSchema: z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d').describe('Time period for metrics'),
    }),
    execute: async ({ period }) => {
      const days = periodToDays(period)
      const overview = await getPlatformOverview(days)
      return { period, ...overview }
    },
  })

  const getRevenueReportTool = tool({
    description: 'Get revenue time series data and P&L breakdown. Returns daily revenue, orders, new users, plus cost breakdown by category. Use for revenue trends, financial reports, and growth analysis.',
    inputSchema: z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d').describe('Time period'),
      includeTimeSeries: z.boolean().default(true).describe('Include daily time series data'),
    }),
    execute: async ({ period, includeTimeSeries }) => {
      const days = periodToDays(period)
      const pnl = await getPlatformPnL(days)
      const timeSeries = includeTimeSeries ? await getRevenueTimeSeries(days) : []
      return { period, pnl, timeSeries }
    },
  })

  const getCostReportTool = tool({
    description: 'Get detailed cost breakdown by category (AI chat, storage, infrastructure, embeddings). Use for cost analysis, margin optimization, and expense tracking.',
    inputSchema: z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d').describe('Time period'),
    }),
    execute: async ({ period }) => {
      const days = periodToDays(period)
      const pnl = await getPlatformPnL(days)
      return {
        period,
        revenue: pnl.revenue,
        costs: pnl.costs,
        netProfit: pnl.netProfit,
        margin: pnl.revenue > 0 ? ((pnl.netProfit / pnl.revenue) * 100).toFixed(1) + '%' : 'N/A',
      }
    },
  })

  const getTopBooksTool = tool({
    description: 'Get top-performing books ranked by revenue. Includes engagement metrics (reads, chats), order counts, and author info. Use for content performance analysis.',
    inputSchema: z.object({
      limit: z.number().min(1).max(50).default(10).describe('Number of books to return'),
      period: z.enum(['7d', '30d', '90d']).default('30d').describe('Time period'),
    }),
    execute: async ({ limit, period }) => {
      const days = periodToDays(period)
      const books = await getTopBooksByRevenue(limit, days)
      return { period, books }
    },
  })

  const getTopAuthorsTool = tool({
    description: 'Get author leaderboard ranked by revenue. Includes book count, total orders, and engagement. Use for author performance analysis and partnership decisions.',
    inputSchema: z.object({
      limit: z.number().min(1).max(50).default(10).describe('Number of authors to return'),
      period: z.enum(['7d', '30d', '90d']).default('30d').describe('Time period'),
    }),
    execute: async ({ limit, period }) => {
      const days = periodToDays(period)
      const authors = await getAuthorLeaderboard(limit, days)
      return { period, authors }
    },
  })

  const getUserInfoTool = tool({
    description: 'Search and list platform users. Returns user details with order counts. Use for user lookup, CRM, and user management.',
    inputSchema: z.object({
      search: z.string().optional().describe('Search by email'),
      role: z.string().optional().describe('Filter by role (reader, author, admin)'),
      page: z.number().default(1).describe('Page number'),
      perPage: z.number().default(20).describe('Results per page'),
    }),
    execute: async ({ search, role, page, perPage }) => {
      return getUserList({ search, role, page, perPage })
    },
  })

  const getAuthorInfoTool = tool({
    description: 'Search and list authors. Returns author details with book counts, revenue, and wallet addresses. Use for author management and partnership tracking.',
    inputSchema: z.object({
      search: z.string().optional().describe('Search by display name'),
      page: z.number().default(1).describe('Page number'),
      perPage: z.number().default(20).describe('Results per page'),
    }),
    execute: async ({ search, page, perPage }) => {
      return getAuthorList({ search, page, perPage })
    },
  })

  const getOrderHistoryTool = tool({
    description: 'Get recent orders with full breakdown: user, book, amount, status, cost share, author earnings, platform fee. Use for transaction analysis and audit.',
    inputSchema: z.object({
      limit: z.number().min(1).max(100).default(20).describe('Number of orders to return'),
    }),
    execute: async ({ limit }) => {
      const orders = await getRecentOrders(limit)
      return { orders }
    },
  })

  // ─── Stream response ──────────────────────────────────────

  try {
    const result = streamText({
      model: google('gemini-3.1-flash'),
      system: systemPrompt,
      messages,
      tools: {
        getPlatformStats: getPlatformStatsTool,
        getRevenueReport: getRevenueReportTool,
        getCostReport: getCostReportTool,
        getTopBooks: getTopBooksTool,
        getTopAuthors: getTopAuthorsTool,
        getUserInfo: getUserInfoTool,
        getAuthorInfo: getAuthorInfoTool,
        getOrderHistory: getOrderHistoryTool,
      },
      stopWhen: stepCountIs(3),
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
