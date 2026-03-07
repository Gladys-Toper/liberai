'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Pause, Loader2, Flag, Trophy, BarChart3, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AxiomPanel } from './AxiomPanel'
import { BattlefieldGraph } from './BattlefieldGraph'
import { ArgumentLog } from './ArgumentLog'
import { SynthesisPanel, type SynthesisResult } from './SynthesisPanel'
import { BettingPanel } from './BettingPanel'
import { SponsorChyron } from './SponsorChyron'
import { AvatarVideo } from './AvatarVideo'
import { CommentatorBooth } from './CommentatorBooth'
import { useBrowserTTS } from '@/hooks/useBrowserTTS'

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
  streamId?: string
  sessionId: string
  iceServers: RTCIceServer[]
  offer: RTCSessionDescriptionInit
  didVoiceId?: string
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

  // AV sessions
  const [avSessions, setAvSessions] = useState<{
    debaterA?: AVSession
    debaterB?: AVSession
    commentator?: AVSession
  }>({})
  const [avEnabled, setAvEnabled] = useState(false)
  const [avBackend, setAvBackend] = useState<'did' | 'simli' | 'none'>('none')
  const [avProfiles, setAvProfiles] = useState<{
    authorA?: { portraitUrl?: string | null; nationality?: string | null; era?: string | null; didVoiceId?: string | null; accentHint?: string | null }
    authorB?: { portraitUrl?: string | null; nationality?: string | null; era?: string | null; didVoiceId?: string | null; accentHint?: string | null }
  }>({})
  const avCleanupRef = useRef<string[]>([])
  const avApiBase = `/api/arena/${initialState.session.id}/av`

  // Browser TTS — speaks debate text with character-appropriate voices
  // Dynamic profiles from AV author resolution (accent-aware)
  const tts = useBrowserTTS()
  const lastSpokenRound = useRef(0)

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

        // Store author profiles (portraits, nationality, voice IDs) regardless of AV backend
        if (data.profiles) {
          setAvProfiles({
            authorA: data.profiles.authorA,
            authorB: data.profiles.authorB,
          })
        }

        if (data.avEnabled && data.sessions) {
          const backend = data.backend as 'did' | 'simli'
          setAvBackend(backend)
          setAvSessions({
            debaterA: data.sessions.debaterA,
            debaterB: data.sessions.debaterB,
          })
          setAvEnabled(true)

          // Track IDs for cleanup — D-ID uses streamIds, Simli uses sessionIds
          if (backend === 'did') {
            avCleanupRef.current = [
              data.sessions.debaterA?.streamId,
              data.sessions.debaterB?.streamId,
            ].filter(Boolean)
          } else {
            avCleanupRef.current = [
              data.sessions.debaterA?.sessionId,
              data.sessions.debaterB?.sessionId,
            ].filter(Boolean)
          }
        }
      } catch {
        // AV not available — stay in video mode with animated portrait fallbacks
      }
    }

    if (session.status === 'active' || session.status === 'extracting') {
      initAV()
    }

    return () => {
      if (avCleanupRef.current.length > 0) {
        const cleanupBody = avBackend === 'did'
          ? { streamIds: avCleanupRef.current }
          : { sessionIds: avCleanupRef.current }
        fetch(`/api/arena/${session.id}/av`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanupBody),
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

  // ── Auto-narrate new rounds via browser TTS ─────────────────────
  useEffect(() => {
    if (avEnabled) return // Don't use browser TTS when Simli AV is active

    const completedRounds = rounds.filter(r => r.status === 'completed')
    if (completedRounds.length === 0) return

    const latestRound = completedRounds[completedRounds.length - 1]
    if (latestRound.round_number <= lastSpokenRound.current) return

    // Find the attack and defense arguments for this round
    // Each completed round produces 2 args (attack + defense), so the latest round's
    // args are the last 2 in the array for that round number
    const prevArgsCount = (completedRounds.length - 1) * 2
    const roundArgs = args.slice(prevArgsCount, prevArgsCount + 2)

    // Get attack (attacker side) and defense texts
    const attackArg = roundArgs.find(
      a => a.move_type === 'attack' && a.side === latestRound.attacker_side
    )
    const defenseArg = roundArgs.find(
      a => a.move_type === 'defense' && a.side !== latestRound.attacker_side
    )

    if (attackArg && defenseArg) {
      tts.speakRound(
        attackArg.claim,
        latestRound.attacker_side as 'a' | 'b',
        defenseArg.claim,
        latestRound.commentary,
      )
    } else if (latestRound.commentary) {
      // At least speak commentary
      tts.speak(latestRound.commentary, 'commentator')
    }

    lastSpokenRound.current = latestRound.round_number
  }, [rounds, args, avEnabled, tts])

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
          debaterA: avSessions.debaterA ? {
            streamId: avSessions.debaterA.streamId || '',
            sessionId: avSessions.debaterA.sessionId,
            voiceId: avSessions.debaterA.didVoiceId,
          } : null,
          debaterB: avSessions.debaterB ? {
            streamId: avSessions.debaterB.streamId || '',
            sessionId: avSessions.debaterB.sessionId,
            voiceId: avSessions.debaterB.didVoiceId,
          } : null,
          commentator: avSessions.commentator ? {
            streamId: avSessions.commentator.streamId || '',
            sessionId: avSessions.commentator.sessionId,
          } : null,
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
            <AvatarVideo
              streamId={avSessions.debaterA?.streamId}
              sessionId={avSessions.debaterA?.sessionId || null}
              iceServers={avSessions.debaterA?.iceServers}
              offer={avSessions.debaterA?.offer}
              side="a"
              fallbackLabel={bookA.author_name || bookA.title}
              portraitUrl={avProfiles.authorA?.portraitUrl || bookA.portrait_url}
              coverUrl={bookA.cover_url}
              nationality={avProfiles.authorA?.nationality || bookA.nationality}
              isActive={isActive}
              isTTSSpeaking={tts.speaking && tts.activeRole === 'debater_a'}
              avApiBase={avApiBase}
              broadcast
            />

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
            <AvatarVideo
              streamId={avSessions.debaterB?.streamId}
              sessionId={avSessions.debaterB?.sessionId || null}
              iceServers={avSessions.debaterB?.iceServers}
              offer={avSessions.debaterB?.offer}
              side="b"
              fallbackLabel={bookB.author_name || bookB.title}
              portraitUrl={avProfiles.authorB?.portraitUrl || bookB.portrait_url}
              coverUrl={bookB.cover_url}
              nationality={avProfiles.authorB?.nationality || bookB.nationality}
              isActive={isActive}
              isTTSSpeaking={tts.speaking && tts.activeRole === 'debater_b'}
              avApiBase={avApiBase}
              broadcast
            />

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
            LAYER 2: Winner overlay
            ═══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {isCompleted && winnerBook && (
            <motion.div
              className="absolute inset-0 z-40 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ background: 'rgba(0,0,0,0.6)' }}
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════════════════
            LAYER 3: Commentator PiP box (top-left)
            ═══════════════════════════════════════════════════════════════ */}
        <div className="absolute top-28 left-4 z-30 w-48">
          <CommentatorBooth
            streamId={avSessions.commentator?.streamId}
            sessionId={avSessions.commentator?.sessionId}
            iceServers={avSessions.commentator?.iceServers}
            offer={avSessions.commentator?.offer}
            latestCommentary={latestCommentary}
            position="inline"
            compact
            isTTSSpeaking={tts.speaking && tts.activeRole === 'commentator'}
            avApiBase={avApiBase}
          />
        </div>

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

        {/* Synthesis overlay (post-fight) */}
        {isCompleted && !winnerBook && (
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
      </div>
    </>
  )
}
