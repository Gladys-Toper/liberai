'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AxiomHpBar } from './AxiomHpBar'
import { Zap, Cpu } from 'lucide-react'

// ── Provider brand config ──────────────────────────────────────────────
const PROVIDER_BADGE: Record<string, { label: string; color: string; bg: string; Icon: typeof Zap }> = {
  claude: { label: 'CLAUDE', color: '#f97316', bg: 'rgba(249,115,22,0.1)', Icon: Zap },
  openai: { label: 'GPT', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', Icon: Cpu },
}

interface Axiom {
  id: string
  label: string
  hp_current: number
  is_destroyed: boolean
  axiom_index: number
}

interface AxiomPanelProps {
  side: 'a' | 'b'
  bookTitle: string
  authorName: string
  axioms: Axiom[]
  lastDamagedId?: string
  model?: string // 'claude' | 'openai'
}

export function AxiomPanel({ side, bookTitle, authorName, axioms, lastDamagedId, model }: AxiomPanelProps) {
  const sideColor = side === 'a' ? '#ef4444' : '#3b82f6'
  const sideColorClass = side === 'a' ? 'text-red-400' : 'text-blue-400'
  const borderColor = side === 'a' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'
  const totalHp = axioms.reduce((sum, a) => sum + a.hp_current, 0)
  const maxHp = axioms.length * 100
  const hpPercent = maxHp > 0 ? (totalHp / maxHp) * 100 : 0

  const provider = model ? PROVIDER_BADGE[model] : null

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: '#141414',
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 12px ${side === 'a' ? 'rgba(239,68,68,0.05)' : 'rgba(59,130,246,0.05)'}`,
      }}
    >
      {/* Top accent bar */}
      <div className="h-0.5" style={{ background: sideColor, opacity: 0.4 }} />

      <div className="p-4">
        {/* Book Header + Model Badge */}
        <div className="mb-4">
          {/* Model badge */}
          {provider && (
            <div
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-[0.15em] mb-2"
              style={{
                background: provider.bg,
                border: `1px solid ${provider.color}30`,
                color: provider.color,
              }}
            >
              <provider.Icon className="w-2.5 h-2.5" />
              {provider.label}
            </div>
          )}

          <p className={`text-sm font-bold ${sideColorClass}`}>{bookTitle}</p>
          <p className="text-xs text-zinc-600">{authorName}</p>

          {/* Total HP summary */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#0a0a0a' }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${hpPercent}%` }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                style={{
                  background: hpPercent > 60
                    ? sideColor
                    : hpPercent > 30
                      ? '#eab308'
                      : '#ef4444',
                }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 font-mono tabular-nums shrink-0">
              {totalHp}/{maxHp}
            </span>
          </div>
        </div>

        {/* Axiom List */}
        <div className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {axioms.map((axiom) => {
              const isDamaged = lastDamagedId === axiom.id
              const isDestroyed = axiom.is_destroyed

              return (
                <motion.div
                  key={axiom.id}
                  layout
                  className="relative rounded-lg p-3"
                  style={{
                    background: isDestroyed ? '#0a0a0a' : '#0d0d0d',
                    border: isDamaged
                      ? '1px solid rgba(234,179,8,0.4)'
                      : isDestroyed
                        ? '1px solid #1a1a1a'
                        : '1px solid #1a1a1a',
                    opacity: isDestroyed ? 0.5 : 1,
                    boxShadow: isDamaged ? '0 0 8px rgba(234,179,8,0.15)' : 'none',
                  }}
                  animate={isDamaged ? { x: [0, -3, 3, -2, 2, 0] } : {}}
                  transition={isDamaged ? { duration: 0.4 } : {}}
                >
                  {/* Destroyed overlay stamp */}
                  {isDestroyed && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span
                        className="text-[10px] font-black uppercase tracking-[0.3em] rotate-[-8deg] px-2 py-0.5"
                        style={{
                          color: 'rgba(239,68,68,0.4)',
                          border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: '2px',
                        }}
                      >
                        Destroyed
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs leading-snug ${isDestroyed ? 'line-through text-zinc-700' : 'text-zinc-300'}`}>
                      {axiom.label}
                    </p>
                    <span className={`shrink-0 text-xs font-mono font-bold tabular-nums ${
                      isDestroyed ? 'text-red-900' : axiom.hp_current < 30 ? 'text-red-400' : 'text-zinc-500'
                    }`}>
                      {axiom.hp_current}
                    </span>
                  </div>
                  <div className="mt-2">
                    <AxiomHpBar
                      hp={axiom.hp_current}
                      isDestroyed={isDestroyed}
                      side={side}
                      animate={isDamaged}
                    />
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
