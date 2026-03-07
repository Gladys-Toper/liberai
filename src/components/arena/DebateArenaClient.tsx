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
          setViewMode('video')

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
        {/* ═══════════════════════════════════════════════════════════════
            OXFORD UNION DEBATING CHAMBER BACKGROUND
            Faithful to the Alfred Waterhouse 1878 chamber:
            - Open timber roof with Morris grotesque patterns
            - Dark oak paneling in vertical staves
            - Gallery bookshelves belt
            - Six-foil rose windows (Pre-Raphaelite stained glass)
            - Gas-lamp warm candlelight from brass sconces
            ═══════════════════════════════════════════════════════════════ */}
        <div className="fixed inset-0 pointer-events-none z-0">

          {/* Layer 1: Deep mahogany base */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 100% 60% at 50% 15%, #1f150b 0%, #150e07 30%, #0c0804 60%, #060402 100%)
              `,
            }}
          />

          {/* Layer 2: Vertical oak panel staves — the primary wood texture */}
          <div
            className="absolute inset-0"
            style={{
              opacity: 0.12,
              backgroundImage: `
                repeating-linear-gradient(
                  90deg,
                  transparent 0px,
                  transparent 58px,
                  rgba(139,90,43,0.5) 58px,
                  rgba(101,67,33,0.3) 59px,
                  rgba(139,90,43,0.6) 60px,
                  rgba(101,67,33,0.2) 61px,
                  transparent 62px
                )
              `,
            }}
          />

          {/* Layer 3: Horizontal wood grain / wainscoting rails */}
          <div
            className="absolute inset-0"
            style={{
              opacity: 0.06,
              backgroundImage: `
                repeating-linear-gradient(
                  0deg,
                  transparent 0px,
                  transparent 100px,
                  rgba(139,90,43,0.4) 100px,
                  rgba(139,90,43,0.4) 101px,
                  transparent 102px,
                  transparent 200px,
                  rgba(101,67,33,0.3) 200px,
                  rgba(101,67,33,0.3) 201px,
                  transparent 202px
                )
              `,
            }}
          />

          {/* Layer 4: Gallery bookshelf belt — darker band at ~55% height */}
          <div
            className="absolute left-0 right-0"
            style={{
              top: '50%',
              height: '120px',
              background: `linear-gradient(
                180deg,
                transparent 0%,
                rgba(40,25,10,0.5) 15%,
                rgba(30,18,8,0.7) 30%,
                rgba(30,18,8,0.7) 70%,
                rgba(40,25,10,0.5) 85%,
                transparent 100%
              )`,
            }}
          />
          {/* Bookshelf horizontal rails */}
          <div
            className="absolute left-[5%] right-[5%]"
            style={{
              top: 'calc(50% + 10px)',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(180,140,50,0.25), rgba(180,140,50,0.35), rgba(180,140,50,0.25), transparent)',
            }}
          />
          <div
            className="absolute left-[5%] right-[5%]"
            style={{
              top: 'calc(50% + 90px)',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(180,140,50,0.2), rgba(180,140,50,0.3), rgba(180,140,50,0.2), transparent)',
            }}
          />

          {/* Layer 5: Open timber roof — diagonal beams at top */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: '25%',
              opacity: 0.08,
              backgroundImage: `
                repeating-linear-gradient(
                  30deg,
                  transparent 0px,
                  transparent 40px,
                  rgba(101,67,33,0.6) 40px,
                  rgba(139,90,43,0.4) 43px,
                  transparent 44px
                ),
                repeating-linear-gradient(
                  -30deg,
                  transparent 0px,
                  transparent 40px,
                  rgba(101,67,33,0.6) 40px,
                  rgba(139,90,43,0.4) 43px,
                  transparent 44px
                )
              `,
              animation: 'roofTimberShimmer 12s ease-in-out infinite',
            }}
          />

          {/* Layer 6: Morris-style ceiling pattern (subtle foliage repeat) */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: '20%',
              opacity: 0.04,
              backgroundImage: `
                radial-gradient(circle 15px at 30px 30px, rgba(139,90,43,0.5) 0%, transparent 60%),
                radial-gradient(circle 10px at 60px 15px, rgba(101,67,33,0.4) 0%, transparent 50%),
                radial-gradient(circle 12px at 10px 50px, rgba(139,90,43,0.3) 0%, transparent 55%)
              `,
              backgroundSize: '80px 60px',
              animation: 'morrisPattern 120s linear infinite',
            }}
          />

          {/* Layer 7: Six-foil rose windows — two large circular windows */}
          <div className="absolute" style={{ top: '8%', left: '8%', width: '80px', height: '80px', opacity: 0.07 }}>
            <div
              className="w-full h-full rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(180,60,60,0.4) 0%, rgba(60,120,60,0.3) 40%, rgba(40,80,160,0.2) 70%, transparent 100%)',
                boxShadow: 'inset 0 0 20px rgba(212,175,55,0.3)',
                border: '2px solid rgba(180,140,50,0.3)',
              }}
            />
          </div>
          <div className="absolute" style={{ top: '8%', right: '8%', width: '80px', height: '80px', opacity: 0.07 }}>
            <div
              className="w-full h-full rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(60,60,180,0.4) 0%, rgba(60,120,60,0.3) 40%, rgba(160,60,40,0.2) 70%, transparent 100%)',
                boxShadow: 'inset 0 0 20px rgba(212,175,55,0.3)',
                border: '2px solid rgba(180,140,50,0.3)',
              }}
            />
          </div>

          {/* Layer 8: Brass gas-lamp sconces — warm pools of light */}
          {[15, 35, 55, 75, 95].map((left) => (
            <div
              key={left}
              className="absolute"
              style={{
                top: '30%',
                left: `${left}%`,
                width: '60px',
                height: '120px',
                transform: 'translateX(-50%)',
                background: `radial-gradient(ellipse 50% 60% at 50% 20%, rgba(212,175,55,0.08) 0%, rgba(180,140,50,0.03) 40%, transparent 100%)`,
                animation: 'candleFlicker 4s ease-in-out infinite',
                animationDelay: `${left * 0.07}s`,
              }}
            />
          ))}

          {/* Layer 9: Two larger chandelier pools from ceiling */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2"
            style={{
              width: '50%',
              height: '35%',
              background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,175,55,0.06) 0%, rgba(180,140,50,0.02) 50%, transparent 100%)',
              animation: 'gasLampGlow 6s ease-in-out infinite',
            }}
          />
          <div
            className="absolute"
            style={{
              top: '5%',
              left: '20%',
              width: '25%',
              height: '25%',
              background: 'radial-gradient(ellipse at 50% 30%, rgba(212,175,55,0.04) 0%, transparent 70%)',
              animation: 'candleFlicker 5s ease-in-out infinite',
              animationDelay: '1s',
            }}
          />
          <div
            className="absolute"
            style={{
              top: '5%',
              right: '20%',
              width: '25%',
              height: '25%',
              background: 'radial-gradient(ellipse at 50% 30%, rgba(212,175,55,0.04) 0%, transparent 70%)',
              animation: 'candleFlicker 5s ease-in-out infinite',
              animationDelay: '2.5s',
            }}
          />

          {/* Layer 10: Warm Pre-Raphaelite color wash — deep reds and greens */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(135deg,
                  rgba(120,30,20,0.03) 0%,
                  transparent 25%,
                  rgba(20,60,30,0.02) 50%,
                  transparent 75%,
                  rgba(30,20,80,0.02) 100%
                )
              `,
            }}
          />

          {/* Layer 11: Heavy corner vignette — dramatic theatrical lighting */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 70% 65% at 50% 45%, transparent 40%, rgba(5,3,1,0.4) 70%, rgba(3,2,1,0.7) 100%)
              `,
            }}
          />

          {/* Layer 12: Bottom floor shadow — as if looking down from the gallery */}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: '15%',
              background: 'linear-gradient(transparent, rgba(5,3,1,0.5))',
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
            {/* ── [Row1, Col1] Commentator PiP ───────────────────── */}
            <div className="row-span-1">
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
