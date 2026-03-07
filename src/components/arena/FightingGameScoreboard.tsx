'use client'

import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { Zap, Cpu, Brain, Flame } from 'lucide-react'

// ── Provider brand config ──────────────────────────────────────────────
const PROVIDER_CONFIG: Record<string, { label: string; color: string; glow: string; icon: typeof Zap }> = {
  claude: { label: 'CLAUDE', color: '#f97316', glow: 'rgba(249,115,22,0.4)', icon: Zap },
  openai: { label: 'GPT', color: '#22c55e', glow: 'rgba(34,197,94,0.4)', icon: Cpu },
  gemini: { label: 'GEMINI', color: '#3b82f6', glow: 'rgba(59,130,246,0.4)', icon: Brain },
  grok: { label: 'GROK', color: '#ef4444', glow: 'rgba(239,68,68,0.4)', icon: Flame },
}

// ── Props ──────────────────────────────────────────────────────────────
interface FightingGameScoreboardProps {
  bookA: { title: string; author_name: string; cover_url?: string | null }
  bookB: { title: string; author_name: string; cover_url?: string | null }
  modelA: string // 'claude' | 'openai'
  modelB: string
  hpA: number // 0-100 aggregate
  hpB: number
  currentRound: number
  maxRounds: number
  status: string
  winner?: string | null
}

// ── Animated HP Bar ────────────────────────────────────────────────────
function HpBar({ hp, side, prevHp }: { hp: number; side: 'a' | 'b'; prevHp: number }) {
  const spring = useSpring(prevHp, { stiffness: 80, damping: 18 })
  const width = useTransform(spring, (v) => `${Math.max(0, Math.min(100, v))}%`)
  const [showDamage, setShowDamage] = useState(false)

  useEffect(() => {
    spring.set(hp)
    if (hp < prevHp) {
      setShowDamage(true)
      const t = setTimeout(() => setShowDamage(false), 600)
      return () => clearTimeout(t)
    }
  }, [hp, prevHp, spring])

  const gradientId = `hp-gradient-${side}`
  const isA = side === 'a'

  return (
    <div className="relative w-full">
      {/* HP value readout */}
      <div className={`flex items-baseline gap-1 mb-1 ${isA ? '' : 'justify-end'}`}>
        <span className="text-lg font-black tabular-nums tracking-tight text-white">
          {Math.round(hp)}
        </span>
        <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest">HP</span>
      </div>

      {/* Bar track */}
      <div
        className="relative h-4 overflow-hidden rounded-sm"
        style={{
          background: '#1a1a1a',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
        }}
      >
        {/* Damage flash underlay */}
        <AnimatePresence>
          {showDamage && (
            <motion.div
              className="absolute inset-0 z-10"
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              style={{
                background: 'linear-gradient(90deg, rgba(255,255,255,0.8), rgba(255,50,50,0.6))',
              }}
            />
          )}
        </AnimatePresence>

        {/* HP fill */}
        <motion.div
          className="absolute inset-y-0 rounded-sm"
          style={{
            width,
            left: isA ? 0 : undefined,
            right: isA ? undefined : 0,
            background: hp > 60
              ? isA
                ? 'linear-gradient(90deg, #dc2626, #ef4444, #f87171)'
                : 'linear-gradient(90deg, #60a5fa, #3b82f6, #2563eb)'
              : hp > 30
                ? 'linear-gradient(90deg, #d97706, #eab308, #facc15)'
                : 'linear-gradient(90deg, #991b1b, #dc2626, #ef4444)',
            boxShadow: hp > 30
              ? isA
                ? '0 0 12px rgba(239,68,68,0.5)'
                : '0 0 12px rgba(59,130,246,0.5)'
              : '0 0 16px rgba(239,68,68,0.7)',
          }}
        />

        {/* Segmented overlay (fighting game style) */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="flex-1"
              style={{
                borderRight: i < 19 ? '1px solid rgba(0,0,0,0.3)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Scanline effect */}
        <div
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.3) 1px, rgba(0,0,0,0.3) 2px)',
          }}
        />
      </div>

      {/* Critical HP warning */}
      {hp <= 20 && hp > 0 && (
        <motion.div
          className="absolute -bottom-0.5 left-0 right-0 h-0.5"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          style={{ background: '#ef4444' }}
        />
      )}
    </div>
  )
}

// ── Model Badge ────────────────────────────────────────────────────────
function ModelBadge({ model }: { model: string }) {
  const config = PROVIDER_CONFIG[model] || PROVIDER_CONFIG.openai
  const Icon = config.icon

  return (
    <motion.div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[10px] font-black uppercase tracking-[0.15em]"
      style={{
        background: `${config.color}15`,
        border: `1px solid ${config.color}40`,
        color: config.color,
        boxShadow: `0 0 8px ${config.glow}`,
      }}
      whileHover={{ scale: 1.05, boxShadow: `0 0 16px ${config.glow}` }}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </motion.div>
  )
}

// ── VS Emblem ──────────────────────────────────────────────────────────
function VsEmblem({ isKO }: { isKO: boolean }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow ring */}
      <motion.div
        className="absolute w-16 h-16 rounded-full"
        animate={{
          boxShadow: isKO
            ? ['0 0 20px rgba(234,179,8,0.4)', '0 0 40px rgba(234,179,8,0.8)', '0 0 20px rgba(234,179,8,0.4)']
            : ['0 0 15px rgba(139,92,246,0.2)', '0 0 25px rgba(139,92,246,0.4)', '0 0 15px rgba(139,92,246,0.2)'],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      {/* Inner diamond */}
      <motion.div
        className="relative w-12 h-12 flex items-center justify-center"
        animate={{ rotate: isKO ? [0, 5, -5, 0] : [0, 0] }}
        transition={{ duration: 0.5, repeat: isKO ? Infinity : 0 }}
      >
        <div
          className="absolute inset-0 rotate-45"
          style={{
            background: isKO
              ? 'linear-gradient(135deg, #b45309, #eab308, #fde047)'
              : 'linear-gradient(135deg, #4c1d95, #7c3aed, #a78bfa)',
            boxShadow: isKO
              ? '0 0 20px rgba(234,179,8,0.5)'
              : '0 0 12px rgba(124,58,237,0.4)',
          }}
        />
        <span
          className="relative z-10 text-sm font-black tracking-tighter"
          style={{
            color: isKO ? '#451a03' : '#f5f3ff',
            textShadow: isKO ? '0 0 4px rgba(234,179,8,0.8)' : '0 0 4px rgba(167,139,250,0.6)',
          }}
        >
          {isKO ? 'KO' : 'VS'}
        </span>
      </motion.div>
    </div>
  )
}

// ── Main Scoreboard ────────────────────────────────────────────────────
export function FightingGameScoreboard({
  bookA,
  bookB,
  modelA,
  modelB,
  hpA,
  hpB,
  currentRound,
  maxRounds,
  status,
  winner,
}: FightingGameScoreboardProps) {
  const [prevHpA, setPrevHpA] = useState(hpA)
  const [prevHpB, setPrevHpB] = useState(hpB)
  const [screenFlash, setScreenFlash] = useState(false)
  const prevHpARef = useRef(hpA)
  const prevHpBRef = useRef(hpB)

  useEffect(() => {
    const deltaA = prevHpARef.current - hpA
    const deltaB = prevHpBRef.current - hpB

    if (deltaA > 15 || deltaB > 15) {
      setScreenFlash(true)
      setTimeout(() => setScreenFlash(false), 300)
    }

    setPrevHpA(prevHpARef.current)
    setPrevHpB(prevHpBRef.current)
    prevHpARef.current = hpA
    prevHpBRef.current = hpB
  }, [hpA, hpB])

  const isKO = status === 'completed' && !!winner
  const isActive = status === 'active'

  return (
    <div className="relative">
      {/* Screen flash overlay */}
      <AnimatePresence>
        {screenFlash && (
          <motion.div
            className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ background: 'white' }}
          />
        )}
      </AnimatePresence>

      {/* KO overlay */}
      <AnimatePresence>
        {isKO && (
          <motion.div
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, scale: 3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <div
              className="px-6 py-2 text-3xl font-black tracking-[0.3em] uppercase"
              style={{
                color: '#fde047',
                textShadow: '0 0 20px rgba(234,179,8,0.8), 0 0 60px rgba(234,179,8,0.4)',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.8), rgba(0,0,0,0.6))',
                backdropFilter: 'blur(4px)',
              }}
            >
              KNOCKOUT
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main scoreboard container */}
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          background: 'linear-gradient(180deg, #0f0f0f 0%, #141414 50%, #0f0f0f 100%)',
          border: '1px solid #27272a',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* Top accent bar */}
        <div className="flex h-0.5">
          <div className="flex-1" style={{ background: 'linear-gradient(90deg, transparent, #ef4444, #ef4444)' }} />
          <div className="w-20" style={{ background: 'linear-gradient(90deg, #ef4444, #7c3aed, #3b82f6)' }} />
          <div className="flex-1" style={{ background: 'linear-gradient(90deg, #3b82f6, #3b82f6, transparent)' }} />
        </div>

        <div className="px-4 py-3 sm:px-6 sm:py-4">
          {/* Round counter top-center */}
          <div className="flex justify-center mb-3">
            <motion.div
              className="flex items-center gap-2 px-4 py-1 rounded-sm"
              style={{
                background: '#0a0a0a',
                border: '1px solid #27272a',
              }}
              animate={isActive ? { borderColor: ['#27272a', '#7c3aed40', '#27272a'] } : {}}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">Round</span>
              <span className="text-base font-black tabular-nums text-white">
                {currentRound}
              </span>
              <span className="text-base font-black text-zinc-700">/</span>
              <span className="text-base font-black tabular-nums text-zinc-500">
                {maxRounds}
              </span>
            </motion.div>
          </div>

          {/* Fighters row */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">

            {/* ── Side A (left-aligned) ─── */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                {/* Book cover / avatar */}
                <div
                  className="relative w-12 h-16 sm:w-14 sm:h-[72px] shrink-0 rounded-sm overflow-hidden"
                  style={{
                    border: `2px solid ${winner === 'a' ? '#eab308' : '#ef4444'}`,
                    boxShadow: winner === 'a'
                      ? '0 0 16px rgba(234,179,8,0.4)'
                      : '0 0 8px rgba(239,68,68,0.2)',
                  }}
                >
                  {bookA.cover_url ? (
                    <img src={bookA.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-lg font-black"
                      style={{ background: 'linear-gradient(135deg, #7f1d1d, #dc2626)', color: '#fca5a5' }}
                    >
                      A
                    </div>
                  )}
                  {winner === 'a' && (
                    <motion.div
                      className="absolute inset-0"
                      animate={{ opacity: [0, 0.3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{ background: 'linear-gradient(135deg, transparent, rgba(234,179,8,0.6))' }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-white truncate leading-tight">
                    {bookA.title}
                  </p>
                  <p className="text-[10px] text-zinc-600 truncate">{bookA.author_name}</p>
                  <div className="mt-1.5">
                    <ModelBadge model={modelA} />
                  </div>
                </div>
              </div>

              <HpBar hp={hpA} side="a" prevHp={prevHpA} />
            </div>

            {/* ── VS Emblem ─── */}
            <VsEmblem isKO={isKO} />

            {/* ── Side B (right-aligned) ─── */}
            <div className="space-y-2">
              <div className="flex items-start gap-3 flex-row-reverse">
                <div
                  className="relative w-12 h-16 sm:w-14 sm:h-[72px] shrink-0 rounded-sm overflow-hidden"
                  style={{
                    border: `2px solid ${winner === 'b' ? '#eab308' : '#3b82f6'}`,
                    boxShadow: winner === 'b'
                      ? '0 0 16px rgba(234,179,8,0.4)'
                      : '0 0 8px rgba(59,130,246,0.2)',
                  }}
                >
                  {bookB.cover_url ? (
                    <img src={bookB.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-lg font-black"
                      style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: '#93c5fd' }}
                    >
                      B
                    </div>
                  )}
                  {winner === 'b' && (
                    <motion.div
                      className="absolute inset-0"
                      animate={{ opacity: [0, 0.3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{ background: 'linear-gradient(135deg, transparent, rgba(234,179,8,0.6))' }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 text-right">
                  <p className="text-xs sm:text-sm font-bold text-white truncate leading-tight">
                    {bookB.title}
                  </p>
                  <p className="text-[10px] text-zinc-600 truncate">{bookB.author_name}</p>
                  <div className="mt-1.5 flex justify-end">
                    <ModelBadge model={modelB} />
                  </div>
                </div>
              </div>

              <HpBar hp={hpB} side="b" prevHp={prevHpB} />
            </div>
          </div>

          {/* Status bar */}
          <div className="mt-3 flex items-center justify-center">
            <div className="flex items-center gap-2">
              {isActive && (
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-green-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                {status === 'active' ? 'LIVE' : status === 'completed' ? (winner ? `${winner === 'a' ? bookA.title : bookB.title} WINS` : 'DRAW') : status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div className="flex h-px">
          <div className="flex-1" style={{ background: 'linear-gradient(90deg, transparent, #ef444430)' }} />
          <div className="flex-1" style={{ background: 'linear-gradient(90deg, #3b82f630, transparent)' }} />
        </div>
      </div>
    </div>
  )
}
