'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Pause, Loader2, Flag, Trophy, Monitor, BarChart3, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AxiomPanel } from './AxiomPanel'
import { BattlefieldGraph } from './BattlefieldGraph'
import { ShoutcasterTicker } from './ShoutcasterTicker'
import { ArgumentLog } from './ArgumentLog'
import { RoundIndicator } from './RoundIndicator'
import { SynthesisPanel, type SynthesisResult } from './SynthesisPanel'
import { FightingGameScoreboard } from './FightingGameScoreboard'
import { BettingPanel } from './BettingPanel'
import { SponsorChyron } from './SponsorChyron'
import { AvatarVideo } from './AvatarVideo'
import { CommentatorBooth } from './CommentatorBooth'

// ── Types ──────────────────────────────────────────────────────────────
interface PoolState {
  id: string
  poolA: number
  poolB: number
  totalPool: number
  oddsA: number
  oddsB: number
  status: string
  settledSide?: string | null
}

interface SponsorAssignment {
  chyron_text?: string | null
  inserted_at_round?: number | null
  sponsor?: {
    id: string
    name: string
    tagline: string
    logo_url?: string | null
    tier: string
  } | null
}

interface AVSession {
  sessionId: string
  iceServers: RTCIceServer[]
  offer: RTCSessionDescriptionInit
}

interface DebateState {
  session: {
    id: string
    status: string
    current_round: number
    max_rounds: number
    crucible_question: string
    winner: string | null
    win_condition: string | null
    synthesis: unknown
    model_a?: string
    model_b?: string
  }
  bookA: { id: string; title: string; author_name: string; cover_url?: string | null }
  bookB: { id: string; title: string; author_name: string; cover_url?: string | null }
  axioms: Array<{
    id: string
    side: 'a' | 'b'
    axiom_index: number
    label: string
    hp_current: number
    is_destroyed: boolean
  }>
  rounds: Array<{
    round_number: number
    attacker_side: string
    status: string
    hp_deltas: Array<{ axiom_id: string; axiom_label: string; delta: number; reason: string }>
    commentary: string | null
  }>
  arguments: Array<{
    id: string
    side: 'a' | 'b'
    move_type: string
    claim: string
    grounds: string | null
    warrant: string | null
    referee_verdict: { verdict_summary: string } | null
  }>
  // Sprint 8 additions
  modelA?: string
  modelB?: string
  pool?: PoolState | null
  sponsors?: SponsorAssignment[]
}

interface DebateArenaClientProps {
  initialState: DebateState
  isOwner: boolean
}

// ── Screen Shake + Oxford Union CSS ────────────────────────────────────
const ARENA_STYLES = `
@keyframes arenaShake {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-4px, 2px); }
  20% { transform: translate(4px, -2px); }
  30% { transform: translate(-3px, -1px); }
  40% { transform: translate(3px, 1px); }
  50% { transform: translate(-2px, 2px); }
  60% { transform: translate(2px, -1px); }
  70% { transform: translate(-1px, 1px); }
  80% { transform: translate(1px, -1px); }
  90% { transform: translate(-1px, 0); }
}
@keyframes warmFlicker {
  0%, 100% { opacity: 0.02; }
  50% { opacity: 0.04; }
}
@keyframes candleGlow {
  0%, 100% { opacity: 0.3; }
  33% { opacity: 0.5; }
  66% { opacity: 0.35; }
}
`

// ── Main Component ─────────────────────────────────────────────────────
export function DebateArenaClient({ initialState, isOwner }: DebateArenaClientProps) {
  const router = useRouter()
  const [state, setState] = useState<DebateState>(initialState)
  const [executing, setExecuting] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const [lastDamagedId, setLastDamagedId] = useState<string>()
  const [latestAttack, setLatestAttack] = useState<{ attackerSide: 'a' | 'b'; targetAxiomId: string } | null>(null)
  const [viewMode, setViewMode] = useState<'video' | 'graph'>('video')
  const [shaking, setShaking] = useState(false)
  const [walletBalance, setWalletBalance] = useState(1000)
  const [userBet, setUserBet] = useState<{ side: 'a' | 'b'; amount: number; payout: number | null } | null>(null)

  // AV sessions
  const [avSessions, setAvSessions] = useState<{
    debaterA?: AVSession
    debaterB?: AVSession
    commentator?: AVSession
  }>({})
  const [avEnabled, setAvEnabled] = useState(false)
  const avCleanupRef = useRef<string[]>([])

  const { session, bookA, bookB, axioms, rounds, arguments: args } = state
  const modelA = state.modelA || session.model_a || 'openai'
  const modelB = state.modelB || session.model_b || 'openai'

  const axiomsA = axioms.filter((a) => a.side === 'a')
  const axiomsB = axioms.filter((a) => a.side === 'b')

  const totalHpA = axiomsA.reduce((sum, a) => sum + a.hp_current, 0)
  const totalHpB = axiomsB.reduce((sum, a) => sum + a.hp_current, 0)
  const maxHpA = axiomsA.length * 100 || 100
  const maxHpB = axiomsB.length * 100 || 100
  const hpPercentA = (totalHpA / maxHpA) * 100
  const hpPercentB = (totalHpB / maxHpB) * 100

  const prevHpA = useRef(hpPercentA)
  const prevHpB = useRef(hpPercentB)

  const commentaries = rounds
    .filter((r) => r.commentary)
    .map((r) => ({ round: r.round_number, text: r.commentary! }))

  // ── Initialize AV sessions ──────────────────────────────────────────
  useEffect(() => {
    async function initAV() {
      try {
        const res = await fetch(`/api/arena/${session.id}/av`, { method: 'POST' })
        if (!res.ok) return
        const data = await res.json()
        if (data.avEnabled) {
          setAvSessions({
            debaterA: data.sessions.debaterA,
            debaterB: data.sessions.debaterB,
            commentator: data.sessions.commentator,
          })
          setAvEnabled(true)
          setViewMode('video')
          avCleanupRef.current = [
            data.sessions.debaterA?.sessionId,
            data.sessions.debaterB?.sessionId,
            data.sessions.commentator?.sessionId,
          ].filter(Boolean)
        }
      } catch {
        // AV not available — stay in video mode with fallbacks
      }
    }

    if (session.status === 'active' || session.status === 'extracting') {
      initAV()
    }

    return () => {
      if (avCleanupRef.current.length > 0) {
        fetch(`/api/arena/${session.id}/av`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionIds: avCleanupRef.current }),
        }).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // ── Fetch wallet balance ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchWallet() {
      try {
        const res = await fetch('/api/wallet')
        if (res.ok) {
          const data = await res.json()
          setWalletBalance(data.balance)
        }
      } catch { /* wallet fetch optional */ }
    }
    fetchWallet()
  }, [])

  // ── Fetch user's existing bet ────────────────────────────────────────
  useEffect(() => {
    async function fetchBet() {
      try {
        const res = await fetch(`/api/arena/${session.id}/bets`)
        if (res.ok) {
          const data = await res.json()
          if (data.userBet) setUserBet(data.userBet)
        }
      } catch { /* bet fetch optional */ }
    }
    fetchBet()
  }, [session.id])

  // ── Screen shake detection ───────────────────────────────────────────
  useEffect(() => {
    const deltaA = prevHpA.current - hpPercentA
    const deltaB = prevHpB.current - hpPercentB

    if (deltaA > 5 || deltaB > 5) {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    }

    prevHpA.current = hpPercentA
    prevHpB.current = hpPercentB
  }, [hpPercentA, hpPercentB])

  // ── Poll for updates ─────────────────────────────────────────────────
  useEffect(() => {
    if (session.status !== 'active' && session.status !== 'extracting') return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/arena/${session.id}`)
        if (res.ok) setState(await res.json())
      } catch { /* polling retry */ }
    }, 3000)

    return () => clearInterval(interval)
  }, [session.id, session.status])

  // ── Execute next round ───────────────────────────────────────────────
  const executeNextRound = useCallback(async () => {
    if (executing || session.status !== 'active') return
    setExecuting(true)

    try {
      const roundBody: Record<string, unknown> = {}
      if (avEnabled && avSessions.debaterA?.sessionId) {
        roundBody.avSessions = {
          debaterA: avSessions.debaterA.sessionId,
          debaterB: avSessions.debaterB?.sessionId ?? null,
          commentator: avSessions.commentator?.sessionId ?? null,
        }
      }
      const res = await fetch(`/api/arena/${session.id}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roundBody),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      const { round } = await res.json()

      if (round.hp_deltas?.length > 0) {
        const firstDelta = round.hp_deltas[0]
        setLastDamagedId(firstDelta.axiom_id)
        setLatestAttack({
          attackerSide: round.attacker_side as 'a' | 'b',
          targetAxiomId: firstDelta.axiom_id,
        })
        setTimeout(() => setLastDamagedId(undefined), 2000)
      }

      const stateRes = await fetch(`/api/arena/${session.id}`)
      if (stateRes.ok) setState(await stateRes.json())
    } catch (err) {
      console.error('Round execution failed:', err)
    } finally {
      setExecuting(false)
    }
  }, [executing, session.id, session.status, avEnabled, avSessions])

  // ── Auto-play ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlay || executing || session.status !== 'active') return
    if (session.current_round >= session.max_rounds) {
      setAutoPlay(false)
      return
    }
    const timer = setTimeout(() => executeNextRound(), 1000)
    return () => clearTimeout(timer)
  }, [autoPlay, executing, session.status, session.current_round, session.max_rounds, executeNextRound])

  // ── Actions ──────────────────────────────────────────────────────────
  async function handleAction(action: string) {
    try {
      await fetch(`/api/arena/${session.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      router.refresh()
    } catch (err) {
      console.error('Action failed:', err)
    }
  }

  async function handlePlaceBet(side: 'a' | 'b', amount: number) {
    const res = await fetch(`/api/arena/${session.id}/bets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side, amount }),
    })
    if (!res.ok) throw new Error((await res.json()).error)

    const data = await res.json()
    setUserBet({ side, amount, payout: null })
    setWalletBalance(data.newBalance)

    const stateRes = await fetch(`/api/arena/${session.id}`)
    if (stateRes.ok) setState(await stateRes.json())
  }

  const isCompleted = session.status === 'completed'
  const isActive = session.status === 'active'
  const winnerBook = session.winner === 'a' ? bookA : session.winner === 'b' ? bookB : null
  const latestCommentary = commentaries.length > 0 ? commentaries[commentaries.length - 1].text : null

  /* ═══════════════════════════════════════════════════════════════════════
     LAYOUT — matches the user's wireframe exactly:

     ┌───────────┬─────────────────────────┬───────────┐
     │ Comment.  │  Fighting Game Scoreboard│ Comment.  │
     │    A      │                          │    B      │
     │  (PiP)    │                          │  (PiP)    │
     ├───────────┤                          ├───────────┤
     │           │ ┌──────┬──────┬──────┐   │           │
     │  Axiom    │ │Debat.│JUDGE │Debat.│   │  Axiom    │
     │ Panel A   │ │A vid │      │B vid │   │  Panel B  │
     │           │ └──────┴──────┴──────┘   │           │
     ├───────────┴─────────────────────────┴───────────┤
     │  [Controls] [Shoutcaster Ticker]                 │
     │  [Battlefield/Graph] [Betting]                   │
     ├──────────────────────────────────────────────────┤
     │              Sponsor Chyron                       │
     └──────────────────────────────────────────────────┘
     ═══════════════════════════════════════════════════════════════════════ */

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ARENA_STYLES }} />

      <div
        className="min-h-screen relative"
        style={{
          animation: shaking ? 'arenaShake 0.5s ease-in-out' : 'none',
          background: '#080604',
        }}
      >
        {/* ── Oxford Union Background ──────────────────────────────────
            Rich mahogany wood paneling, warm amber lighting, gothic gravitas */}
        <div className="fixed inset-0 pointer-events-none z-0">
          {/* Base dark mahogany */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 120% 80% at 50% 20%, #1a120a 0%, #0d0906 50%, #050302 100%)',
            }}
          />
          {/* Vertical wood paneling */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, transparent 0px, transparent 80px, rgba(139,90,43,0.4) 80px, rgba(139,90,43,0.4) 81px, transparent 81px, transparent 82px, rgba(139,90,43,0.2) 82px, rgba(139,90,43,0.2) 83px)`,
            }}
          />
          {/* Horizontal wainscoting line */}
          <div
            className="absolute left-0 right-0"
            style={{
              top: '60%',
              height: '2px',
              background: 'linear-gradient(90deg, transparent 5%, rgba(139,90,43,0.15) 20%, rgba(212,160,23,0.08) 50%, rgba(139,90,43,0.15) 80%, transparent 95%)',
            }}
          />
          {/* Warm overhead light spill */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2"
            style={{
              width: '70%',
              height: '40%',
              background: 'radial-gradient(ellipse at center top, rgba(212,160,23,0.04) 0%, transparent 70%)',
              animation: 'warmFlicker 8s ease-in-out infinite',
            }}
          />
          {/* Corner vignette */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.5) 100%)',
            }}
          />
        </div>

        {/* ── Content (above background) ───────────────────────────── */}
        <div className="relative z-10 mx-auto max-w-[1440px] px-3 py-3 xl:px-5">

          {/* Crucible Question Header */}
          <div className="mb-3 text-center">
            <p className="text-[9px] uppercase tracking-[0.4em] text-amber-800/60 mb-0.5"
               style={{ fontVariant: 'small-caps', letterSpacing: '0.35em' }}>
              The Oxford Union &mdash; Ontological Pugilism
            </p>
            <p className="text-sm text-amber-200/50 italic max-w-2xl mx-auto leading-relaxed">
              &ldquo;{session.crucible_question}&rdquo;
            </p>
          </div>

          {/* Winner Banner */}
          <AnimatePresence>
            {isCompleted && winnerBook && (
              <motion.div
                className="mb-3 rounded-lg p-3 text-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(234,179,8,0.04))',
                  border: '1px solid rgba(234,179,8,0.25)',
                  boxShadow: '0 0 30px rgba(234,179,8,0.08)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Trophy className="mx-auto h-5 w-5 text-amber-400 mb-1" />
                <p className="text-base font-bold text-amber-400">{winnerBook.title} Wins!</p>
                <p className="text-[10px] text-zinc-500">Victory by {session.win_condition}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════════════════════════════════════════════════════════
               ROW 1 + ROW 2: The Main 3-Column Chamber
               Left:   Commentator A (top) + Axiom Panel A (bottom)
               Center: Scoreboard (top) + Debate Stage (bottom)
               Right:  Commentator B (top) + Axiom Panel B (bottom)
             ═══════════════════════════════════════════════════════════ */}
          <div
            className="grid gap-2 xl:gap-3"
            style={{
              gridTemplateColumns: 'minmax(180px, 220px) 1fr minmax(180px, 220px)',
              gridTemplateRows: 'auto 1fr',
            }}
          >
            {/* ── [Row1, Col1] Commentator A PiP ──────────────────── */}
            <div className="row-span-1">
              <CommentatorBooth
                sessionId={avSessions.commentator?.sessionId}
                iceServers={avSessions.commentator?.iceServers}
                offer={avSessions.commentator?.offer}
                latestCommentary={latestCommentary}
                position="inline"
                compact
              />
            </div>

            {/* ── [Row1, Col2] Fighting Game Scoreboard ────────────── */}
            <div className="row-span-1">
              <FightingGameScoreboard
                bookA={bookA}
                bookB={bookB}
                modelA={modelA}
                modelB={modelB}
                hpA={hpPercentA}
                hpB={hpPercentB}
                currentRound={session.current_round}
                maxRounds={session.max_rounds}
                status={session.status}
                winner={session.winner}
              />
            </div>

            {/* ── [Row1, Col3] Commentator B PiP (Live Commentary) ── */}
            <div className="row-span-1">
              <div
                className="rounded-lg border overflow-hidden h-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(26,18,5,0.9), rgba(13,10,2,0.95))',
                  borderColor: 'rgba(212,160,23,0.2)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 8px rgba(212,160,23,0.05)',
                }}
              >
                <div
                  className="px-2.5 py-1.5 flex items-center gap-1.5"
                  style={{
                    background: 'linear-gradient(90deg, rgba(212,160,23,0.08), transparent)',
                    borderBottom: '1px solid rgba(212,160,23,0.12)',
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <MessageSquare className="w-3 h-3 text-amber-500/60" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-500/70">
                    Live Commentary
                  </span>
                </div>
                <div className="p-2.5 overflow-hidden">
                  {latestCommentary ? (
                    <p className="text-[10px] leading-[1.5] text-zinc-400 line-clamp-6">
                      {latestCommentary}
                    </p>
                  ) : (
                    <p className="text-[10px] text-zinc-700 italic">Awaiting first exchange...</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── [Row2, Col1] Axiom Panel A ───────────────────────── */}
            <div className="row-span-1 overflow-y-auto max-h-[480px]">
              <AxiomPanel
                side="a"
                bookTitle={bookA.title}
                authorName={bookA.author_name}
                axioms={axiomsA}
                lastDamagedId={lastDamagedId}
                model={modelA}
              />
            </div>

            {/* ── [Row2, Col2] Oxford Union Debate Stage ────────────── */}
            <div className="row-span-1">
              <div
                className="relative rounded-xl overflow-hidden h-full"
                style={{
                  border: '1px solid rgba(139,90,43,0.2)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 60px rgba(139,90,43,0.03)',
                  background: 'linear-gradient(180deg, rgba(26,18,10,0.6) 0%, rgba(13,9,4,0.8) 50%, rgba(8,6,3,0.9) 100%)',
                  minHeight: '360px',
                }}
              >
                {/* Stage floor wood texture */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-[0.05]"
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(139,90,43,0.3) 60px, rgba(139,90,43,0.3) 61px),
                      repeating-linear-gradient(0deg, transparent, transparent 120px, rgba(139,90,43,0.15) 120px, rgba(139,90,43,0.15) 121px)
                    `,
                  }}
                />

                {/* Overhead stage lighting */}
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse at center top, rgba(212,160,23,0.06) 0%, transparent 80%)',
                    animation: 'candleGlow 6s ease-in-out infinite',
                  }}
                />

                {/* View Mode Toggle */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                  <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-black/60 backdrop-blur-sm border border-[#27272a]/50">
                    <button
                      onClick={() => setViewMode('video')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                        viewMode === 'video' ? 'bg-amber-900/40 text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      <Monitor className="w-3 h-3" />
                      Chamber
                    </button>
                    <button
                      onClick={() => setViewMode('graph')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                        viewMode === 'graph' ? 'bg-amber-900/40 text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      <BarChart3 className="w-3 h-3" />
                      Battlefield
                    </button>
                  </div>
                </div>

                {viewMode === 'video' ? (
                  /* ── CHAMBER VIEW: Debater A | Judge | Debater B ─── */
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 p-4 pt-12 h-full min-h-[360px]">
                    {/* Debater A — Left podium */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full max-w-[260px]">
                        <AvatarVideo
                          sessionId={avSessions.debaterA?.sessionId || null}
                          iceServers={avSessions.debaterA?.iceServers}
                          offer={avSessions.debaterA?.offer}
                          side="a"
                          fallbackLabel={bookA.title}
                          coverUrl={bookA.cover_url}
                          isActive={isActive}
                        />
                      </div>
                      <div
                        className="px-4 py-1.5 rounded text-center"
                        style={{
                          background: 'linear-gradient(135deg, rgba(26,5,5,0.8), rgba(45,10,10,0.6))',
                          border: '1px solid rgba(239,68,68,0.25)',
                          boxShadow: '0 2px 8px rgba(239,68,68,0.1)',
                        }}
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">{bookA.title}</p>
                        <p className="text-[8px] text-zinc-500">{bookA.author_name}</p>
                      </div>
                    </div>

                    {/* Judge — Center (elevated) */}
                    <div className="flex flex-col items-center gap-2 px-2">
                      <div className="w-[110px] xl:w-[140px]">
                        <div
                          className="relative rounded-lg overflow-hidden"
                          style={{
                            border: '2px solid rgba(212,160,23,0.35)',
                            boxShadow: '0 0 24px rgba(212,160,23,0.12)',
                          }}
                        >
                          <div
                            className="aspect-[3/4] flex flex-col items-center justify-center"
                            style={{
                              background: 'linear-gradient(180deg, rgba(26,21,5,0.9) 0%, rgba(15,13,5,0.95) 100%)',
                            }}
                          >
                            <div className="text-3xl mb-1">&#x2696;&#xFE0F;</div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/60">Judge</span>
                            <span className="text-[8px] text-amber-400/40 mt-0.5">Gemini</span>
                          </div>
                        </div>
                      </div>
                      <div
                        className="px-3 py-1 rounded text-center"
                        style={{
                          background: 'linear-gradient(135deg, rgba(26,21,5,0.6), rgba(13,10,2,0.4))',
                          border: '1px solid rgba(212,160,23,0.15)',
                        }}
                      >
                        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/60">The Bench</p>
                      </div>
                    </div>

                    {/* Debater B — Right podium */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full max-w-[260px]">
                        <AvatarVideo
                          sessionId={avSessions.debaterB?.sessionId || null}
                          iceServers={avSessions.debaterB?.iceServers}
                          offer={avSessions.debaterB?.offer}
                          side="b"
                          fallbackLabel={bookB.title}
                          coverUrl={bookB.cover_url}
                          isActive={isActive}
                        />
                      </div>
                      <div
                        className="px-4 py-1.5 rounded text-center"
                        style={{
                          background: 'linear-gradient(135deg, rgba(5,13,26,0.8), rgba(10,26,45,0.6))',
                          border: '1px solid rgba(59,130,246,0.25)',
                          boxShadow: '0 2px 8px rgba(59,130,246,0.1)',
                        }}
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">{bookB.title}</p>
                        <p className="text-[8px] text-zinc-500">{bookB.author_name}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── BATTLEFIELD VIEW: SVG visualization ─── */
                  <div className="p-4 pt-12 min-h-[360px] flex items-center justify-center">
                    <BattlefieldGraph
                      axiomsA={axiomsA}
                      axiomsB={axiomsB}
                      latestAttack={latestAttack}
                      collapsible
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── [Row2, Col3] Axiom Panel B ───────────────────────── */}
            <div className="row-span-1 overflow-y-auto max-h-[480px]">
              <AxiomPanel
                side="b"
                bookTitle={bookB.title}
                authorName={bookB.author_name}
                axioms={axiomsB}
                lastDamagedId={lastDamagedId}
                model={modelB}
              />
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
               ROW 3: Controls + Shoutcaster Ticker
             ═══════════════════════════════════════════════════════════ */}
          <div className="mt-3 space-y-2">
            {/* Controls bar */}
            {isOwner && isActive && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  onClick={executeNextRound}
                  disabled={executing || session.current_round >= session.max_rounds}
                  size="sm"
                  className="bg-amber-700 hover:bg-amber-600 text-white border border-amber-600/30"
                >
                  {executing ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Executing...</>
                  ) : (
                    <><Play className="mr-1.5 h-3.5 w-3.5" />Next Round</>
                  )}
                </Button>
                <Button
                  onClick={() => setAutoPlay(!autoPlay)}
                  variant="outline"
                  size="sm"
                  className={autoPlay ? 'border-green-500 text-green-400' : 'border-zinc-700 text-zinc-400'}
                >
                  {autoPlay ? <><Pause className="mr-1.5 h-3.5 w-3.5" />Auto</> : 'Auto-Play'}
                </Button>
                <Button
                  onClick={() => handleAction('abandon')}
                  variant="outline"
                  size="sm"
                  className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  <Flag className="mr-1.5 h-3.5 w-3.5" />
                  Forfeit
                </Button>
              </div>
            )}

            {/* Shoutcaster Ticker */}
            <ShoutcasterTicker
              commentaries={commentaries}
              modelAttribution={{ referee: 'Gemini', commentator: 'Grok' }}
            />
          </div>

          {/* ═══════════════════════════════════════════════════════════
               ROW 4: Battlefield/Graph + Betting Panel
             ═══════════════════════════════════════════════════════════ */}
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-3">
            {/* Battlefield Graph or Argument Log */}
            <div>
              {viewMode === 'video' && (
                <div className="mb-3">
                  <BattlefieldGraph
                    axiomsA={axiomsA}
                    axiomsB={axiomsB}
                    latestAttack={latestAttack}
                    collapsible
                  />
                </div>
              )}
              <ArgumentLog
                rounds={rounds}
                args={args}
                bookATitle={bookA.title}
                bookBTitle={bookB.title}
              />
            </div>

            {/* Betting Panel */}
            <div className="space-y-3">
              <BettingPanel
                sessionId={session.id}
                pool={state.pool || null}
                bookATitle={bookA.title}
                bookBTitle={bookB.title}
                walletBalance={walletBalance}
                userBet={userBet}
                onPlaceBet={handlePlaceBet}
              />
              <RoundIndicator
                currentRound={session.current_round}
                maxRounds={session.max_rounds}
                status={session.status}
              />
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
               ROW 5: Sponsor Chyron
             ═══════════════════════════════════════════════════════════ */}
          <div className="mt-3">
            <SponsorChyron
              sponsors={state.sponsors || []}
              modelAttribution={{ referee: 'Gemini', commentator: 'Grok' }}
            />
          </div>

          {/* Synthesis (post-fight) */}
          {isCompleted && (
            <div className="mt-4">
              <SynthesisPanel
                sessionId={session.id}
                synthesis={session.synthesis as SynthesisResult | null}
                bookATitle={bookA.title}
                bookBTitle={bookB.title}
                winner={session.winner}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
