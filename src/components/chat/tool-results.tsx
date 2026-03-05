'use client'

import { useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  MessageSquare,
  Copy,
  Check,
  Download,
  Image as ImageIcon,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────
// AI SDK v6 uses typed tool parts: type is 'tool-{name}' or 'dynamic-tool'
// States: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
// Data: 'input' (was 'args'), 'output' (was 'result')

interface ToolPartV6 {
  type: string           // 'tool-getAnalytics', 'dynamic-tool', etc.
  toolCallId: string
  toolName?: string      // only on dynamic-tool parts
  input?: any
  output?: any
  state: string
}

interface ToolResultProps {
  part: ToolPartV6
  onAction?: (message: string) => void
}

/** Extract tool name from AI SDK v6 part */
function extractToolName(part: ToolPartV6): string {
  // Dynamic tool parts have toolName directly
  if (part.type === 'dynamic-tool' && part.toolName) return part.toolName
  // Static tool parts have type 'tool-{name}'
  if (part.type.startsWith('tool-')) return part.type.slice(5)
  return 'unknown'
}

// ─── Main Dispatcher ─────────────────────────────────────────

export function ToolResult({ part, onAction }: ToolResultProps) {
  const toolName = extractToolName(part)

  if (part.state !== 'output-available' || !part.output) {
    return <ToolLoading toolName={toolName} />
  }

  switch (toolName) {
    case 'getAnalytics':
      return <AnalyticsResult data={part.output} />
    case 'generateInfographic':
      return <InfographicResult data={part.output} onAction={onAction} />
    case 'formatChapter':
      return <FormatResult data={part.output} />
    case 'getChapterContent':
      return null // Internal tool — model consumes result, no UI
    default:
      return null
  }
}

// ─── Loading State ───────────────────────────────────────────

function ToolLoading({ toolName }: { toolName: string }) {
  const labels: Record<string, string> = {
    getAnalytics: 'Crunching your analytics',
    generateInfographic: 'Creating your infographic',
    formatChapter: 'Formatting content',
    getChapterContent: 'Reading chapter',
  }

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      <span className="text-xs text-violet-300">
        {labels[toolName] || 'Processing'}…
      </span>
    </div>
  )
}

// ─── Analytics Result ────────────────────────────────────────

function AnalyticsResult({ data }: { data: any }) {
  const { dailyStats, topStats, chapterEngagement, period } = data

  const periodLabel = period === '7d' ? '7 days' : period === '90d' ? '90 days' : '30 days'

  // Format chart data
  const chartData = (dailyStats || []).map((d: any) => ({
    day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    conversations: d.conversations,
    messages: d.messages,
  }))

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-violet-400" />
        <span className="text-xs font-medium text-zinc-300">
          Engagement — Last {periodLabel}
        </span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Conversations"
          value={topStats?.totalConversations || 0}
          icon={<MessageSquare className="h-3 w-3" />}
        />
        <StatCard
          label="Messages"
          value={topStats?.totalMessages || 0}
          icon={<TrendingUp className="h-3 w-3" />}
        />
        <StatCard
          label="Daily Avg"
          value={topStats?.avgDailyConversations || 0}
          icon={<BarChart3 className="h-3 w-3" />}
        />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e4e4e7',
                }}
              />
              <Area
                type="monotone"
                dataKey="conversations"
                stroke="#8b5cf6"
                fill="url(#convGrad)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="messages"
                stroke="#3b82f6"
                fill="url(#msgGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chapter Engagement */}
      {chapterEngagement?.length > 0 && (
        <div className="space-y-1.5 border-t border-[#1e1e1e] pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Chapter Engagement
          </p>
          {chapterEngagement
            .sort((a: any, b: any) => b.citationCount - a.citationCount)
            .slice(0, 5)
            .map((ch: any) => (
              <div key={ch.chapterId} className="flex items-center justify-between text-xs">
                <span className="truncate text-zinc-400">
                  Ch. {ch.chapterNumber}: {ch.title}
                </span>
                <span className="shrink-0 text-violet-400">
                  {ch.citationCount} citations
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[#0a0a0a] px-3 py-2">
      <div className="mb-1 flex items-center gap-1 text-zinc-500">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

// ─── Infographic Result ──────────────────────────────────────

function InfographicResult({ data, onAction }: { data: any; onAction?: (msg: string) => void }) {
  const { imageUrl, keyPoints, style, chapterTitle, fallback } = data

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-violet-400" />
        <span className="text-xs font-medium text-zinc-300">
          Infographic — {chapterTitle}
        </span>
      </div>

      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={`Infographic for ${chapterTitle}`}
            className="w-full rounded-lg border border-[#27272a]"
          />
          <div className="flex gap-2">
            <a
              href={imageUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 transition-colors hover:bg-violet-500/20"
            >
              <Download className="h-3 w-3" />
              Download
            </a>
            {onAction && (
              <button
                onClick={() => onAction(`Generate another infographic for "${chapterTitle}" in a different style than ${style}`)}
                className="flex items-center gap-1.5 rounded-md bg-[#1a1a1a] px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-[#222] hover:text-zinc-200"
              >
                <Sparkles className="h-3 w-3" />
                Try another style
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {fallback && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Image generation unavailable. Key points extracted:
            </div>
          )}
          <ul className="space-y-1 pl-4">
            {(keyPoints || []).map((point: string, i: number) => (
              <li key={i} className="text-xs text-zinc-400 list-disc">
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Format Result ───────────────────────────────────────────

function FormatResult({ data }: { data: any }) {
  const { formatted, platform, tweetCount, chapterTitle, error, availableChapters } = data
  const [copied, setCopied] = useState(false)

  if (error) {
    return (
      <div className="my-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-xs text-red-300">{error}</p>
        {availableChapters?.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-zinc-500">Available chapters:</p>
            {availableChapters.map((ch: any) => (
              <p key={ch.number} className="text-xs text-zinc-400">
                Chapter {ch.number}: {ch.title}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const platformLabels: Record<string, string> = {
    substack: 'Substack',
    twitter: 'Twitter/X Thread',
    newsletter: 'Newsletter HTML',
  }

  if (platform === 'twitter' && tweetCount) {
    return <TweetThreadResult formatted={formatted} tweetCount={tweetCount} chapterTitle={chapterTitle} />
  }

  return (
    <div className="my-2 space-y-2 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">
          {platformLabels[platform] || platform} — {chapterTitle}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-[#1a1a1a] hover:text-zinc-300"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="max-h-[300px] overflow-auto rounded-lg bg-[#0a0a0a] p-3 text-xs leading-relaxed text-zinc-400">
        {formatted}
      </pre>
    </div>
  )
}

// ─── Tweet Thread ────────────────────────────────────────────

function TweetThreadResult({
  formatted,
  tweetCount,
  chapterTitle,
}: {
  formatted: string
  tweetCount: number
  chapterTitle: string
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const tweets = formatted.split('\n\n---\n\n')

  const copyTweet = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {
      // fallback
    }
  }

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(formatted)
      setCopiedIndex(-1)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="my-2 space-y-2 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">
          Twitter/X Thread — {tweetCount} tweets
        </span>
        <button
          onClick={copyAll}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-[#1a1a1a] hover:text-zinc-300"
        >
          {copiedIndex === -1 ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              Copied all
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy all
            </>
          )}
        </button>
      </div>

      <div className="space-y-2">
        {tweets.map((tweet, i) => (
          <div
            key={i}
            className="group relative rounded-lg bg-[#0a0a0a] px-3 py-2.5"
          >
            <p className="pr-8 text-xs leading-relaxed text-zinc-400">
              {tweet}
            </p>
            <div className="absolute right-2 top-2 flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-600">
                {tweet.length}/280
              </span>
              <button
                onClick={() => copyTweet(tweet, i)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              >
                {copiedIndex === i ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3 text-zinc-600 hover:text-zinc-300" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
