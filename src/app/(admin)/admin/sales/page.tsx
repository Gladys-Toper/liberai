import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Percent,
} from 'lucide-react'
import { StatTile } from '../components/stat-tile'
import {
  getPlatformPnL,
  getRecentOrders,
} from '@/lib/db/queries/admin'

export default async function SalesPage() {
  const [pnl, recentOrders] = await Promise.all([
    getPlatformPnL(30),
    getRecentOrders(20),
  ])

  const margin =
    pnl.revenue > 0
      ? ((pnl.netProfit / pnl.revenue) * 100).toFixed(1)
      : '0.0'

  return (
    <div className="px-6 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Sales &amp; Revenue</h1>
        <p className="text-xs text-zinc-600">Last 30 days</p>
      </div>

      {/* Revenue stats */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatTile
          label="Revenue"
          value={`$${pnl.revenue.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          accent="text-emerald-400"
          bg="bg-emerald-500/8"
        />
        <StatTile
          label="Total Costs"
          value={`$${pnl.costs.total.toFixed(2)}`}
          icon={<TrendingDown className="h-4 w-4" />}
          accent="text-red-400"
          bg="bg-red-500/8"
        />
        <StatTile
          label="Net Profit"
          value={`$${pnl.netProfit.toFixed(2)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent={pnl.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          bg={pnl.netProfit >= 0 ? 'bg-emerald-500/8' : 'bg-red-500/8'}
        />
        <StatTile
          label="Margin"
          value={`${margin}%`}
          icon={<Percent className="h-4 w-4" />}
          accent="text-violet-400"
          bg="bg-violet-500/8"
        />
      </div>

      {/* Cost breakdown */}
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Cost Breakdown
        </h2>
        <div className="grid grid-cols-4 gap-3">
          <CostCard label="AI" value={pnl.costs.ai} total={pnl.costs.total} />
          <CostCard label="Embeddings" value={pnl.costs.embedding} total={pnl.costs.total} />
          <CostCard label="Storage" value={pnl.costs.storage} total={pnl.costs.total} />
          <CostCard label="Infrastructure" value={pnl.costs.infra} total={pnl.costs.total} />
        </div>
      </section>

      {/* Orders table */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Recent Orders
          </h2>
          <span className="text-[11px] text-zinc-700">
            {recentOrders.length} orders
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#1e1e1e]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1e1e1e] bg-[#0c0c0c]">
                <th className="px-4 py-2.5 font-medium text-zinc-500">Book</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Customer</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Status</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">
                  Amount
                </th>
                <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">
                  Author
                </th>
                <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">
                  Platform
                </th>
                <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">
                  Costs
                </th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <tr
                    key={order.orderId}
                    className="border-b border-[#1e1e1e] last:border-0 bg-[#111] transition-colors hover:bg-[#141414]"
                  >
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-zinc-300">
                      {order.bookTitle}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {order.userEmail}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          order.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">
                      ${order.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                      ${order.authorEarnings.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                      ${order.platformFee.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                      ${order.costShare.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {new Date(order.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-zinc-600">
                    No orders yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function CostCard({
  label,
  value,
  total,
}: {
  label: string
  value: number
  total: number
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(0) : '0'
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-3">
      <p className="text-[11px] font-medium text-zinc-600">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-white">
        ${value.toFixed(2)}
      </p>
      <div className="mt-2 h-1 rounded-full bg-[#1e1e1e]">
        <div
          className="h-1 rounded-full bg-red-500/60"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-zinc-700">{pct}% of total</p>
    </div>
  )
}
