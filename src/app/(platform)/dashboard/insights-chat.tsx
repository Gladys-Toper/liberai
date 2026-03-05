'use client'

import { useRef, useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import {
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  MessageSquare,
  BarChart3,
  Image,
  FileText,
  Twitter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToolResult } from '@/components/chat/tool-results'

interface InsightsChatProps {
  authorId: string
  authorName: string
}

const QUICK_ACTIONS = [
  { icon: BarChart3, label: 'Show engagement trends', category: 'analytics' as const },
  { icon: Image, label: 'Create an infographic', category: 'create' as const },
  { icon: FileText, label: 'Format for Substack', category: 'share' as const },
  { icon: Twitter, label: 'Create a tweet thread', category: 'share' as const },
]

const INSIGHT_PROMPTS = [
  'What are readers most curious about?',
  'Which chapters generate the most AI questions?',
  'What topics should I expand on?',
  'Summarize reader interaction patterns',
]

const CATEGORY_COLORS = {
  analytics: 'border-blue-500/30 text-blue-300 hover:bg-blue-500/10',
  create: 'border-violet-500/30 text-violet-300 hover:bg-violet-500/10',
  share: 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10',
}

export function InsightsChat({ authorId, authorName }: InsightsChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')

  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/author-chat',
      body: { authorId },
    }),
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  const getMessageText = (message: (typeof messages)[0]): string => {
    return message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
  }

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || isBusy) return
    sendMessage({ text: msg })
    setInput('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSend()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-[#1e1e1e] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Command Center</h3>
            <p className="text-[11px] text-zinc-500">
              Analytics, infographics, exports &amp; insights
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10">
              <MessageSquare className="h-7 w-7 text-violet-400" />
            </div>
            <h4 className="mb-1 text-sm font-medium text-zinc-300">
              Your Author Command Center
            </h4>
            <p className="mb-5 max-w-[260px] text-xs leading-relaxed text-zinc-600">
              Create content, analyze engagement, and export chapters — all through conversation.
            </p>

            {/* Quick Action Buttons */}
            <div className="mb-4 flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    onClick={() => handleSend(action.label)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-all',
                      CATEGORY_COLORS[action.category],
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {action.label}
                  </button>
                )
              })}
            </div>

            {/* Insight Prompts */}
            <div className="w-full space-y-2">
              {INSIGHT_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="w-full rounded-lg border border-[#27272a] bg-[#0e0e0e] px-3 py-2.5 text-left text-xs text-zinc-400 transition-all hover:border-violet-500/30 hover:bg-[#141414] hover:text-zinc-200"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'justify-end' : '',
              )}
            >
              {msg.role !== 'user' && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
                  <Bot className="h-3.5 w-3.5 text-violet-400" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-violet-500 text-white'
                    : 'bg-[#1a1a1a] text-zinc-300',
                )}
              >
                {msg.parts.map((part, i) => {
                  if (part.type === 'text' && part.text) {
                    return (
                      <div
                        key={i}
                        className="prose prose-sm prose-invert prose-p:my-1 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: formatMarkdown(part.text),
                        }}
                      />
                    )
                  }
                  // AI SDK v6: tool parts have type 'tool-{name}' or 'dynamic-tool'
                  if (part.type === 'dynamic-tool' || (typeof part.type === 'string' && part.type.startsWith('tool-'))) {
                    return (
                      <ToolResult
                        key={i}
                        part={part as any}
                        onAction={(message) => handleSend(message)}
                      />
                    )
                  }
                  return null
                })}
              </div>
              {msg.role === 'user' && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                  <User className="h-3.5 w-3.5 text-blue-400" />
                </div>
              )}
            </div>
          ))
        )}

        {isBusy && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
              <Bot className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-[#1a1a1a] px-3.5 py-2.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
              <span className="text-xs text-zinc-500">
                Analyzing your data…
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[#1e1e1e] p-4">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your readers, create content…"
            className="flex-1 rounded-lg border border-[#27272a] bg-[#0e0e0e] px-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
            disabled={isBusy}
          />
          <button
            type="submit"
            disabled={isBusy || !input.trim()}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-all',
              input.trim() && !isBusy
                ? 'bg-violet-500 text-white hover:bg-violet-600'
                : 'bg-[#1a1a1a] text-zinc-600 cursor-not-allowed',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

/** Minimal markdown → HTML for AI responses */
function formatMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(
      /`(.+?)`/g,
      '<code class="bg-[#27272a] px-1 py-0.5 rounded text-violet-300 text-xs">$1</code>',
    )
    // Headers
    .replace(
      /^### (.+)$/gm,
      '<h4 class="text-sm font-semibold text-white">$1</h4>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h3 class="text-sm font-bold text-white">$1</h3>',
    )
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines within paragraphs
    .replace(/\n/g, '<br/>')
    // Wrap in paragraph
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}
