'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Lock, TrendingUp, Coins, ChevronRight, AlertTriangle } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────
interface PoolState {
  id: string
  poolA: number
  poolB: number
  totalPool: number
  oddsA: number
  oddsB: number
  status: string // 'open' | 'locked' | 'settled' | 'refunded'
  settledSide?: string | null
}

interface UserBet {
  side: 'a' | 'b'
  amount: number
  payout: number | null
}

interface BettingPanelProps {
  sessionId: string
  pool: PoolState | null
  bookATitle: string
  bookBTitle: string
  walletBalance?: number
  userBet?: UserBet | null
  onPlaceBet?: (side: 'a' | 'b', amount: number) => Promise<void>
}

// ── Odds Bar ───────────────────────────────────────────────────────────
function OddsBar({ oddsA, oddsB, totalPool }: { oddsA: number; oddsB: number; totalPool: number }) {
  const pctA = Math.round(oddsA * 100)
  const pctB = Math.round(oddsB * 100)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        <span>Market Odds</span>
        <span className="tabular-nums">{totalPool.toLocaleString()} $PUG Pool</span>
      </div>

      <div className="relative h-6 rounded-sm overflow-hidden" style={{ background: '#0a0a0a' }}>
        {/* Side A fill */}
        <motion.div
          className="absolute inset-y-0 left-0 flex items-center justify-start pl-2"
          animate={{ width: `${pctA}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          style={{
            background: 'linear-gradient(90deg, rgba(239,68,68,0.6), rgba(239,68,68,0.3))',
            borderRight: '1px solid rgba(239,68,68,0.5)',
          }}
        >
          <span className="text-[10px] font-black text-red-300 tabular-nums whitespace-nowrap">
            {pctA}%
          </span>
        </motion.div>

        {/* Side B fill */}
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-2"
          animate={{ width: `${pctB}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          style={{
            background: 'linear-gradient(90deg, rgba(59,130,246,0.3), rgba(59,130,246,0.6))',
            borderLeft: '1px solid rgba(59,130,246,0.5)',
          }}
        >
          <span className="text-[10px] font-black text-blue-300 tabular-nums whitespace-nowrap">
            {pctB}%
          </span>
        </motion.div>
      </div>
    </div>
  )
}

// ── Payout Calculator ──────────────────────────────────────────────────
function PayoutCalc({ amount, odds }: { amount: number; odds: number }) {
  if (amount <= 0 || odds <= 0) return null
  const payout = Math.floor(amount / odds)

  return (
    <motion.div
      className="flex items-center justify-between px-3 py-1.5 rounded-sm"
      style={{ background: '#0a0a0a', border: '1px solid #27272a' }}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="text-[10px] text-zinc-500">Potential win</span>
      <div className="flex items-center gap-1">
        <TrendingUp className="w-3 h-3 text-emerald-400" />
        <span className="text-sm font-black text-emerald-400 tabular-nums">
          {payout.toLocaleString()}
        </span>
        <span className="text-[10px] text-zinc-600">$PUG</span>
      </div>
    </motion.div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────
export function BettingPanel({
  sessionId,
  pool,
  bookATitle,
  bookBTitle,
  walletBalance = 1000,
  userBet,
  onPlaceBet,
}: BettingPanelProps) {
  const [selectedSide, setSelectedSide] = useState<'a' | 'b' | null>(null)
  const [amount, setAmount] = useState(100)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLocked = pool?.status === 'locked' || pool?.status === 'settled' || pool?.status === 'refunded'
  const isSettled = pool?.status === 'settled'
  const hasBet = !!userBet

  const quickAmounts = [50, 100, 250, 500]

  async function handlePlaceBet() {
    if (!selectedSide || !onPlaceBet || amount <= 0) return
    setPlacing(true)
    setError(null)

    try {
      await onPlaceBet(selectedSide, amount)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPlacing(false)
    }
  }

  if (!pool) {
    return (
      <div
        className="rounded-lg p-4"
        style={{
          background: 'rgba(20,20,20,0.8)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #27272a',
        }}
      >
        <p className="text-xs text-zinc-600 text-center">No prediction pool for this debate</p>
      </div>
    )
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: 'rgba(20,20,20,0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(39,39,42,0.8)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{
          background: 'linear-gradient(90deg, rgba(234,179,8,0.08), rgba(234,179,8,0.03))',
          borderBottom: '1px solid #27272a',
        }}
      >
        <div className="flex items-center gap-2">
          <Coins className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-amber-500/90">
            Prediction Market
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[#0a0a0a]">
          <span className="text-[10px] text-zinc-600">Balance</span>
          <span className="text-xs font-black text-white tabular-nums">{walletBalance.toLocaleString()}</span>
          <span className="text-[10px] text-amber-600">$PUG</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Live odds */}
        <OddsBar oddsA={pool.oddsA} oddsB={pool.oddsB} totalPool={pool.totalPool} />

        {/* Locked state */}
        {isLocked && !hasBet && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-zinc-900/50 border border-zinc-800">
            <Lock className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-xs text-zinc-500">
              {isSettled ? 'Market settled' : 'Betting locked — debate in progress'}
            </span>
          </div>
        )}

        {/* User's existing bet */}
        {hasBet && userBet && (
          <motion.div
            className="rounded-sm p-3 space-y-2"
            style={{
              background: userBet.side === 'a' ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
              border: `1px solid ${userBet.side === 'a' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)'}`,
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Your Bet</span>
              {isSettled && (
                <span className={`text-[10px] font-black uppercase ${pool.settledSide === userBet.side ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pool.settledSide === userBet.side ? '✓ WON' : '✕ LOST'}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-sm font-bold ${userBet.side === 'a' ? 'text-red-400' : 'text-blue-400'}`}>
                  {userBet.side === 'a' ? bookATitle : bookBTitle}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-white tabular-nums">{userBet.amount.toLocaleString()} $PUG</p>
                {userBet.payout && (
                  <p className="text-xs font-bold text-emerald-400 tabular-nums">
                    +{userBet.payout.toLocaleString()} $PUG
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Bet placement (only when pool open and no existing bet) */}
        {!isLocked && !hasBet && (
          <div className="space-y-3">
            {/* Side selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedSide('a')}
                className="relative px-3 py-2.5 rounded-sm text-left transition-all"
                style={{
                  background: selectedSide === 'a' ? 'rgba(239,68,68,0.15)' : '#0a0a0a',
                  border: `1px solid ${selectedSide === 'a' ? 'rgba(239,68,68,0.5)' : '#27272a'}`,
                  boxShadow: selectedSide === 'a' ? '0 0 12px rgba(239,68,68,0.15)' : 'none',
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-0.5">Side A</p>
                <p className="text-xs font-bold text-white truncate">{bookATitle}</p>
                <p className="text-[10px] text-zinc-600 tabular-nums mt-0.5">
                  {(1 / pool.oddsA).toFixed(2)}x return
                </p>
                {selectedSide === 'a' && (
                  <motion.div
                    className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-red-500"
                    layoutId="selectedDot"
                  />
                )}
              </button>

              <button
                onClick={() => setSelectedSide('b')}
                className="relative px-3 py-2.5 rounded-sm text-left transition-all"
                style={{
                  background: selectedSide === 'b' ? 'rgba(59,130,246,0.15)' : '#0a0a0a',
                  border: `1px solid ${selectedSide === 'b' ? 'rgba(59,130,246,0.5)' : '#27272a'}`,
                  boxShadow: selectedSide === 'b' ? '0 0 12px rgba(59,130,246,0.15)' : 'none',
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70 mb-0.5">Side B</p>
                <p className="text-xs font-bold text-white truncate">{bookBTitle}</p>
                <p className="text-[10px] text-zinc-600 tabular-nums mt-0.5">
                  {(1 / pool.oddsB).toFixed(2)}x return
                </p>
                {selectedSide === 'b' && (
                  <motion.div
                    className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-blue-500"
                    layoutId="selectedDot"
                  />
                )}
              </button>
            </div>

            {/* Amount selection */}
            <AnimatePresence>
              {selectedSide && (
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="flex gap-1.5">
                    {quickAmounts.map((qa) => (
                      <button
                        key={qa}
                        onClick={() => setAmount(qa)}
                        className="flex-1 py-1.5 rounded-sm text-[10px] font-bold tabular-nums transition-all"
                        style={{
                          background: amount === qa ? '#27272a' : '#0a0a0a',
                          border: `1px solid ${amount === qa ? '#3f3f46' : '#1a1a1a'}`,
                          color: amount === qa ? '#fff' : '#71717a',
                        }}
                      >
                        {qa}
                      </button>
                    ))}
                  </div>

                  {/* Custom amount input */}
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
                    style={{ background: '#0a0a0a', border: '1px solid #27272a' }}
                  >
                    <Coins className="w-3 h-3 text-amber-600 shrink-0" />
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
                      className="flex-1 bg-transparent text-sm font-bold text-white tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={1}
                      max={walletBalance}
                    />
                    <span className="text-[10px] text-zinc-600">$PUG</span>
                  </div>

                  {/* Payout calculator */}
                  <PayoutCalc amount={amount} odds={selectedSide === 'a' ? pool.oddsA : pool.oddsB} />

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-red-400">
                      <AlertTriangle className="w-3 h-3" />
                      {error}
                    </div>
                  )}

                  {/* Place bet button */}
                  <motion.button
                    onClick={handlePlaceBet}
                    disabled={placing || amount <= 0 || amount > walletBalance}
                    className="w-full py-2.5 rounded-sm text-xs font-black uppercase tracking-[0.2em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: selectedSide === 'a'
                        ? 'linear-gradient(135deg, #991b1b, #dc2626)'
                        : 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                      color: '#fff',
                      boxShadow: selectedSide === 'a'
                        ? '0 4px 16px rgba(239,68,68,0.3)'
                        : '0 4px 16px rgba(59,130,246,0.3)',
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {placing ? (
                        'Placing...'
                      ) : (
                        <>
                          Place Bet
                          <ChevronRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
