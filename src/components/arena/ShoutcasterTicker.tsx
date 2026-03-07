'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Flame } from 'lucide-react'

interface ShoutcasterTickerProps {
  commentaries: Array<{ round: number; text: string }>
  modelAttribution?: {
    referee: string
    commentator: string
  }
}

export function ShoutcasterTicker({ commentaries, modelAttribution }: ShoutcasterTickerProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)

  const latest = commentaries[commentaries.length - 1]

  useEffect(() => {
    if (!latest) return
    if (commentaries.length - 1 === currentIndex) return

    setCurrentIndex(commentaries.length - 1)
    setDisplayedText('')

    const text = latest.text
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
      }
    }, 18)

    return () => clearInterval(interval)
  }, [commentaries.length, latest, currentIndex])

  if (!latest) {
    return (
      <div
        className="rounded-lg p-4"
        style={{
          background: '#0a1a1a',
          border: '1px solid rgba(6,182,212,0.1)',
        }}
      >
        <p className="text-sm text-cyan-500/50 italic">Awaiting first exchange...</p>
      </div>
    )
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: '#0a1a1a',
        border: '1px solid rgba(6,182,212,0.15)',
        boxShadow: '0 0 16px rgba(6,182,212,0.05)',
      }}
    >
      {/* Header bar */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{
          background: 'linear-gradient(90deg, rgba(6,182,212,0.08), transparent)',
          borderBottom: '1px solid rgba(6,182,212,0.1)',
        }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Flame className="h-3.5 w-3.5 text-cyan-400" />
          </motion.div>
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-[0.15em]">
            Round {latest.round} Commentary
          </span>
        </div>

        {/* Model attribution badges */}
        {modelAttribution && (
          <div className="hidden sm:flex items-center gap-2 text-[10px]">
            <span className="text-zinc-600">
              Judged by <span className="font-bold text-blue-400">{modelAttribution.referee}</span>
            </span>
            <span className="text-zinc-800">•</span>
            <span className="text-zinc-600">
              Commentary by <span className="font-bold text-red-400">{modelAttribution.commentator}</span>
            </span>
          </div>
        )}
      </div>

      {/* Latest commentary with typewriter */}
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed text-cyan-100/80">
          {displayedText}
          {displayedText.length < latest.text.length && (
            <motion.span
              className="inline-block w-1.5 h-4 ml-0.5 align-middle"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              style={{ background: '#06b6d4' }}
            />
          )}
        </p>
      </div>

      {/* Previous commentaries */}
      {commentaries.length > 1 && (
        <div
          className="px-4 pb-3 max-h-24 overflow-y-auto space-y-1.5"
          style={{ borderTop: '1px solid rgba(6,182,212,0.08)' }}
        >
          <div className="pt-2">
            {commentaries.slice(0, -1).reverse().map((c) => (
              <p key={c.round} className="text-xs text-zinc-600 py-0.5">
                <span className="text-zinc-500 font-mono tabular-nums">R{c.round}:</span>{' '}
                {c.text.length > 120 ? c.text.slice(0, 120) + '...' : c.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
