import {
  Bot,
  Radio,
  Shield,
  Zap,
  Users,
  Activity,
} from 'lucide-react'
import { getAgentStats, getActiveSwarms, getAgentEventLog, getAgentList } from '@/lib/db/queries/agents'
import { formatNumber } from '@/lib/utils'
import { StatTile } from '../components/stat-tile'

export default async function ObservatoryPage() {
  const [stats, swarms, events, { agents: topAgents }] = await Promise.all([
    getAgentStats().catch(() => null),
    getActiveSwarms().catch(() => []),
    getAgentEventLog(30).catch(() => []),
    getAgentList({ perPage: 10, status: 'active' }).catch(() => ({ agents: [], total: 0 })),
  ])

  // Sort agents by trust score for leaderboard
  const trustedAgents = [...topAgents]
    .sort((a, b) => Number(b.trust_score) - Number(a.trust_score))
    .slice(0, 8)

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600/30 to-teal-600/10">
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">
              Agent Observatory
            </h1>
            <p className="text-xs text-zinc-600">
              Real-time agent mesh monitoring
            </p>
          </div>
        </div>
      </div>

      {/* Pulse stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-3">
          <StatTile
            label="Active Agents"
            value={formatNumber(stats.activeAgents)}
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
            label="Events (24h)"
            value={formatNumber(stats.events24h)}
            icon={<Zap className="h-4 w-4" />}
            accent="text-violet-400"
            bg="bg-violet-500/8"
          />
          <StatTile
            label="Suspended"
            value={formatNumber(stats.suspendedAgents)}
            icon={<Shield className="h-4 w-4" />}
            accent="text-red-400"
            bg="bg-red-500/8"
          />
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        {/* Left column — Event Stream + Swarms (3/5) */}
        <div className="col-span-3 space-y-6">
          {/* Event Stream */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Event Stream
              </h2>
              <span className="text-[11px] text-zinc-700">
                {events.length} recent
              </span>
            </div>

            <div className="space-y-1">
              {events.length > 0 ? (
                events.map((event: {
                  id: string
                  event_type: string
                  payload: Record<string, unknown>
                  source_type: string
                  source_id: string | null
                  created_at: string
                }) => (
                  <EventRow key={event.id} event={event} />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[#27272a] bg-[#0e0e0e] px-6 py-8 text-center">
                  <Zap className="mx-auto mb-2 h-6 w-6 text-zinc-800" />
                  <p className="text-sm text-zinc-600">
                    No events dispatched yet
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Active Swarms */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Active Swarms
              </h2>
              <span className="text-[11px] text-zinc-700">
                {swarms.length} swarms
              </span>
            </div>

            {swarms.length > 0 ? (
              <div className="space-y-2">
                {swarms.map(
                  (swarm: {
                    id: string
                    name: string
                    purpose: string
                    status: string
                    task_type: string | null
                    max_members: number
                    ttl_minutes: number
                    created_at: string
                    formed_at: string | null
                    swarm_members: Array<{
                      id: string
                      agent_id: string
                      role: string
                    }>
                  }) => (
                    <SwarmCard key={swarm.id} swarm={swarm} />
                  ),
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#27272a] bg-[#0e0e0e] px-6 py-8 text-center">
                <Users className="mx-auto mb-2 h-6 w-6 text-zinc-800" />
                <p className="text-sm text-zinc-600">No active swarms</p>
              </div>
            )}
          </section>
        </div>

        {/* Right column — Trust Leaderboard (2/5) */}
        <div className="col-span-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Trust Leaderboard
              </h2>
              <span className="text-[11px] text-zinc-700">
                top {trustedAgents.length}
              </span>
            </div>

            {trustedAgents.length > 0 ? (
              <div className="space-y-1.5">
                {trustedAgents.map((agent, idx) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111] p-3 transition-all hover:border-[#2a2a2a] hover:bg-[#141414]"
                  >
                    {/* Rank */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-600/20 to-amber-600/5 text-[10px] font-bold text-amber-300">
                      {idx + 1}
                    </div>

                    {/* Agent info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-200">
                        {agent.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-600">
                        {agent.agent_type.replace('_', ' ')} &middot;{' '}
                        {agent.total_interactions} interactions
                      </p>
                    </div>

                    {/* Trust bar */}
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full rounded-full transition-all ${
                            Number(agent.trust_score) >= 0.7
                              ? 'bg-emerald-500'
                              : Number(agent.trust_score) >= 0.4
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{
                            width: `${Math.round(Number(agent.trust_score) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="min-w-[2.5rem] text-right font-mono text-[11px] tabular-nums text-amber-400">
                        {Number(agent.trust_score).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#27272a] bg-[#0e0e0e] px-6 py-8 text-center">
                <Shield className="mx-auto mb-2 h-6 w-6 text-zinc-800" />
                <p className="text-sm text-zinc-600">No agent data yet</p>
              </div>
            )}
          </section>

          {/* Agent Economics Summary */}
          {stats && stats.agentRevenue30d > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Agent Economics (30d)
              </h2>
              <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">
                    M2M Volume
                  </span>
                  <span className="text-sm font-medium tabular-nums text-emerald-400">
                    ${stats.agentRevenue30d.toFixed(2)}
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Event Row ─────────────────────────────────────

const EVENT_CONFIG: Record<
  string,
  { icon: typeof Bot; color: string; label: (p: Record<string, unknown>) => string }
> = {
  agent_registered: {
    icon: Bot,
    color: 'text-cyan-400 bg-cyan-500/10',
    label: (p) => `${p.agentName || 'Agent'} joined the mesh`,
  },
  swarm_formed: {
    icon: Users,
    color: 'text-teal-400 bg-teal-500/10',
    label: (p) => `Swarm "${p.name || '?'}" formed with ${p.memberCount || '?'} agents`,
  },
  swarm_dissolved: {
    icon: Users,
    color: 'text-zinc-500 bg-zinc-500/10',
    label: (p) => `Swarm "${p.name || '?'}" dissolved`,
  },
  agent_task_completed: {
    icon: Zap,
    color: 'text-violet-400 bg-violet-500/10',
    label: (p) => `Task ${p.method || ''} completed (${p.status || 'done'})`,
  },
  trust_update: {
    icon: Shield,
    color: 'text-amber-400 bg-amber-500/10',
    label: (p) => `Trust updated → ${p.newScore || '?'}`,
  },
}

function EventRow({
  event,
}: {
  event: {
    id: string
    event_type: string
    payload: Record<string, unknown>
    source_type: string
    source_id: string | null
    created_at: string
  }
}) {
  const config = EVENT_CONFIG[event.event_type]
  const Icon = config?.icon || Zap
  const colorClass = config?.color || 'text-zinc-400 bg-zinc-500/10'
  const label = config?.label(event.payload) || event.event_type

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-[#111]">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${colorClass}`}
      >
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-zinc-300">{label}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            event.source_type === 'agent'
              ? 'bg-cyan-500/10 text-cyan-400'
              : event.source_type === 'human'
                ? 'bg-violet-500/10 text-violet-400'
                : 'bg-zinc-500/10 text-zinc-500'
          }`}
        >
          {event.source_type}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-zinc-700">
          {new Date(event.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}

// ─── Swarm Card ─────────────────────────────────────

function SwarmCard({
  swarm,
}: {
  swarm: {
    id: string
    name: string
    purpose: string
    status: string
    task_type: string | null
    max_members: number
    ttl_minutes: number
    created_at: string
    formed_at: string | null
    swarm_members: Array<{ id: string; agent_id: string; role: string }>
  }
}) {
  const memberCount = swarm.swarm_members?.length || 0
  const statusColor =
    swarm.status === 'active'
      ? 'border-cyan-500/30 bg-cyan-500/5'
      : swarm.status === 'forming'
        ? 'border-teal-500/30 bg-teal-500/5'
        : 'border-zinc-700 bg-zinc-900/50'

  return (
    <div
      className={`rounded-xl border p-4 transition-all hover:bg-[#141414] ${statusColor}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-teal-400" />
          <span className="text-sm font-medium text-zinc-200">
            {swarm.name}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            swarm.status === 'active'
              ? 'bg-cyan-500/10 text-cyan-400'
              : 'bg-teal-500/10 text-teal-400'
          }`}
        >
          {swarm.status}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-zinc-500 line-clamp-2">
        {swarm.purpose}
      </p>
      <div className="flex items-center gap-3 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {memberCount}/{swarm.max_members}
        </span>
        {swarm.task_type && (
          <span className="rounded bg-zinc-800/50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500">
            {swarm.task_type}
          </span>
        )}
        <span>TTL: {swarm.ttl_minutes}m</span>
        <span>
          {new Date(swarm.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
    </div>
  )
}
