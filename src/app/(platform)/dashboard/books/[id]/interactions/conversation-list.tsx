'use client'

import { useState, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, Download, MessageSquare,
  User, Bot, Clock, Search,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ConversationWithMessages } from '@/lib/db/queries'

interface ConversationListProps {
  conversations: ConversationWithMessages[]
  bookTitle: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function groupByDate(conversations: ConversationWithMessages[]) {
  const groups = new Map<string, ConversationWithMessages[]>()

  for (const conv of conversations) {
    const dateKey = formatDate(conv.last_message_at || conv.created_at)
    const list = groups.get(dateKey) || []
    list.push(conv)
    groups.set(dateKey, list)
  }

  return [...groups.entries()]
}

function getFirstUserMessage(conv: ConversationWithMessages): string {
  const first = conv.messages.find((m) => m.role === 'user')
  return first?.content?.slice(0, 120) || 'No messages'
}

/**
 * Export conversations as structured JSON — optimized for AI analysis.
 * Preserves the full conversation hierarchy with metadata so an LLM
 * can easily identify patterns, common questions, and improvement opportunities.
 */
function exportConversationsJSON(
  conversations: ConversationWithMessages[],
  bookTitle: string
) {
  const exportData = {
    _meta: {
      format: 'liberai-interactions-v1',
      bookTitle,
      exportedAt: new Date().toISOString(),
      totalConversations: conversations.length,
      totalMessages: conversations.reduce(
        (sum, c) => sum + c.messages.length,
        0
      ),
      description:
        'Reader ↔ AI interaction data for author analysis. Each conversation contains the full exchange between a reader and the book AI, including which book passages were referenced.',
    },
    conversations: conversations.map((conv) => ({
      id: conv.id,
      startedAt: conv.created_at,
      lastActivityAt: conv.last_message_at,
      messageCount: conv.messages.length,
      exchanges: conv.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at,
        ...(msg.model_used && { model: msg.model_used }),
        ...(msg.input_tokens && { inputTokens: msg.input_tokens }),
        ...(msg.output_tokens && { outputTokens: msg.output_tokens }),
        ...(msg.cited_chunk_ids?.length > 0 && {
          citedPassageIds: msg.cited_chunk_ids,
        }),
      })),
    })),
  }

  const json = JSON.stringify(exportData, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${bookTitle.replace(/\s+/g, '_')}_interactions_${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Export conversations as CSV — for spreadsheet analysis.
 */
function exportConversationsCSV(
  conversations: ConversationWithMessages[],
  bookTitle: string
) {
  const rows: string[][] = [
    [
      'Conversation ID',
      'Date',
      'Message #',
      'Role',
      'Content',
      'Model',
      'Input Tokens',
      'Output Tokens',
    ],
  ]

  for (const conv of conversations) {
    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i]
      rows.push([
        conv.id,
        new Date(msg.created_at).toISOString(),
        String(i + 1),
        msg.role,
        `"${msg.content.replace(/"/g, '""')}"`,
        msg.model_used || '',
        String(msg.input_tokens || ''),
        String(msg.output_tokens || ''),
      ])
    }
  }

  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${bookTitle.replace(/\s+/g, '_')}_interactions_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function ConversationCard({ conv }: { conv: ConversationWithMessages }) {
  const [expanded, setExpanded] = useState(false)
  const preview = getFirstUserMessage(conv)

  return (
    <Card className="border-[#27272a] bg-[#141414] overflow-hidden">
      {/* Clickable header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[#1a1a1a]"
      >
        <div className="mt-0.5 shrink-0 text-zinc-600">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200 truncate">
            {preview}
          </p>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-600">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {conv.message_count || conv.messages.length} messages
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(conv.last_message_at || conv.created_at)}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded message thread */}
      {expanded && (
        <div className="border-t border-[#1e1e1e] bg-[#0e0e0e]">
          <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
            {conv.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${
                  msg.role === 'user' ? '' : 'pl-4'
                }`}
              >
                <div
                  className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'user'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-violet-500/15 text-violet-400'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="h-3 w-3" />
                  ) : (
                    <Bot className="h-3 w-3" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-zinc-500">
                      {msg.role === 'user' ? 'Reader' : 'AI'}
                    </span>
                    <span className="text-[10px] text-zinc-700">
                      {formatTime(msg.created_at)}
                    </span>
                    {msg.model_used && (
                      <span className="rounded bg-[#1e1e1e] px-1.5 py-0.5 text-[9px] font-medium text-zinc-600">
                        {msg.model_used}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export function ConversationList({
  conversations,
  bookTitle,
}: ConversationListProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter((conv) =>
      conv.messages.some((m) => m.content.toLowerCase().includes(q))
    )
  }, [conversations, search])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  if (conversations.length === 0) {
    return (
      <Card className="border-[#27272a] bg-[#141414] py-12 text-center">
        <MessageSquare className="mx-auto h-8 w-8 text-zinc-700" />
        <p className="mt-3 text-sm text-zinc-500">
          No reader conversations yet.
        </p>
        <p className="mt-1 text-xs text-zinc-700">
          Conversations will appear here once readers start chatting with your
          book&apos;s AI.
        </p>
      </Card>
    )
  }

  return (
    <div>
      {/* Search & Export */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-md border border-[#27272a] bg-[#141414] pl-9 pr-3 text-sm text-zinc-300 placeholder-zinc-600 outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportConversationsJSON(conversations, bookTitle)}
          className="shrink-0 border-[#27272a] text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/30"
          title="Structured JSON — best for AI analysis"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportConversationsCSV(conversations, bookTitle)}
          className="shrink-0 border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#1a1a1a]"
          title="Flat CSV — for spreadsheets"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          CSV
        </Button>
      </div>

      {/* Conversation count */}
      <p className="mb-3 text-xs text-zinc-600">
        {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </p>

      {/* Grouped conversations */}
      <div className="space-y-6">
        {grouped.map(([date, convs]) => (
          <div key={date}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-600">
              {date}
            </h3>
            <div className="space-y-2">
              {convs.map((conv) => (
                <ConversationCard key={conv.id} conv={conv} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && search && (
        <Card className="mt-4 border-[#27272a] bg-[#141414] py-8 text-center">
          <p className="text-sm text-zinc-500">
            No conversations match &quot;{search}&quot;
          </p>
        </Card>
      )}
    </div>
  )
}
