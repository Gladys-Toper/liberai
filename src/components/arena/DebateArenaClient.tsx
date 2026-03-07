'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Pause, Loader2, Flag, Trophy, Monitor, BarChart3 } from 'lucide-react'
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

// ── Screen Shake CSS ───────────────────────────────────────────────────
const SHAKE_KEYFRAMES = `
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
`

// ── Main Component ─────────────────────────────────────────────────────
export function DebateArenaClient({ initialState, isOwner }: DebateArenaClientProps) {
  const router = useRouter()
  const [state, setState] = useState<DebateState>(initialState)
  const [executing, setExecuting] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const [lastDamagedId, setLastDamagedId] = useState<string>()
  const [latestAttack, setLatestAttack] = useState<{ attackerSide: 'a' | 'b'; targetAxiomId: string } | null>(null)
  const [viewMode, setViewMode] = useState<'video' | 'graph'>('graph')
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
        // AV not available — stay in graph mode
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
      // Pass AV session IDs so the backend can pipe TTS audio to Simli avatars
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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHAKE_KEYFRAMES }} />

      <div
        className="min-h-screen bg-[#0a0a0a]"
        style={{ animation: shaking ? 'arenaShake 0.5s ease-in-out' : 'none' }}
      >
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          {/* Header */}
          <div className="mb-4 text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-700 mb-1">
              Ontological Pugilism Arena
            </p>
            <p className="text-sm text-zinc-400 italic max-w-xl mx-auto">
              &ldquo;{session.crucible_question}&rdquo;
            </p>
          </div>

          {/* Fighting Game Scoreboard */}
          <div className="mb-4">
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

          {/* Winner Banner */}
          <AnimatePresence>
            {isCompleted && winnerBook && (
              <motion.div
                className="mb-4 rounded-xl p-4 text-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.05))',
                  border: '1px solid rgba(234,179,8,0.2)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Trophy className="mx-auto h-6 w-6 text-amber-400 mb-2" />
                <p className="text-lg font-bold text-amber-400">{winnerBook.title} Wins!</p>
                <p className="text-xs text-zinc-500">Victory by {session.win_condition}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════════════════════════════════════════════════════════
               OXFORD UNION DEBATE CHAMBER
               Layout: Commentators (top corners) | Debater A | Judge | Debater B
               Below: Axiom panels, Shoutcaster, Battlefield, Betting
             ═══════════════════════════════════════════════════════════ */}

          {/* ── Debate Chamber: The Main Stage ──────────────────────── */}
          <div className="relative">
            {/* Commentator PiP — Top Left */}
            {latestCommentary && (
              <div
                className="absolute top-2 left-2 z-20 w-[160px] xl:w-[200px]"
                style={{
                  filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.8))',
                }}
              >
                <CommentatorBooth
                  sessionId={avSessions.commentator?.sessionId}
                  iceServers={avSessions.commentator?.iceServers}
                  offer={avSessions.commentator?.offer}
                  latestCommentary={latestCommentary}
                  position="inline"
                  compact
                />
              </div>
            )}

            {/* Commentator PiP — Top Right (mirror, shows text ticker) */}
            {latestCommentary && (
              <div
                className="absolute top-2 right-2 z-20 w-[160px] xl:w-[200px]"
                style={{
                  filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.8))',
                }}
              >
                <div
                  className="rounded-lg border overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #1a1205, #0d0a02)',
                    borderColor: '#d4a01740',
                  }}
                >
                  <div className="px-2 py-1 flex items-center gap-1.5 border-b" style={{ borderColor: '#d4a01730' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/70">
                      Live Commentary
                    </span>
                  </div>
                  <div className="p-2 max-h-[80px] overflow-hidden">
                    <p className="text-[9px] leading-[1.4] text-zinc-400 line-clamp-4">
                      {latestCommentary}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Oxford Union Stage — 3-panel: Debater A | Judge | Debater B */}
            <div
              className="relative rounded-xl overflow-hidden border border-[#27272a]"
              style={{
                background: 'linear-gradient(180deg, #0c0c0c 0%, #080808 100%)',
                minHeight: '320px',
              }}
            >
              {/* Stage wood grain texture overlay */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139,90,43,0.3) 2px, rgba(139,90,43,0.3) 3px)',
                }}
              />

              {/* View Mode Toggle (top center) */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-black/60 backdrop-blur-sm border border-[#27272a]/50">
                  <button
                    onClick={() => setViewMode('video')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      viewMode === 'video' ? 'bg-[#27272a] text-white' : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    <Monitor className="w-3 h-3" />
                    Chamber
                  </button>
                  <button
                    onClick={() => setViewMode('graph')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      viewMode === 'graph' ? 'bg-[#27272a] text-white' : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    <BarChart3 className="w-3 h-3" />
                    Battlefield
                  </button>
                </div>
              </div>

              {viewMode === 'video' ? (
                /* ── CHAMBER VIEW: Oxford Union layout ─── */
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-0 p-4 pt-12 min-h-[320px]">
                  {/* Debater A — Left podium */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-full max-w-[240px]">
                      <AvatarVideo
                        sessionId={avSessions.debaterA?.sessionId}
                        iceServers={avSessions.debaterA?.iceServers}
                        offer={avSessions.debaterA?.offer}
                        side="a"
                        fallbackLabel={bookA.title}
                        coverUrl={bookA.cover_url}
                        isActive={isActive}
                      />
                    </div>
                    {/* Podium nameplate */}
                    <div
                      className="px-3 py-1.5 rounded text-center"
                      style={{
                        background: 'linear-gradient(135deg, #1a0505, #2d0a0a)',
                        border: '1px solid #ef444440',
                      }}
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">{bookA.title}</p>
                      <p className="text-[8px] text-zinc-500">{bookA.author_name}</p>
                    </div>
                  </div>

                  {/* Judge — Center (elevated, smaller) */}
                  <div className="flex flex-col items-center gap-2 px-4 -mb-2">
                    <div
                      className="w-[120px] xl:w-[150px] relative"
                    >
                      {/* Judge "bench" elevated platform */}
                      <div
                        className="relative rounded-lg overflow-hidden"
                        style={{
                          border: '2px solid #d4a01760',
                          boxShadow: '0 0 20px rgba(212,160,23,0.15)',
                        }}
                      >
                        {/* Judge avatar placeholder — Gemini */}
                        <div
                          className="aspect-[3/4] flex flex-col items-center justify-center"
                          style={{
                            background: 'linear-gradient(180deg, #0f0d05 0%, #1a1505 100%)',
                          }}
                        >
                          <div className="text-3xl mb-1">⚖️</div>
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/60">Judge</span>
                          <span className="text-[8px] text-amber-400/40 mt-0.5">Gemini</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="px-3 py-1 rounded text-center"
                      style={{
                        background: 'linear-gradient(135deg, #1a1505, #0d0a02)',
                        border: '1px solid #d4a01730',
                      }}
                    >
                      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/70">The Bench</p>
                    </div>
                  </div>

                  {/* Debater B — Right podium */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-full max-w-[240px]">
                      <AvatarVideo
                        sessionId={avSessions.debaterB?.sessionId}
                        iceServers={avSessions.debaterB?.iceServers}
                        offer={avSessions.debaterB?.offer}
                        side="b"
                        fallbackLabel={bookB.title}
                        coverUrl={bookB.cover_url}
                        isActive={isActive}
                      />
                    </div>
                    {/* Podium nameplate */}
                    <div
                      className="px-3 py-1.5 rounded text-center"
                      style={{
                        background: 'linear-gradient(135deg, #050d1a, #0a1a2d)',
                        border: '1px solid #3b82f640',
                      }}
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">{bookB.title}</p>
                      <p className="text-[8px] text-zinc-500">{bookB.author_name}</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── BATTLEFIELD VIEW: SVG visualization ─── */
                <div className="p-4 pt-12 min-h-[320px] flex items-center justify-center">
                  <BattlefieldGraph
                    axiomsA={axiomsA}
                    axiomsB={axiomsB}
                    latestAttack={latestAttack}
                    collapsible
                  />
                </div>
              )}
            </div>

            {/* Controls bar — below the stage */}
            {isOwner && isActive && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <Button
                  onClick={executeNextRound}
                  disabled={executing || session.current_round >= session.max_rounds}
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white"
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
                  className={autoPlay ? 'border-green-500 text-green-400' : ''}
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
          </div>

          {/* Shoutcaster Ticker — below the stage */}
          <div className="mt-3">
            <ShoutcasterTicker
              commentaries={commentaries}
              modelAttribution={{ referee: 'Gemini', commentator: 'Grok' }}
            />
          </div>

          {/* ── Axiom Panels + Betting: Below the stage ──────────── */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px_1fr] mt-4">
            {/* Side A Axioms */}
            <AxiomPanel
              side="a"
              bookTitle={bookA.title}
              authorName={bookA.author_name}
              axioms={axiomsA}
              lastDamagedId={lastDamagedId}
              model={modelA}
            />

            {/* Betting Panel (center below) */}
            <BettingPanel
              sessionId={session.id}
              pool={state.pool || null}
              bookATitle={bookA.title}
              bookBTitle={bookB.title}
              walletBalance={walletBalance}
              userBet={userBet}
              onPlaceBet={handlePlaceBet}
            />

            {/* Side B Axioms */}
            <AxiomPanel
              side="b"
              bookTitle={bookB.title}
              authorName={bookB.author_name}
              axioms={axiomsB}
              lastDamagedId={lastDamagedId}
              model={modelB}
            />
          </div>

          {/* Sponsor Chyron — always visible, shows model attribution even without sponsors */}
          <div className="mt-4">
            <SponsorChyron
              sponsors={state.sponsors || []}
              modelAttribution={{ referee: 'Gemini', commentator: 'Grok' }}
            />
          </div>

          {/* Round Indicator */}
          <div className="mt-4 flex items-center justify-center">
            <RoundIndicator
              currentRound={session.current_round}
              maxRounds={session.max_rounds}
              status={session.status}
            />
          </div>

          {/* Argument Log */}
          <div className="mt-4">
            <ArgumentLog
              rounds={rounds}
              args={args}
              bookATitle={bookA.title}
              bookBTitle={bookB.title}
            />
          </div>

          {/* Synthesis (post-fight) */}
          {isCompleted && (
            <div className="mt-6">
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
