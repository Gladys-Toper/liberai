import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, MessageSquare, Users, BookOpen,
  TrendingUp, FileText, Hash,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  getCurrentUser,
  getCurrentAuthor,
  getBook,
  getBookConversations,
  getBookInteractionStats,
} from '@/lib/db/queries'
import { ConversationList } from './conversation-list'

function StatCard({
  label,
  value,
  icon: Icon,
  sublabel,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  sublabel?: string
}) {
  return (
    <Card className="border-[#27272a] bg-[#141414] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-white">{value}</p>
          {sublabel && (
            <p className="mt-1 text-xs text-zinc-600">{sublabel}</p>
          )}
        </div>
        <div className="rounded-lg bg-violet-500/10 p-2.5">{Icon}</div>
      </div>
    </Card>
  )
}

export default async function InteractionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: bookId } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login?redirect=/dashboard')

  const author = await getCurrentAuthor()
  if (!author) redirect('/dashboard')

  const book = await getBook(bookId)
  if (!book) notFound()

  // Verify this author owns this book
  if (book.author_id !== author.id) {
    redirect('/dashboard')
  }

  const [conversations, stats] = await Promise.all([
    getBookConversations(bookId),
    getBookInteractionStats(bookId),
  ])

  const avgMessagesPerConvo =
    stats.totalConversations > 0
      ? Math.round(stats.totalMessages / stats.totalConversations)
      : 0

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                Reader Interactions
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {book.title}
              </p>
            </div>
          </div>
        </div>

        {/* ── Stats Grid ─────────────────────────────────── */}
        <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Conversations"
            value={stats.totalConversations}
            icon={<MessageSquare className="h-5 w-5 text-violet-400" />}
          />
          <StatCard
            label="Total Messages"
            value={stats.totalMessages}
            icon={<Hash className="h-5 w-5 text-violet-400" />}
            sublabel={`${stats.totalUserMessages} questions · ${stats.totalAssistantMessages} answers`}
          />
          <StatCard
            label="Avg. per Session"
            value={avgMessagesPerConvo}
            icon={<TrendingUp className="h-5 w-5 text-violet-400" />}
            sublabel="messages"
          />
          <StatCard
            label="Unique Questions"
            value={stats.topQuestions.length}
            icon={<Users className="h-5 w-5 text-violet-400" />}
            sublabel="distinct topics"
          />
        </div>

        {/* ── Two-Column Layout ──────────────────────────── */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left: Conversations (2/3 width) */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Chat Sessions
            </h2>
            <ConversationList
              conversations={conversations}
              bookTitle={book.title}
            />
          </div>

          {/* Right: Insights sidebar (1/3 width) */}
          <div className="space-y-6">
            {/* Top Questions */}
            <div>
              <h2 className="mb-4 text-lg font-semibold text-white">
                Most-Asked Questions
              </h2>
              {stats.topQuestions.length > 0 ? (
                <div className="space-y-2">
                  {stats.topQuestions.map((q, i) => (
                    <Card
                      key={i}
                      className="border-[#27272a] bg-[#141414] p-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-violet-500/15 text-[10px] font-bold text-violet-400">
                          {q.count}
                        </span>
                        <p className="text-sm leading-relaxed text-zinc-300 line-clamp-3">
                          {q.question}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-[#27272a] bg-[#141414] p-6 text-center">
                  <p className="text-sm text-zinc-500">
                    No questions yet
                  </p>
                </Card>
              )}
            </div>

            {/* Most-Cited Passages */}
            <div>
              <h2 className="mb-4 text-lg font-semibold text-white">
                Most-Cited Passages
              </h2>
              {stats.topCitedChunks.length > 0 ? (
                <div className="space-y-2">
                  {stats.topCitedChunks.map((chunk) => (
                    <Card
                      key={chunk.id}
                      className="border-[#27272a] bg-[#141414] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <BookOpen className="h-3 w-3 text-violet-400" />
                          <span className="text-[11px] font-medium text-violet-400">
                            {chunk.chapterTitle}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-600">
                          cited {chunk.count}×
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-400 line-clamp-4">
                        {chunk.content}
                      </p>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-[#27272a] bg-[#141414] p-6 text-center">
                  <p className="text-sm text-zinc-500">
                    No cited passages yet
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
