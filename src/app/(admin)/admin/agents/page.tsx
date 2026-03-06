import {
  Bot,
  Shield,
  Zap,
  DollarSign,
  Search,
  Radio,
  Activity,
  Users,
} from 'lucide-react'
import { getAgentList, getAgentStats } from '@/lib/db/queries/agents'
import { formatNumber } from '@/lib/utils'
import { StatTile } from '../components/stat-tile'

export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const type = typeof params.type === 'string' ? params.type : undefined
  const status = typeof params.status === 'string' ? params.status : undefined
  const page = typeof params.page === 'string' ? Number(params.page) : 1
  const perPage = 20

  const [{ agents, total }, stats] = await Promise.all([
    getAgentList({ page, perPage, type, status }),
    getAgentStats().catch(() => null),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Agent Registry</h1>
        <p className="text-xs text-zinc-600">
          Registered agents, trust scores &amp; economics
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-3">
          <StatTile
            label="Total Agents"
            value={formatNumber(stats.totalAgents)}
            icon={<Bot className="h-4 w-4" />}
            accent="text-cyan-400"
            bg="bg-cyan-500/8"
          />
          <StatTile
            label="Active Swarms"
            value={formatNumber(stats.activeSwarms)}
            icon={<Radio className="h-4 w-4" />}
            accent="text-teal-400"
            bg="bg-teal-500/8"
          />
          <StatTile
            label="Avg Trust"
            value={stats.avgTrustScore.toFixed(2)}
            icon={<Shield className="h-4 w-4" />}
            accent="text-amber-400"
            bg="bg-amber-500/8"
          />
          <StatTile
            label="Events (24h)"
            value={formatNumber(stats.events24h)}
            icon={<Zap className="h-4 w-4" />}
            accent="text-violet-400"
            bg="bg-violet-500/8"
          />
        </div>
      )}

      {/* Type distribution */}
      {stats && Object.keys(stats.byType).length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(stats.byType).map(([agentType, count]) => (
            <span
              key={agentType}
              className="rounded-full border border-[#1e1e1e] bg-[#111] px-3 py-1 text-[11px] text-zinc-400"
            >
              {agentType}{' '}
              <span className="font-medium text-cyan-400">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <form className="mb-4 flex items-center gap-2">
        <select
          name="type"
          defaultValue={type || ''}
          className="rounded-lg border border-[#27272a] bg-[#0e0e0e] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-cyan-500/50"
        >
          <option value="">All types</option>
          <option value="reader">Reader</option>
          <option value="author_assistant">Author Assistant</option>
          <option value="reviewer">Reviewer</option>
          <option value="researcher">Researcher</option>
          <option value="curator">Curator</option>
          <option value="translator">Translator</option>
          <option value="summarizer">Summarizer</option>
          <option value="custom">Custom</option>
        </select>
        <select
          name="status"
          defaultValue={status || ''}
          className="rounded-lg border border-[#27272a] bg-[#0e0e0e] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-cyan-500/50"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-cyan-700"
        >
          Filter
        </button>
      </form>

      {/* Agent Table */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Agents
          </h2>
          <span className="text-[11px] text-zinc-700">{total} total</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#1e1e1e]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1e1e1e] bg-[#0c0c0c]">
                <th className="px-4 py-2.5 font-medium text-zinc-500">Agent</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Type</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Status</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Trust</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Interactions</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Rate</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Earned</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Protocols</th>
              </tr>
            </thead>
            <tbody>
              {agents.length > 0 ? (
                agents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="border-b border-[#1e1e1e] bg-[#111] transition-colors last:border-0 hover:bg-[#141414]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600/20 to-cyan-600/5">
                          <Bot className="h-3.5 w-3.5 text-cyan-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-200">
                            {agent.name}
                          </p>
                          {agent.description && (
                            <p className="mt-0.5 truncate text-[10px] text-zinc-600">
                              {agent.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <TypeBadge type={agent.agent_type} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <TrustBar
                        score={Number(agent.trust_score)}
                        total={agent.total_interactions}
                      />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-400">
                      <span className="text-emerald-400">
                        {agent.successful_interactions}
                      </span>
                      <span className="text-zinc-700"> / </span>
                      {agent.total_interactions}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-400">
                      {Number(agent.rate_per_call) > 0 ? (
                        <span className="text-amber-400">
                          ${Number(agent.rate_per_call).toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-zinc-700">free</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-emerald-400">
                      ${Number(agent.total_earned_usd).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {agent.protocols.map((p) => (
                          <span
                            key={p}
                            className="rounded bg-zinc-800/50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-zinc-600"
                  >
                    <Bot className="mx-auto mb-2 h-6 w-6 text-zinc-800" />
                    No agents found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={`/admin/agents?page=${page - 1}${type ? `&type=${type}` : ''}${status ? `&status=${status}` : ''}`}
                  className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                >
                  Previous
                </a>
              )}
              {page < totalPages && (
                <a
                  href={`/admin/agents?page=${page + 1}${type ? `&type=${type}` : ''}${status ? `&status=${status}` : ''}`}
                  className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                >
                  Next
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    reader: 'bg-sky-500/10 text-sky-400',
    author_assistant: 'bg-violet-500/10 text-violet-400',
    reviewer: 'bg-amber-500/10 text-amber-400',
    researcher: 'bg-emerald-500/10 text-emerald-400',
    curator: 'bg-pink-500/10 text-pink-400',
    translator: 'bg-blue-500/10 text-blue-400',
    summarizer: 'bg-teal-500/10 text-teal-400',
    custom: 'bg-zinc-500/10 text-zinc-400',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[type] || 'bg-zinc-500/10 text-zinc-400'}`}
    >
      {type.replace('_', ' ')}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400',
    inactive: 'bg-zinc-500/10 text-zinc-500',
    suspended: 'bg-red-500/10 text-red-400',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] || 'bg-zinc-500/10 text-zinc-400'}`}
    >
      {status}
    </span>
  )
}

function TrustBar({ score, total }: { score: number; total: number }) {
  const pct = Math.round(score * 100)
  const color =
    score >= 0.7
      ? 'bg-emerald-500'
      : score >= 0.4
        ? 'bg-amber-500'
        : 'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-zinc-300">{score.toFixed(2)}</span>
    </div>
  )
}
