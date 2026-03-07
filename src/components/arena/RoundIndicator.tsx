'use client'

interface RoundIndicatorProps {
  currentRound: number
  maxRounds: number
  status: string
}

export function RoundIndicator({ currentRound, maxRounds, status }: RoundIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: maxRounds }, (_, i) => {
        const roundNum = i + 1
        const isCurrent = roundNum === currentRound + 1 && status === 'active'
        const isCompleted = roundNum <= currentRound

        return (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all ${
              isCurrent
                ? 'bg-violet-500 ring-2 ring-violet-500/30 animate-pulse'
                : isCompleted
                  ? 'bg-violet-400'
                  : 'bg-[#27272a]'
            }`}
          />
        )
      })}
    </div>
  )
}
