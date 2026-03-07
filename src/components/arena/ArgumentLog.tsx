'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Swords, Shield } from 'lucide-react'

interface Argument {
  id: string
  side: 'a' | 'b'
  move_type: string
  claim: string
  grounds: string | null
  warrant: string | null
  referee_verdict: { verdict_summary: string } | null
}

interface Round {
  round_number: number
  attacker_side: string
  hp_deltas: Array<{ axiom_label: string; delta: number; reason: string }>
  commentary: string | null
}

interface ArgumentLogProps {
  rounds: Round[]
  args: Argument[]
  bookATitle: string
  bookBTitle: string
}

export function ArgumentLog({ rounds, args, bookATitle, bookBTitle }: ArgumentLogProps) {
  const [expanded, setExpanded] = useState(false)

  if (rounds.length === 0) return null

  return (
    <div className="rounded-xl border border-[#27272a] bg-[#141414]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-medium text-zinc-300">
          Argument Log ({rounds.length} round{rounds.length !== 1 ? 's' : ''})
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[#27272a] p-4 space-y-4 max-h-96 overflow-y-auto">
          {rounds.map((round) => {
            const roundArgs = args.filter(
              (a) => round.round_number === Math.ceil(args.indexOf(a) / 2 + 0.5) // simplified: just filter
            )
            const attackArg = args.find(
              (a) => a.side === round.attacker_side && a.move_type === 'attack'
            )
            const defenseArg = args.find(
              (a) => a.side !== round.attacker_side && (a.move_type === 'defense' || a.move_type === 'concession')
            )

            const attackerBook = round.attacker_side === 'a' ? bookATitle : bookBTitle
            const defenderBook = round.attacker_side === 'a' ? bookBTitle : bookATitle

            return (
              <div key={round.round_number} className="rounded-lg bg-[#0a0a0a] p-3">
                <p className="text-xs font-bold text-zinc-400 mb-2">
                  Round {round.round_number}
                </p>

                {/* Attack */}
                {attackArg && (
                  <div className="mb-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Swords className="h-3 w-3 text-red-400" />
                      <span className="text-xs font-medium text-red-400">{attackerBook} attacks:</span>
                    </div>
                    <p className="text-xs text-zinc-400 pl-5">{attackArg.claim}</p>
                  </div>
                )}

                {/* Defense */}
                {defenseArg && (
                  <div className="mb-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className="h-3 w-3 text-blue-400" />
                      <span className="text-xs font-medium text-blue-400">
                        {defenderBook} {defenseArg.move_type === 'concession' ? 'concedes' : 'defends'}:
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 pl-5">{defenseArg.claim}</p>
                  </div>
                )}

                {/* HP Deltas */}
                {round.hp_deltas?.map((delta, i) => (
                  <p key={i} className={`text-xs font-mono ${delta.delta < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {delta.axiom_label}: {delta.delta > 0 ? '+' : ''}{delta.delta} HP
                  </p>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
