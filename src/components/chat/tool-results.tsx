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
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  BookOpen,
  ShoppingCart,
  Crown,
  Mail,
  Wallet,
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
    // Author tools
    case 'getAnalytics':
      return <AnalyticsResult data={part.output} />
    case 'getRevenue':
      return <RevenueResult data={part.output} />
    case 'generateInfographic':
      return <InfographicResult data={part.output} onAction={onAction} />
    case 'formatChapter':
      return <FormatResult data={part.output} />
    case 'getChapterContent':
      return null // Internal tool — model consumes result, no UI
    // Admin tools
    case 'getPlatformStats':
      return <PlatformStatsResult data={part.output} />
    case 'getRevenueReport':
      return <RevenueReportResult data={part.output} />
    case 'getCostReport':
      return <CostReportResult data={part.output} />
    case 'getTopBooks':
      return <TopBooksResult data={part.output} />
    case 'getTopAuthors':
      return <TopAuthorsResult data={part.output} />
    case 'getUserInfo':
      return <UserInfoResult data={part.output} />
    case 'getAuthorInfo':
      return <AuthorInfoResult data={part.output} />
    case 'getOrderHistory':
      return <OrderHistoryResult data={part.output} />
    default:
      return null
  }
}

// ─── Loading State ───────────────────────────────────────────

function ToolLoading({ toolName }: { toolName: string }) {
  const labels: Record<string, string> = {
    getAnalytics: 'Crunching your analytics',
    getRevenue: 'Pulling your P&L data',
    generateInfographic: 'Creating your infographic',
    formatChapter: 'Formatting content',
    getChapterContent: 'Reading chapter',
    getPlatformStats: 'Loading platform metrics',
    getRevenueReport: 'Generating revenue report',
    getCostReport: 'Analyzing cost structure',
    getTopBooks: 'Ranking top books',
    getTopAuthors: 'Building author leaderboard',
    getUserInfo: 'Searching users',
    getAuthorInfo: 'Searching authors',
    getOrderHistory: 'Fetching order history',
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

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
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

// ─── Revenue / P&L Result ───────────────────────────────────

function RevenueResult({ data }: { data: any }) {
  if (data.error) {
    return (
      <div className="my-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-xs text-red-300">{data.error}</p>
      </div>
    )
  }

  const periodLabel = data.period === '7d' ? '7 days' : data.period === '90d' ? '90 days' : '30 days'

  if (data.type === 'book_pnl') {
    const b = data.book
    return (
      <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-medium text-zinc-300">
            P&L — {b.title} — Last {periodLabel}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <PnLCard label="Revenue" value={`$${b.revenue.toFixed(2)}`} positive />
          <PnLCard label="Total Costs" value={`-$${b.costs.total.toFixed(2)}`} positive={false} />
          <PnLCard label="Your Earnings" value={`$${b.authorShare.toFixed(2)}`} positive />
        </div>

        <CostBreakdown costs={b.costs} />

        <div className="flex items-center justify-between border-t border-[#1e1e1e] pt-2 text-xs">
          <span className="text-zinc-500">Orders: {b.orderCount} · Price: ${b.price?.toFixed(2)}</span>
          <span className="text-zinc-500">Platform fee: ${b.platformShare.toFixed(2)}</span>
        </div>
      </div>
    )
  }

  // Author-wide P&L
  const { books, totals, splitLiberaiPct } = data
  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-emerald-400" />
        <span className="text-xs font-medium text-zinc-300">
          Author P&L — Last {periodLabel}
        </span>
      </div>

      {/* Totals row */}
      <div className="grid grid-cols-3 gap-2">
        <PnLCard label="Gross Revenue" value={`$${totals.revenue.toFixed(2)}`} positive />
        <PnLCard label="Total Costs" value={`-$${totals.totalCosts.toFixed(2)}`} positive={false} />
        <PnLCard label="Your Earnings" value={`$${totals.authorShare.toFixed(2)}`} positive />
      </div>

      {/* Per-book table */}
      {books?.length > 0 && (
        <div className="space-y-1.5 border-t border-[#1e1e1e] pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Per-Book Breakdown
          </p>
          {books.map((b: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="truncate text-zinc-400">{b.title}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-zinc-500">${b.costs.total.toFixed(2)} costs</span>
                <span className="text-emerald-400">${b.authorShare.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[#1e1e1e] pt-2 text-xs">
        <span className="text-zinc-500">Platform fee: ${totals.platformShare.toFixed(2)}</span>
        {splitLiberaiPct != null && (
          <span className="text-zinc-500">Current split: {splitLiberaiPct.toFixed(1)}% platform</span>
        )}
      </div>
    </div>
  )
}

function PnLCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="rounded-lg bg-[#0a0a0a] px-3 py-2">
      <div className="mb-1 flex items-center gap-1 text-zinc-500">
        {positive ? (
          <ArrowUpRight className="h-3 w-3 text-emerald-400" />
        ) : (
          <ArrowDownRight className="h-3 w-3 text-red-400" />
        )}
        <span className="text-[10px]">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${positive ? 'text-white' : 'text-red-300'}`}>{value}</p>
    </div>
  )
}

function CostBreakdown({ costs }: { costs: any }) {
  const items = [
    { label: 'AI Chat', value: costs.ai, color: 'text-violet-400' },
    { label: 'Storage', value: costs.storage, color: 'text-blue-400' },
    { label: 'Infrastructure', value: costs.infra, color: 'text-amber-400' },
    { label: 'Embeddings', value: costs.embedding, color: 'text-cyan-400' },
  ].filter(item => item.value > 0)

  if (items.length === 0) return null

  return (
    <div className="space-y-1 border-t border-[#1e1e1e] pt-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Cost Breakdown
      </p>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">{item.label}</span>
          <span className={item.color}>${item.value.toFixed(4)}</span>
        </div>
      ))}
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

// ═══════════════════════════════════════════════════════════════
// ─── Admin Tool Results ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

function periodLabel(period: string): string {
  return period === '7d' ? '7 days' : period === '90d' ? '90 days' : '30 days'
}

// ─── Platform Stats ─────────────────────────────────────────

function PlatformStatsResult({ data }: { data: any }) {
  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-violet-400" />
        <span className="text-xs font-medium text-zinc-300">
          Platform Overview — Last {periodLabel(data.period)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Users" value={data.totalUsers || 0} icon={<Users className="h-3 w-3" />} />
        <StatCard label="Authors" value={data.totalAuthors || 0} icon={<Crown className="h-3 w-3" />} />
        <StatCard label="Revenue" value={`$${(data.totalRevenue || 0).toFixed(2)}`} icon={<DollarSign className="h-3 w-3" />} />
        <StatCard label="Orders" value={data.totalOrders || 0} icon={<ShoppingCart className="h-3 w-3" />} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <PnLCard label="Revenue" value={`$${(data.totalRevenue || 0).toFixed(2)}`} positive />
        <PnLCard label="Costs" value={`-$${(data.totalCosts || 0).toFixed(2)}`} positive={false} />
        <PnLCard label="Net Profit" value={`$${(data.netProfit || 0).toFixed(2)}`} positive={(data.netProfit || 0) >= 0} />
      </div>

      <div className="flex items-center justify-between border-t border-[#1e1e1e] pt-2 text-xs text-zinc-500">
        <span>Signups: {data.newSignups7d || 0} (7d) · {data.newSignups30d || 0} (30d)</span>
        <span>Readers: {data.totalReaders || 0}</span>
      </div>
    </div>
  )
}

// ─── Revenue Report ─────────────────────────────────────────

function RevenueReportResult({ data }: { data: any }) {
  const { pnl, timeSeries, period } = data

  const chartData = (timeSeries || []).map((d: any) => ({
    day: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: d.revenue,
    orders: d.orders,
    newUsers: d.newUsers,
  }))

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-emerald-400" />
        <span className="text-xs font-medium text-zinc-300">
          Revenue Report — Last {periodLabel(period)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <PnLCard label="Revenue" value={`$${(pnl?.revenue || 0).toFixed(2)}`} positive />
        <PnLCard label="Costs" value={`-$${(pnl?.costs?.total || 0).toFixed(2)}`} positive={false} />
        <PnLCard label="Net Profit" value={`$${(pnl?.netProfit || 0).toFixed(2)}`} positive={(pnl?.netProfit || 0) >= 0} />
      </div>

      {pnl?.costs && <CostBreakdown costs={pnl.costs} />}

      {chartData.length > 0 && (
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px', color: '#e4e4e7' }} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Cost Report ────────────────────────────────────────────

function CostReportResult({ data }: { data: any }) {
  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-medium text-zinc-300">
          Cost Analysis — Last {periodLabel(data.period)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <PnLCard label="Revenue" value={`$${(data.revenue || 0).toFixed(2)}`} positive />
        <PnLCard label="Total Costs" value={`-$${(data.costs?.total || 0).toFixed(2)}`} positive={false} />
        <PnLCard label="Margin" value={data.margin || 'N/A'} positive={!data.margin?.startsWith('-')} />
      </div>

      {data.costs && <CostBreakdown costs={data.costs} />}
    </div>
  )
}

// ─── Top Books ──────────────────────────────────────────────

function TopBooksResult({ data }: { data: any }) {
  const { books, period } = data

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-violet-400" />
        <span className="text-xs font-medium text-zinc-300">
          Top Books — Last {periodLabel(period)}
        </span>
      </div>

      {(books || []).length > 0 ? (
        <div className="space-y-1.5">
          {books.map((b: any, i: number) => (
            <div key={b.bookId || i} className="flex items-center gap-3 rounded-lg bg-[#0a0a0a] px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-violet-400 bg-violet-500/10">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-200">{b.title}</p>
                <p className="text-[10px] text-zinc-600">{b.authorName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[10px]">
                <span className="text-emerald-400">${(b.revenue || 0).toFixed(2)}</span>
                <span className="text-zinc-500">{b.orders} orders</span>
                <span className="text-zinc-600">{b.reads} reads</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No book data for this period.</p>
      )}
    </div>
  )
}

// ─── Top Authors ────────────────────────────────────────────

function TopAuthorsResult({ data }: { data: any }) {
  const { authors, period } = data

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-medium text-zinc-300">
          Author Leaderboard — Last {periodLabel(period)}
        </span>
      </div>

      {(authors || []).length > 0 ? (
        <div className="space-y-1.5">
          {authors.map((a: any, i: number) => (
            <div key={a.authorId || i} className="flex items-center gap-3 rounded-lg bg-[#0a0a0a] px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-amber-400 bg-amber-500/10">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-200">{a.displayName}</p>
                <p className="text-[10px] text-zinc-600">{a.bookCount} books · {a.totalReads} reads</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[10px]">
                <span className="text-emerald-400">${(a.totalRevenue || 0).toFixed(2)}</span>
                <span className="text-zinc-500">{a.totalOrders} orders</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No author data for this period.</p>
      )}
    </div>
  )
}

// ─── User Info ──────────────────────────────────────────────

function UserInfoResult({ data }: { data: any }) {
  const { users, total } = data

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-400" />
          <span className="text-xs font-medium text-zinc-300">Users</span>
        </div>
        <span className="text-[10px] text-zinc-600">{total || 0} total</span>
      </div>

      {(users || []).length > 0 ? (
        <div className="space-y-1.5">
          {users.map((u: any) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg bg-[#0a0a0a] px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-zinc-600" />
                  <p className="truncate text-xs text-zinc-200">{u.email}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[10px]">
                <span className={`rounded px-1.5 py-0.5 ${
                  u.role === 'admin' ? 'bg-red-500/10 text-red-400'
                  : u.role === 'author' ? 'bg-violet-500/10 text-violet-400'
                  : 'bg-zinc-500/10 text-zinc-400'
                }`}>
                  {u.role}
                </span>
                <span className="text-zinc-500">{u.orderCount} orders</span>
                <span className="text-zinc-600">
                  {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No users found.</p>
      )}
    </div>
  )
}

// ─── Author Info ────────────────────────────────────────────

function AuthorInfoResult({ data }: { data: any }) {
  const { authors, total } = data

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-violet-400" />
          <span className="text-xs font-medium text-zinc-300">Authors</span>
        </div>
        <span className="text-[10px] text-zinc-600">{total || 0} total</span>
      </div>

      {(authors || []).length > 0 ? (
        <div className="space-y-1.5">
          {authors.map((a: any) => (
            <div key={a.id} className="rounded-lg bg-[#0a0a0a] px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-200">{a.displayName}</p>
                  <p className="text-[10px] text-zinc-600">{a.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[10px]">
                  <span className="text-zinc-500">{a.bookCount} books</span>
                  <span className="text-emerald-400">${(a.totalRevenue || 0).toFixed(2)}</span>
                </div>
              </div>
              {a.walletAddress && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-700">
                  <Wallet className="h-3 w-3" />
                  <span className="truncate">{a.walletAddress}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No authors found.</p>
      )}
    </div>
  )
}

// ─── Order History ──────────────────────────────────────────

function OrderHistoryResult({ data }: { data: any }) {
  const { orders } = data

  return (
    <div className="my-2 space-y-3 rounded-xl border border-[#27272a] bg-[#111] p-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-medium text-zinc-300">Recent Orders</span>
      </div>

      {(orders || []).length > 0 ? (
        <div className="space-y-1.5">
          {orders.map((o: any) => (
            <div key={o.orderId} className="rounded-lg bg-[#0a0a0a] px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-zinc-200">{o.bookTitle}</p>
                  <p className="text-[10px] text-zinc-600">{o.userEmail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[10px]">
                  <span className={`rounded px-1.5 py-0.5 ${
                    o.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {o.status}
                  </span>
                  <span className="text-emerald-400">${(o.amount || 0).toFixed(2)}</span>
                  <span className="text-zinc-600">
                    {new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-700">
                <span>Author: ${(o.authorEarnings || 0).toFixed(2)}</span>
                <span>Platform: ${(o.platformFee || 0).toFixed(2)}</span>
                <span>Costs: ${(o.costShare || 0).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No orders found.</p>
      )}
    </div>
  )
}
