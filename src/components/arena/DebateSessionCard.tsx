'use client'

import Link from 'next/link'
import { Swords, Eye, Trophy } from 'lucide-react'

interface DebateCardProps {
  debate: Record<string, unknown>
}

const statusColors: Record<string, string> = {
  setup: 'bg-zinc-500/10 text-zinc-400',
  extracting: 'bg-amber-500/10 text-amber-400',
  active: 'bg-green-500/10 text-green-400',
  paused: 'bg-yellow-500/10 text-yellow-400',
  completed: 'bg-blue-500/10 text-blue-400',
  abandoned: 'bg-red-500/10 text-red-400',
}

export function DebateSessionCard({ debate }: DebateCardProps) {
  const bookARaw = debate.book_a as { title: string; author?: { display_name: string } | null } | null
  const bookBRaw = debate.book_b as { title: string; author?: { display_name: string } | null } | null
  const bookA = bookARaw ? { title: bookARaw.title, author_name: bookARaw.author?.display_name || 'Unknown' } : null
  const bookB = bookBRaw ? { title: bookBRaw.title, author_name: bookBRaw.author?.display_name || 'Unknown' } : null
  const status = debate.status as string
  const currentRound = debate.current_round as number
  const maxRounds = debate.max_rounds as number
  const winner = debate.winner as string | null
  const winCondition = debate.win_condition as string | null
  const isLive = status === 'active' || status === 'extracting'

  return (
    <Link
      href={`/arena/${debate.id}`}
      className="group block rounded-xl border border-[#27272a] bg-[#141414] p-5 transition-all hover:border-[#3f3f46] hover:bg-[#1a1a1a]"
    >
      {/* Status Badge */}
      <div className="mb-3 flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status] || statusColors.setup}`}>
          {isLive && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        <span className="text-xs text-zinc-600">
          Round {currentRound}/{maxRounds}
        </span>
      </div>

      {/* Book vs Book */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-red-400">
            {bookA?.title || 'Unknown'}
          </p>
          <p className="truncate text-xs text-zinc-600">{bookA?.author_name}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#27272a]">
          <Swords className="h-3.5 w-3.5 text-zinc-500" />
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="truncate text-sm font-medium text-blue-400">
            {bookB?.title || 'Unknown'}
          </p>
          <p className="truncate text-xs text-zinc-600">{bookB?.author_name}</p>
        </div>
      </div>

      {/* Crucible Preview */}
      <p className="mt-3 line-clamp-2 text-xs text-zinc-500 italic">
        &ldquo;{debate.crucible_question as string}&rdquo;
      </p>

      {/* Winner (if completed) */}
      {status === 'completed' && winner && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-400">
          <Trophy className="h-3 w-3" />
          Winner: {winner === 'a' ? bookA?.title : bookB?.title}
          {winCondition && ` (${winCondition})`}
        </div>
      )}

      {/* CTA */}
      <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-violet-400 opacity-0 transition-opacity group-hover:opacity-100">
        {isLive ? (
          <>
            <Eye className="h-3 w-3" />
            WATCH LIVE
          </>
        ) : (
          <>
            <Eye className="h-3 w-3" />
            VIEW RESULTS
          </>
        )}
      </div>
    </Link>
  )
}
