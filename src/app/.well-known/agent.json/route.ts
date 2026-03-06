import { NextResponse } from 'next/server'

export async function GET() {
  const agentCard = {
    name: 'LiberAi',
    description: 'AI-native book publishing platform with RAG chat, x402 payments, and agent publishing capabilities.',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://liberai.com',
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    authentication: {
      schemes: ['bearer'],
      credentials: 'API key (lbr_live_...) — create at /dashboard/settings/api-keys',
    },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    skills: [
      {
        id: 'book-publishing',
        name: 'Book Publishing',
        description: 'Create and manage books with chapters, metadata, and AI-powered RAG chat.',
        tags: ['publishing', 'books', 'ai', 'rag'],
      },
      {
        id: 'author-analytics',
        name: 'Author Analytics',
        description: 'Revenue reports, P&L breakdowns, and book performance metrics.',
        tags: ['analytics', 'revenue', 'metrics'],
      },
      {
        id: 'platform-admin',
        name: 'Platform Administration',
        description: 'Platform-wide metrics, user management, and order tracking (admin scope required).',
        tags: ['admin', 'platform', 'management'],
      },
    ],
  }

  return NextResponse.json(agentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
