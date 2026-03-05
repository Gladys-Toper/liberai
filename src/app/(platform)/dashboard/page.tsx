import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Plus, MessageSquare, Eye, ArrowRight, BookOpen,
  Clock, BarChart3, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import {
  getCurrentUser,
  getCurrentAuthor,
  getAuthorDashboardBooks,
  getAuthorRecentConversations,
} from '@/lib/db/queries'
import { AuthorOnboarding } from './author-onboarding'
import { InsightsChat } from './insights-chat'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login?redirect=/dashboard')
  }

  const author = await getCurrentAuthor()

  if (!author) {
    const defaultName =
      user.user_metadata?.full_name || user.email?.split('@')[0] || ''
    return <AuthorOnboarding defaultName={defaultName} />
  }

  const [books, conversations] = await Promise.all([
    getAuthorDashboardBooks(author.id),
    getAuthorRecentConversations(author.id),
  ])

  const totalReads = books.reduce(
    (sum, b) => sum + (b.total_reads || 0),
    0,
  )
  const totalChats = books.reduce(
    (sum, b) => sum + (b.total_chats || 0),
    0,
  )

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="shrink-0 border-b border-[#1e1e1e] bg-[#0a0a0a]">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">
                {author.display_name}
              </h1>
              <p className="text-[11px] text-zinc-600">Author Dashboard</p>
            </div>
          </div>

          <Link href="/dashboard/new-book">
            <Button
              size="sm"
              className="h-8 bg-violet-500 px-3 text-xs font-medium text-white hover:bg-violet-600"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Book
            </Button>
          </Link>
        </div>
      </header>

      {/* ── Main layout: Data | Chat ─────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* ── Left: Data panels ─────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-6 py-6">
            {/* Stats row */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              <StatTile
                label="Total Reads"
                value={formatNumber(totalReads)}
                icon={<Eye className="h-4 w-4" />}
                accent="text-sky-400"
                bg="bg-sky-500/8"
              />
              <StatTile
                label="AI Conversations"
                value={formatNumber(totalChats)}
                icon={<MessageSquare className="h-4 w-4" />}
                accent="text-violet-400"
                bg="bg-violet-500/8"
              />
              <StatTile
                label="Published"
                value={String(books.length)}
                icon={<BookOpen className="h-4 w-4" />}
                accent="text-emerald-400"
                bg="bg-emerald-500/8"
              />
            </div>

            {/* Books section */}
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Your Books
                </h2>
                <span className="text-[11px] text-zinc-700">
                  {books.length} total
                </span>
              </div>

              {books.length > 0 ? (
                <div className="space-y-2">
                  {books.map((book) => (
                    <div
                      key={book.id}
                      className="group rounded-xl border border-[#1e1e1e] bg-[#111] p-4 transition-all duration-200 hover:border-[#2a2a2a] hover:bg-[#141414]"
                    >
                      <div className="flex items-center gap-4">
                        {/* Book initial */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/20 to-purple-600/10 text-sm font-bold text-violet-300">
                          {book.title.charAt(0)}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                            {book.title}
                          </h3>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-600">
                            {book.published_date && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(book.published_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {formatNumber(book.total_reads || 0)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {formatNumber(book.total_chats || 0)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Link href={`/dashboard/books/${book.id}/interactions`}>
                            <button className="flex h-7 items-center gap-1.5 rounded-md border border-[#27272a] bg-[#0e0e0e] px-2.5 text-[11px] text-zinc-400 transition-colors hover:border-violet-500/30 hover:text-violet-300">
                              <Zap className="h-3 w-3" />
                              Interactions
                            </button>
                          </Link>
                          <Link href={`/book/${book.id}`}>
                            <button className="flex h-7 items-center gap-1.5 rounded-md border border-[#27272a] bg-[#0e0e0e] px-2.5 text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white">
                              View
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#27272a] bg-[#0e0e0e] px-6 py-10 text-center">
                  <BookOpen className="mx-auto mb-3 h-8 w-8 text-zinc-800" />
                  <p className="mb-1 text-sm text-zinc-500">
                    No books published yet
                  </p>
                  <p className="mb-4 text-xs text-zinc-700">
                    Upload your first book to start engaging readers with AI
                  </p>
                  <Link href="/dashboard/new-book">
                    <Button
                      size="sm"
                      className="bg-violet-500 text-xs text-white hover:bg-violet-600"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Publish Your First Book
                    </Button>
                  </Link>
                </div>
              )}
            </section>

            {/* Recent conversations */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Recent Reader Activity
                </h2>
                <span className="text-[11px] text-zinc-700">
                  {conversations.length} conversations
                </span>
              </div>

              {conversations.length > 0 ? (
                <div className="space-y-1.5">
                  {conversations.map((conv) => (
                    <Link
                      key={conv.id}
                      href={`/dashboard/books/${conv.book_id}/interactions`}
                    >
                      <div className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all hover:border-[#1e1e1e] hover:bg-[#111]">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/8">
                          <MessageSquare className="h-3.5 w-3.5 text-violet-400/70" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-300 group-hover:text-white transition-colors">
                            {conv.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-zinc-700">
                            <span className="text-zinc-500">{conv.bookTitle}</span>
                            {' · '}
                            {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] tabular-nums text-zinc-700">
                            {formatRelativeTime(conv.updated_at)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-zinc-800 transition-colors group-hover:text-zinc-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#27272a] bg-[#0e0e0e] px-6 py-8 text-center">
                  <MessageSquare className="mx-auto mb-2 h-6 w-6 text-zinc-800" />
                  <p className="text-sm text-zinc-600">
                    No reader conversations yet
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-700">
                    Conversations appear here when readers chat with your book&apos;s AI
                  </p>
                </div>
              )}
            </section>
          </div>
        </main>

        {/* ── Right: AI Insights chat ────────────────────── */}
        <aside className="relative hidden w-[380px] shrink-0 border-l border-[#1e1e1e] bg-[#0c0c0c] lg:block xl:w-[420px]">
          {/* Subtle violet glow at top */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-violet-500/[0.03] to-transparent" />
          <InsightsChat
            authorId={author.id}
            authorName={author.display_name}
          />
        </aside>
      </div>
    </div>
  )
}

/* ── Stat tile ──────────────────────────────────────── */

function StatTile({
  label,
  value,
  icon,
  accent,
  bg,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent: string
  bg: string
}) {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${bg} ${accent}`}>
          {icon}
        </div>
        <span className="text-[11px] font-medium text-zinc-600">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
    </div>
  )
}

/* ── Relative time formatter ────────────────────────── */

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
