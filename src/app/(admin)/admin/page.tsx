import {
  Users,
  BookOpen,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Eye,
  MessageSquare,
  ArrowRight,
  Crown,
} from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import { StatTile } from './components/stat-tile'
import {
  getPlatformOverview,
  getTopBooksByRevenue,
  getAuthorLeaderboard,
  getRecentOrders,
} from '@/lib/db/queries/admin'

export default async function AdminOverviewPage() {
  const [overview, topBooks, topAuthors, recentOrders] = await Promise.all([
    getPlatformOverview(30),
    getTopBooksByRevenue(5, 30),
    getAuthorLeaderboard(5, 30),
    getRecentOrders(10),
  ])

  return (
    <div className="px-6 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Platform Overview</h1>
        <p className="text-xs text-zinc-600">Last 30 days</p>
      </div>

      {/* Stats row 1 — Users & Content */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatTile
          label="Total Users"
          value={formatNumber(overview.totalUsers)}
          icon={<Users className="h-4 w-4" />}
          accent="text-sky-400"
          bg="bg-sky-500/8"
        />
        <StatTile
          label="Authors"
          value={formatNumber(overview.totalAuthors)}
          icon={<BookOpen className="h-4 w-4" />}
          accent="text-violet-400"
          bg="bg-violet-500/8"
        />
        <StatTile
          label="Signups (7d)"
          value={formatNumber(overview.newSignups7d)}
          icon={<UserPlus className="h-4 w-4" />}
          accent="text-emerald-400"
          bg="bg-emerald-500/8"
        />
        <StatTile
          label="Signups (30d)"
          value={formatNumber(overview.newSignups30d)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-blue-400"
          bg="bg-blue-500/8"
        />
      </div>

      {/* Stats row 2 — Revenue */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatTile
          label="Revenue"
          value={`$${overview.totalRevenue.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          accent="text-emerald-400"
          bg="bg-emerald-500/8"
        />
        <StatTile
          label="Orders"
          value={formatNumber(overview.totalOrders)}
          icon={<ShoppingCart className="h-4 w-4" />}
          accent="text-amber-400"
          bg="bg-amber-500/8"
        />
        <StatTile
          label="Total Costs"
          value={`$${overview.totalCosts.toFixed(2)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-red-400"
          bg="bg-red-500/8"
        />
        <StatTile
          label="Net Profit"
          value={`$${overview.netProfit.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          accent={overview.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          bg={overview.netProfit >= 0 ? 'bg-emerald-500/8' : 'bg-red-500/8'}
        />
      </div>

      {/* Top Books */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Top Books by Revenue
          </h2>
          <span className="text-[11px] text-zinc-700">{topBooks.length} books</span>
        </div>

        {topBooks.length > 0 ? (
          <div className="space-y-2">
            {topBooks.map((book, idx) => (
              <div
                key={book.bookId}
                className="flex items-center gap-4 rounded-xl border border-[#1e1e1e] bg-[#111] p-4 transition-all hover:border-[#2a2a2a] hover:bg-[#141414]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600/20 to-emerald-600/5 text-xs font-bold text-emerald-300">
                  #{idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {book.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    by {book.authorName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-[11px] text-zinc-600">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-emerald-500" />
                    ${book.revenue.toFixed(2)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    {book.orders}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {formatNumber(book.reads)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {formatNumber(book.chats)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<BookOpen className="h-6 w-6" />} text="No book data yet" />
        )}
      </section>

      {/* Author Leaderboard */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Author Leaderboard
          </h2>
          <span className="text-[11px] text-zinc-700">{topAuthors.length} authors</span>
        </div>

        {topAuthors.length > 0 ? (
          <div className="space-y-2">
            {topAuthors.map((author, idx) => (
              <div
                key={author.authorId}
                className="flex items-center gap-4 rounded-xl border border-[#1e1e1e] bg-[#111] p-4 transition-all hover:border-[#2a2a2a] hover:bg-[#141414]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-600/20 to-amber-600/5 text-xs font-bold text-amber-300">
                  <Crown className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200">
                    {author.displayName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    {author.bookCount} book{author.bookCount !== 1 ? 's' : ''} &middot;{' '}
                    {formatNumber(author.totalReads)} reads
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-[11px] text-zinc-600">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-emerald-500" />
                    ${author.totalRevenue.toFixed(2)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    {author.totalOrders}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Crown className="h-6 w-6" />} text="No author data yet" />
        )}
      </section>

      {/* Recent Orders */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Recent Orders
          </h2>
          <span className="text-[11px] text-zinc-700">{recentOrders.length} orders</span>
        </div>

        {recentOrders.length > 0 ? (
          <div className="space-y-1.5">
            {recentOrders.map((order) => (
              <div
                key={order.orderId}
                className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all hover:border-[#1e1e1e] hover:bg-[#111]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/8">
                  <ShoppingCart className="h-3.5 w-3.5 text-amber-400/70" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-300">
                    {order.bookTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-700">
                    {order.userEmail}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      order.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {order.status}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-emerald-400">
                    ${order.amount.toFixed(2)}
                  </span>
                  <span className="text-[10px] tabular-nums text-zinc-700">
                    {new Date(order.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<ShoppingCart className="h-6 w-6" />} text="No orders yet" />
        )}
      </section>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#27272a] bg-[#0e0e0e] px-6 py-8 text-center">
      <div className="mx-auto mb-2 text-zinc-800">{icon}</div>
      <p className="text-sm text-zinc-600">{text}</p>
    </div>
  )
}
