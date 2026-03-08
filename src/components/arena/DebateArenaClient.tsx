'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Pause, Loader2, Flag, Trophy, BarChart3, MessageSquare, Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AxiomPanel } from './AxiomPanel'
import { BattlefieldGraph } from './BattlefieldGraph'
import { ArgumentLog } from './ArgumentLog'
import { SynthesisPanel, type SynthesisResult } from './SynthesisPanel'
import { BettingPanel } from './BettingPanel'
import { SponsorChyron } from './SponsorChyron'
import { CinematicPlayer } from './CinematicPlayer'
import type { TimelineEvent } from '@/lib/arena/timeline-sync'

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
  bookA: { id: string; title: string; author_name: string; cover_url?: string | null; portrait_url?: string | null; nationality?: string | null }
  bookB: { id: string; title: string; author_name: string; cover_url?: string | null; portrait_url?: string | null; nationality?: string | null }
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
// Faithful to the actual Oxford Union Debating Chamber:
//   - Victorian Gothic Revival architecture (Alfred Waterhouse, 1878)
//   - Open timber roof with William Morris decorative patterns
//   - Dark wood paneling and gallery bookshelves
//   - Six-foil circular windows in ten bays
//   - Pre-Raphaelite richness: deep reds, golds, forest greens
//   - Warm gas-lamp / candlelight ambiance
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
@keyframes candleFlicker {
  0%, 100% { opacity: 0.6; filter: brightness(1); }
  15% { opacity: 0.55; filter: brightness(0.97); }
  30% { opacity: 0.65; filter: brightness(1.02); }
  45% { opacity: 0.58; filter: brightness(0.99); }
  60% { opacity: 0.63; filter: brightness(1.01); }
  75% { opacity: 0.57; filter: brightness(0.98); }
  90% { opacity: 0.62; filter: brightness(1.0); }
}
@keyframes roofTimberShimmer {
  0%, 100% { opacity: 0.08; }
  50% { opacity: 0.12; }
}
@keyframes gasLampGlow {
  0%, 100% { opacity: 0.4; }
  25% { opacity: 0.5; }
  50% { opacity: 0.45; }
  75% { opacity: 0.52; }
}
@keyframes morrisPattern {
  0% { background-position: 0 0; }
  100% { background-position: 200px 200px; }
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
  const [shaking, setShaking] = useState(false)
  const [walletBalance, setWalletBalance] = useState(1000)
  const [userBet, setUserBet] = useState<{ side: 'a' | 'b'; amount: number; payout: number | null } | null>(null)

  // ── Cinematic video replay state ──────────────────────────────────
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoTimeline, setVideoTimeline] = useState<TimelineEvent[] | null>(null)
  const [videoStatus, setVideoStatus] = useState<string | null>(null)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoTotal, setVideoTotal] = useState(0)
  const [videoEstimatedSeconds, setVideoEstimatedSeconds] = useState(0)
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(0)
  const [showCinematic, setShowCinematic] = useState(false)
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [videoCheckDone, setVideoCheckDone] = useState(initialState.session.status !== 'completed')
  const stallCountRef = useRef(0)
  const lastProgressRef = useRef(0)

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

  // ── Check for existing cinematic video + poster on load ──────────
  useEffect(() => {
    async function checkVideo() {
      try {
        const res = await fetch(`/api/arena/${session.id}/video`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'complete' && data.videoUrl) {
          setVideoUrl(data.videoUrl)
          setVideoTimeline(data.timeline || [])
          setVideoStatus('complete')
        } else if (data.status === 'generating') {
          setVideoStatus('generating')
          setVideoProgress(data.progress || 0)
          setVideoTotal(data.total || 0)
          setVideoEstimatedSeconds(data.estimatedSecondsRemaining || 0)
          setVideoDurationSeconds(data.videoDurationSeconds || 0)
          // Also fetch poster for the wait screen
          try {
            const posterRes = await fetch(`/api/arena/${session.id}/poster`)
            if (posterRes.ok) {
              const posterData = await posterRes.json()
              if (posterData.posterUrl) setPosterUrl(posterData.posterUrl)
            }
          } catch { /* poster is optional */ }
        } else if (data.status === 'failed') {
          setVideoStatus('failed')
          setVideoProgress(data.progress || 0)
          setVideoTotal(data.total || 0)
          // Fetch poster for failed wait screen too
          try {
            const posterRes = await fetch(`/api/arena/${session.id}/poster`)
            if (posterRes.ok) {
              const posterData = await posterRes.json()
              if (posterData.posterUrl) setPosterUrl(posterData.posterUrl)
            }
          } catch { /* poster is optional */ }
        }
      } catch { /* video check optional */ } finally {
        setVideoCheckDone(true)
      }
    }
    if (session.status === 'completed') {
      checkVideo()
    }
  }, [session.id, session.status])

  // ── Poll video generation progress (with stall detection) ────────
  useEffect(() => {
    if (videoStatus !== 'generating') return
    stallCountRef.current = 0
    lastProgressRef.current = 0

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/arena/${session.id}/video`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'complete' && data.videoUrl) {
          setVideoUrl(data.videoUrl)
          setVideoTimeline(data.timeline || [])
          setVideoStatus('complete')
          setVideoProgress(data.total || 0)
          setVideoEstimatedSeconds(0)
          stallCountRef.current = 0
        } else if (data.status === 'generating') {
          setVideoProgress(data.progress || 0)
          setVideoTotal(data.total || 0)
          setVideoEstimatedSeconds(data.estimatedSecondsRemaining || 0)
          setVideoDurationSeconds(data.videoDurationSeconds || 0)

          // Stall detection: if progress unchanged for 3 polls (~15s)
          // and no step in progress, re-trigger pipeline
          if (data.progress === lastProgressRef.current && !data.stepInProgress) {
            stallCountRef.current += 1
            if (stallCountRef.current >= 3) {
              console.log(`[Video] Stall detected at chunk ${data.progress}/${data.total}. Re-triggering pipeline...`)
              stallCountRef.current = 0
              // Re-trigger — POST will pick up where it left off
              fetch(`/api/arena/${session.id}/video`, { method: 'POST' }).catch(() => {})
            }
          } else {
            stallCountRef.current = 0
          }
          lastProgressRef.current = data.progress || 0
        } else if (data.status === 'failed') {
          setVideoStatus('failed')
        }
      } catch { /* polling retry */ }
    }, 5000)

    return () => clearInterval(interval)
  }, [session.id, videoStatus])

  // ── Trigger cinematic video generation ────────────────────────────
  const generateCinematicVideo = useCallback(async () => {
    if (videoStatus === 'generating') return
    setVideoStatus('generating')
    setVideoProgress(0)

    // Fire video pipeline + fight poster in parallel
    const videoPromise = fetch(`/api/arena/${session.id}/video`, { method: 'POST' })
    const posterPromise = fetch(`/api/arena/${session.id}/poster`, { method: 'POST' })

    // Handle poster (fast ~3-5s) — don't block on it
    posterPromise
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          if (data.posterUrl) setPosterUrl(data.posterUrl)
        }
      })
      .catch(() => { /* poster is optional enhancement */ })

    // Handle video pipeline
    try {
      const res = await videoPromise
      if (!res.ok) {
        const err = await res.json()
        console.error('Video generation failed:', err.error)
        setVideoStatus('failed')
        return
      }
      const data = await res.json()
      // Read initial estimates from POST response
      if (data.estimatedSecondsRemaining) {
        setVideoEstimatedSeconds(data.estimatedSecondsRemaining)
      }
      if (data.videoDurationSeconds) {
        setVideoDurationSeconds(data.videoDurationSeconds)
      }
      if (data.total) {
        setVideoTotal(data.total)
      }
      if (data.progress) {
        setVideoProgress(data.progress)
      }
      // POST triggers background pipeline — polling picks up progress
    } catch (err) {
      console.error('Video generation request failed:', err)
      setVideoStatus('failed')
    }
  }, [session.id, videoStatus])

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
      const res = await fetch(`/api/arena/${session.id}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
  }, [executing, session.id, session.status])

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
     OXFORD UNION BROADCAST — Full-viewport cinematic debate video

     Modeled after an actual Oxford Union debate broadcast:
       - Full-screen split view of the two debaters
       - Score/HP HUD overlaid at top
       - Commentator picture-in-picture box
       - Lower-third chyron with commentary + sponsor ticker
       - Controls overlaid at bottom center
     ═══════════════════════════════════════════════════════════════════════ */

  const [showAxiomDrawer, setShowAxiomDrawer] = useState(false)
  const [showBettingDrawer, setShowBettingDrawer] = useState(false)
  const [showArgumentLog, setShowArgumentLog] = useState(false)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ARENA_STYLES }} />

      {/* ═══════════════════════════════════════════════════════════════════════
          CINEMATIC REPLAY MODE — Full-screen video player with timeline sync
          ═══════════════════════════════════════════════════════════════════════ */}
      {showCinematic && videoUrl && videoTimeline && (
        <div className="relative w-full" style={{ height: '100vh' }}>
          <CinematicPlayer
            videoUrl={videoUrl}
            timeline={videoTimeline}
            axiomsA={axiomsA.map(a => ({
              ...a,
              session_id: session.id,
              description: null,
              source_chunk_ids: [],
              is_destroyed: a.is_destroyed,
              destroyed_at_round: null,
            }))}
            axiomsB={axiomsB.map(a => ({
              ...a,
              session_id: session.id,
              description: null,
              source_chunk_ids: [],
              is_destroyed: a.is_destroyed,
              destroyed_at_round: null,
            }))}
            bookATitle={bookA.title}
            bookBTitle={bookB.title}
            pool={state.pool || null}
            sponsors={state.sponsors || []}
            maxRounds={session.max_rounds}
            sessionId={session.id}
          />
          {/* Back to arena button */}
          <button
            onClick={() => setShowCinematic(false)}
            className="absolute top-4 left-4 z-50 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-amber-400 border border-amber-600/30 bg-black/70 backdrop-blur-sm hover:bg-black/90 transition-colors"
          >
            ← Back to Arena
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          LIVE DEBATE / POST-DEBATE ARENA VIEW
          ═══════════════════════════════════════════════════════════════════════ */}
      {(!showCinematic || !videoUrl || !videoTimeline) && (
      <div
        className="relative w-full overflow-hidden"
        style={{
          height: '100vh',
          background: '#000',
          animation: shaking ? 'arenaShake 0.5s ease-in-out' : 'none',
        }}
      >
        {/* ═══════════════════════════════════════════════════════════════
            LAYER 0: Full-viewport split-screen debater portraits
            ═══════════════════════════════════════════════════════════════ */}
        <div className="absolute inset-0 grid grid-cols-2">
          {/* ── LEFT: Debater A ─── */}
          <div className="relative overflow-hidden" style={{ borderRight: '1px solid rgba(180,140,50,0.15)' }}>
            {/* Portrait / Cover fallback */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-red-950/30 to-black">
              {bookA.portrait_url || bookA.cover_url ? (
                <img
                  src={bookA.portrait_url || bookA.cover_url || ''}
                  alt={bookA.author_name}
                  className="w-full h-full object-cover opacity-60"
                />
              ) : (
                <div className="text-6xl font-black text-red-500/20 uppercase tracking-wider">
                  {bookA.author_name.charAt(0)}
                </div>
              )}
              {/* Vignette overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
            </div>

            {/* Name plate — lower left */}
            <div className="absolute bottom-24 left-0 z-30">
              <div
                className="px-5 py-2.5"
                style={{
                  background: 'linear-gradient(90deg, rgba(180,20,20,0.85), rgba(180,20,20,0.6), transparent)',
                  borderTop: '2px solid rgba(239,68,68,0.6)',
                }}
              >
                <p className="text-sm font-black uppercase tracking-[0.15em] text-white">{bookA.author_name}</p>
                <p className="text-[11px] text-red-200/80 italic">{bookA.title}</p>
              </div>
              {/* Model badge */}
              <div
                className="inline-block px-3 py-0.5 mt-px"
                style={{ background: 'rgba(0,0,0,0.7)' }}
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-orange-400">
                  {modelA === 'claude' ? '⚡ Claude' : modelA === 'openai' ? '🤖 GPT' : modelA === 'gemini' ? '💎 Gemini' : `⚙️ ${modelA}`}
                </span>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Debater B ─── */}
          <div className="relative overflow-hidden" style={{ borderLeft: '1px solid rgba(180,140,50,0.15)' }}>
            {/* Portrait / Cover fallback */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-blue-950/30 to-black">
              {bookB.portrait_url || bookB.cover_url ? (
                <img
                  src={bookB.portrait_url || bookB.cover_url || ''}
                  alt={bookB.author_name}
                  className="w-full h-full object-cover opacity-60"
                />
              ) : (
                <div className="text-6xl font-black text-blue-500/20 uppercase tracking-wider">
                  {bookB.author_name.charAt(0)}
                </div>
              )}
              {/* Vignette overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
            </div>

            {/* Name plate — lower right */}
            <div className="absolute bottom-24 right-0 z-30 text-right">
              <div
                className="px-5 py-2.5"
                style={{
                  background: 'linear-gradient(270deg, rgba(20,60,180,0.85), rgba(20,60,180,0.6), transparent)',
                  borderTop: '2px solid rgba(59,130,246,0.6)',
                }}
              >
                <p className="text-sm font-black uppercase tracking-[0.15em] text-white">{bookB.author_name}</p>
                <p className="text-[11px] text-blue-200/80 italic">{bookB.title}</p>
              </div>
              <div
                className="inline-block px-3 py-0.5 mt-px"
                style={{ background: 'rgba(0,0,0,0.7)' }}
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-green-400">
                  {modelB === 'openai' ? '🤖 GPT' : modelB === 'claude' ? '⚡ Claude' : modelB === 'gemini' ? '💎 Gemini' : `⚙️ ${modelB}`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Center VS Emblem ─── */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(26,21,5,0.95) 0%, rgba(10,8,3,0.98) 100%)',
                border: '2px solid rgba(180,140,50,0.4)',
                boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(180,140,50,0.1)',
              }}
            >
              <span className="text-xl font-black text-amber-500/60" style={{ letterSpacing: '0.1em' }}>VS</span>
            </div>
            {/* Judge label below */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 text-center whitespace-nowrap">
              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-400/40">
                ⚖️ Judged by Gemini
              </span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER 1: Top HUD — Score bar + Round indicator
            ═══════════════════════════════════════════════════════════════ */}
        <div className="absolute top-0 left-0 right-0 z-30">
          {/* Oxford Union header */}
          <div
            className="text-center py-1.5"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.5), transparent)',
            }}
          >
            <p className="text-[8px] uppercase tracking-[0.5em] text-amber-700/50" style={{ fontVariant: 'small-caps' }}>
              The Oxford Union &mdash; Ontological Pugilism
            </p>
            <p className="text-[11px] text-amber-200/40 italic mt-0.5 max-w-xl mx-auto leading-snug px-4">
              &ldquo;{session.crucible_question}&rdquo;
            </p>
          </div>

          {/* Score HUD bar */}
          <div
            className="mx-auto max-w-3xl px-4"
            style={{ marginTop: '-2px' }}
          >
            <div
              className="flex items-center gap-0"
              style={{
                background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(12px)',
                borderRadius: '0 0 8px 8px',
                border: '1px solid rgba(180,140,50,0.15)',
                borderTop: 'none',
                overflow: 'hidden',
              }}
            >
              {/* Side A HP */}
              <div className="flex-1 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-400 min-w-[50px]">
                    {bookA.title.length > 12 ? bookA.title.slice(0, 12) + '…' : bookA.title}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-red-950/50">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: hpPercentA > 50
                          ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                          : hpPercentA > 25
                            ? 'linear-gradient(90deg, #eab308, #facc15)'
                            : 'linear-gradient(90deg, #ef4444, #f87171)',
                      }}
                      animate={{ width: `${hpPercentA}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-zinc-400 min-w-[35px] text-right">
                    {Math.round(hpPercentA)}%
                  </span>
                </div>
              </div>

              {/* Round counter */}
              <div
                className="px-4 py-1 text-center"
                style={{ borderLeft: '1px solid rgba(180,140,50,0.15)', borderRight: '1px solid rgba(180,140,50,0.15)' }}
              >
                <p className="text-[8px] uppercase tracking-[0.3em] text-amber-600/50">Round</p>
                <p className="text-lg font-black text-amber-400 leading-none">
                  {session.current_round}<span className="text-amber-700 text-xs">/{session.max_rounds}</span>
                </p>
              </div>

              {/* Side B HP */}
              <div className="flex-1 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-zinc-400 min-w-[35px]">
                    {Math.round(hpPercentB)}%
                  </span>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-blue-950/50">
                    <motion.div
                      className="h-full rounded-full float-right"
                      style={{
                        background: hpPercentB > 50
                          ? 'linear-gradient(270deg, #22c55e, #4ade80)'
                          : hpPercentB > 25
                            ? 'linear-gradient(270deg, #eab308, #facc15)'
                            : 'linear-gradient(270deg, #ef4444, #f87171)',
                      }}
                      animate={{ width: `${hpPercentB}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 min-w-[50px] text-right">
                    {bookB.title.length > 12 ? bookB.title.slice(0, 12) + '…' : bookB.title}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER 2: Winner / Fight-poster wait screen overlay
            ═══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {/* ── Full-bleed fight poster wait screen (during video gen or failed) ── */}
          {isCompleted && (videoStatus === 'generating' || videoStatus === 'failed') && (
            <motion.div
              className="absolute inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              key="poster-wait"
            >
              {/* Poster image with Ken Burns slow zoom */}
              {posterUrl ? (
                <motion.div
                  className="absolute inset-0 overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8 }}
                >
                  <img
                    src={posterUrl}
                    alt="Fight Poster"
                    className="w-full h-full object-cover"
                    style={{
                      animation: 'kenBurns 60s ease-in-out infinite alternate',
                    }}
                  />
                  {/* Gradient vignette overlay */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
                    }}
                  />
                </motion.div>
              ) : (
                /* Loading state while poster generates (~3-5s) */
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <motion.div
                    className="text-center"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <Loader2 className="mx-auto h-10 w-10 text-amber-400 animate-spin mb-4" />
                    <p className="text-lg font-black text-amber-400 uppercase tracking-wider">Preparing the Arena</p>
                    <p className="text-sm text-zinc-500 mt-1">Generating fight poster…</p>
                  </motion.div>
                </div>
              )}

              {/* ── Bottom progress bar / retry overlay ── */}
              <div
                className="absolute bottom-0 left-0 right-0 z-50 px-6 py-4"
                style={{
                  background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                }}
              >
                <div className="max-w-2xl mx-auto">
                  {videoStatus === 'failed' ? (
                    /* ── Failed state: show progress so far + retry button ── */
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-3 mb-3">
                        <span className="text-sm font-bold text-red-400">
                          Pipeline interrupted — {videoProgress}/{videoTotal} chunks rendered
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-amber-950/60 overflow-hidden mb-3">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400"
                          style={{ width: `${videoTotal > 0 ? (videoProgress / videoTotal) * 100 : 0}%` }}
                        />
                      </div>
                      <button
                        onClick={generateCinematicVideo}
                        className="px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider text-sm text-amber-400 border border-amber-500/40 bg-amber-950/40 hover:bg-amber-950/70 transition-all"
                      >
                        <Film className="inline-block w-4 h-4 mr-2 -mt-0.5" />
                        Retry Cinematic Replay
                      </button>
                    </div>
                  ) : (
                    /* ── Generating state: progress bar + time estimate ── */
                    <>
                      <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                        <span className="text-sm font-bold text-amber-400">
                          Rendering {videoDurationSeconds > 0 ? `${Math.round(videoDurationSeconds / 60)} min` : ''} cinematic replay…
                        </span>
                        <span className="text-[11px] text-zinc-500 ml-auto">
                          {videoEstimatedSeconds > 60
                            ? `~${Math.ceil(videoEstimatedSeconds / 60)} min remaining`
                            : videoEstimatedSeconds > 0
                              ? `~${videoEstimatedSeconds}s remaining`
                              : 'Starting pipeline…'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-amber-950/60 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
                          animate={{ width: `${videoTotal > 0 ? (videoProgress / videoTotal) * 100 : 5}%` }}
                          transition={{ type: 'spring', stiffness: 60, damping: 20 }}
                        />
                      </div>
                      {videoTotal > 0 && (
                        <p className="text-[10px] text-zinc-600 mt-1">
                          {videoProgress}/{videoTotal} chunks rendered
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ── BettingPanel floating card (bottom-right on desktop, below on mobile) ── */}
              <motion.div
                className="absolute z-50 right-4 bottom-24 w-[280px] hidden lg:block"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: 'rgba(10,8,5,0.92)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(180,140,50,0.2)',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                  }}
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500/60 mb-2">Place Your Bets</p>
                  <BettingPanel
                    sessionId={session.id}
                    pool={state.pool || null}
                    bookATitle={bookA.title}
                    bookBTitle={bookB.title}
                    walletBalance={walletBalance}
                    userBet={userBet}
                    onPlaceBet={handlePlaceBet}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ── Standard winner overlay (non-generating states) ── */}
          {isCompleted && videoCheckDone && winnerBook && videoStatus !== 'generating' && (
            <motion.div
              className="absolute inset-0 z-40 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ background: 'rgba(0,0,0,0.6)' }}
              key="winner-overlay"
            >
              <motion.div
                className="text-center"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.3 }}
              >
                <Trophy className="mx-auto h-16 w-16 text-amber-400 mb-4" />
                <p className="text-4xl font-black text-amber-400 uppercase tracking-wider">{winnerBook.title}</p>
                <p className="text-xl text-amber-300/60 uppercase tracking-[0.3em] mt-2">Wins</p>
                <p className="text-sm text-zinc-500 mt-3">Victory by {session.win_condition}</p>

                {/* ── Cinematic Replay Buttons ── */}
                <div className="mt-6 flex items-center justify-center gap-3">
                  {videoStatus === 'complete' && videoUrl ? (
                    <button
                      onClick={() => setShowCinematic(true)}
                      className="px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider text-sm text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-all shadow-lg shadow-amber-500/20"
                    >
                      <Film className="inline-block w-4 h-4 mr-2 -mt-0.5" />
                      Watch Cinematic Replay
                    </button>
                  ) : videoStatus === 'failed' ? (
                    <button
                      onClick={generateCinematicVideo}
                      className="px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider text-sm text-amber-400 border border-red-500/40 bg-red-950/30 hover:bg-red-950/50 transition-all"
                    >
                      <Film className="inline-block w-4 h-4 mr-2 -mt-0.5" />
                      Retry Cinematic Replay
                    </button>
                  ) : (
                    <button
                      onClick={generateCinematicVideo}
                      className="px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider text-sm text-amber-400 border border-amber-600/30 bg-amber-950/30 hover:bg-amber-950/50 transition-all"
                    >
                      <Film className="inline-block w-4 h-4 mr-2 -mt-0.5" />
                      Generate Cinematic Replay
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ken Burns CSS keyframe animation (global style for poster zoom) */}
        {(videoStatus === 'generating' || videoStatus === 'failed') && posterUrl && (
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes kenBurns {
              0% { transform: scale(1) translate(0, 0); }
              100% { transform: scale(1.08) translate(-1%, -1%); }
            }
          `}} />
        )}

        {/* ═══════════════════════════════════════════════════════════════
            LAYER 4: Bottom — Controls + Commentary Lower-Third + Chyron
            ═══════════════════════════════════════════════════════════════ */}
        <div className="absolute bottom-0 left-0 right-0 z-30">
          {/* Controls bar */}
          {isOwner && isActive && (
            <div className="flex items-center justify-center gap-2 mb-2">
              <Button
                onClick={executeNextRound}
                disabled={executing || session.current_round >= session.max_rounds}
                size="sm"
                className="bg-amber-700/90 hover:bg-amber-600 text-white border border-amber-600/30 backdrop-blur-sm"
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
                className={`backdrop-blur-sm ${autoPlay ? 'border-green-500 text-green-400 bg-green-950/50' : 'border-zinc-700 text-zinc-400 bg-black/50'}`}
              >
                {autoPlay ? <><Pause className="mr-1.5 h-3.5 w-3.5" />Auto</> : 'Auto-Play'}
              </Button>
              <Button
                onClick={() => handleAction('abandon')}
                variant="outline"
                size="sm"
                className="text-red-400 border-red-500/30 hover:bg-red-500/10 bg-black/50 backdrop-blur-sm"
              >
                <Flag className="mr-1.5 h-3.5 w-3.5" />
                Forfeit
              </Button>
            </div>
          )}

          {/* Commentary lower-third */}
          <div
            className="px-6 py-2"
            style={{
              background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.9))',
            }}
          >
            {latestCommentary && (
              <div className="max-w-4xl mx-auto mb-1.5">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-500/60">Commentary</span>
                  </div>
                  <motion.p
                    key={latestCommentary.slice(0, 20)}
                    className="text-xs text-zinc-300 leading-relaxed line-clamp-2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    {latestCommentary}
                  </motion.p>
                </div>
              </div>
            )}

            {/* Sponsor chyron ticker */}
            <SponsorChyron
              sponsors={state.sponsors || []}
              modelAttribution={{ referee: 'Gemini', commentator: 'Grok' }}
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER 5: Floating drawer toggle buttons (right edge)
            ═══════════════════════════════════════════════════════════════ */}
        <div className="absolute top-1/2 right-2 -translate-y-1/2 z-30 flex flex-col gap-2">
          <button
            onClick={() => { setShowAxiomDrawer(!showAxiomDrawer); setShowBettingDrawer(false); setShowArgumentLog(false) }}
            className={`p-2 rounded-lg backdrop-blur-sm transition-all ${
              showAxiomDrawer ? 'bg-amber-900/60 border-amber-600/50' : 'bg-black/60 border-zinc-800/50 hover:bg-black/80'
            } border`}
            title="Axiom Health"
          >
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </button>
          <button
            onClick={() => { setShowBettingDrawer(!showBettingDrawer); setShowAxiomDrawer(false); setShowArgumentLog(false) }}
            className={`p-2 rounded-lg backdrop-blur-sm transition-all ${
              showBettingDrawer ? 'bg-amber-900/60 border-amber-600/50' : 'bg-black/60 border-zinc-800/50 hover:bg-black/80'
            } border`}
            title="Betting"
          >
            <span className="text-sm">🎰</span>
          </button>
          <button
            onClick={() => { setShowArgumentLog(!showArgumentLog); setShowAxiomDrawer(false); setShowBettingDrawer(false) }}
            className={`p-2 rounded-lg backdrop-blur-sm transition-all ${
              showArgumentLog ? 'bg-amber-900/60 border-amber-600/50' : 'bg-black/60 border-zinc-800/50 hover:bg-black/80'
            } border`}
            title="Argument Log"
          >
            <MessageSquare className="w-4 h-4 text-amber-400" />
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER 6: Slide-out drawers
            ═══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showAxiomDrawer && (
            <motion.div
              className="absolute top-24 right-12 bottom-28 z-30 w-[520px] overflow-y-auto"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            >
              <div
                className="rounded-xl p-3 space-y-3 h-full overflow-y-auto"
                style={{
                  background: 'rgba(10,8,5,0.92)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(180,140,50,0.15)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <AxiomPanel side="a" bookTitle={bookA.title} authorName={bookA.author_name} axioms={axiomsA} lastDamagedId={lastDamagedId} model={modelA} />
                  <AxiomPanel side="b" bookTitle={bookB.title} authorName={bookB.author_name} axioms={axiomsB} lastDamagedId={lastDamagedId} model={modelB} />
                </div>
                <BattlefieldGraph axiomsA={axiomsA} axiomsB={axiomsB} latestAttack={latestAttack} collapsible />
              </div>
            </motion.div>
          )}

          {showBettingDrawer && (
            <motion.div
              className="absolute top-24 right-12 z-30 w-[300px]"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            >
              <div
                className="rounded-xl p-3 space-y-3"
                style={{
                  background: 'rgba(10,8,5,0.92)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(180,140,50,0.15)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                }}
              >
                <BettingPanel
                  sessionId={session.id}
                  pool={state.pool || null}
                  bookATitle={bookA.title}
                  bookBTitle={bookB.title}
                  walletBalance={walletBalance}
                  userBet={userBet}
                  onPlaceBet={handlePlaceBet}
                />
              </div>
            </motion.div>
          )}

          {showArgumentLog && (
            <motion.div
              className="absolute top-24 right-12 bottom-28 z-30 w-[400px] overflow-y-auto"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            >
              <div
                className="rounded-xl p-3 h-full overflow-y-auto"
                style={{
                  background: 'rgba(10,8,5,0.92)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(180,140,50,0.15)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                }}
              >
                <ArgumentLog rounds={rounds} args={args} bookATitle={bookA.title} bookBTitle={bookB.title} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Synthesis overlay (post-fight) — hidden during video generation */}
        {isCompleted && videoCheckDone && !winnerBook && (!videoStatus || videoStatus === 'complete') && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4">
            <SynthesisPanel
              sessionId={session.id}
              synthesis={session.synthesis as SynthesisResult | null}
              bookATitle={bookA.title}
              bookBTitle={bookB.title}
              winner={session.winner}
            />
          </div>
        )}

        {/* Cinematic replay button for draw outcomes (no winnerBook) */}
        {isCompleted && videoCheckDone && !winnerBook && (!videoStatus || videoStatus === 'complete') && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
            {videoStatus === 'complete' && videoUrl ? (
              <button
                onClick={() => setShowCinematic(true)}
                className="px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-xs text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-all shadow-lg shadow-amber-500/20"
              >
                <Film className="inline-block w-3.5 h-3.5 mr-1.5 -mt-0.5" />
                Watch Replay
              </button>
            ) : videoStatus === 'generating' ? (
              /* Progress handled by the full-bleed poster wait screen above */
              null
            ) : videoStatus === 'failed' ? (
              <button
                onClick={generateCinematicVideo}
                className="px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-xs text-amber-400 border border-red-500/40 bg-red-950/30 hover:bg-red-950/50 transition-all"
              >
                Retry Replay
              </button>
            ) : (
              <button
                onClick={generateCinematicVideo}
                className="px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-xs text-amber-400 border border-amber-600/30 bg-black/70 backdrop-blur-sm hover:bg-amber-950/50 transition-all"
              >
                <Film className="inline-block w-3.5 h-3.5 mr-1.5 -mt-0.5" />
                Generate Replay
              </button>
            )}
          </div>
        )}
      </div>
      )}
    </>
  )
}
