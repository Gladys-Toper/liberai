'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Maximize2, Film } from 'lucide-react'
import {
  createTimelineSyncer,
  type TimelineEvent,
} from '@/lib/arena/timeline-sync'
import { RoundIndicator } from './RoundIndicator'
import { SponsorChyron } from './SponsorChyron'
import { BettingPanel } from './BettingPanel'
import type { DebateAxiom } from '@/lib/agents/debate-engine'

// ─── Types ───────────────────────────────────────────────────────

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

interface CinematicPlayerProps {
  videoUrl: string
  timeline: TimelineEvent[]
  axiomsA: DebateAxiom[]
  axiomsB: DebateAxiom[]
  bookATitle: string
  bookBTitle: string
  pool: PoolState | null
  sponsors: Array<{
    chyron_text?: string | null
    sponsor?: {
      id: string
      name: string
      tagline: string
      logo_url?: string | null
      tier: string
    } | null
  }>
  maxRounds: number
  sessionId: string
}

// ─── Component ───────────────────────────────────────────────────

export function CinematicPlayer({
  videoUrl,
  timeline,
  axiomsA: _axiomsA,
  axiomsB: _axiomsB,
  bookATitle,
  bookBTitle,
  pool: initialPool,
  sponsors,
  maxRounds,
  sessionId,
}: CinematicPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // ── Overlay state (driven by timeline sync) ──
  const [hpPercentA, setHpPercentA] = useState(100)
  const [hpPercentB, setHpPercentB] = useState(100)
  const [currentRound, setCurrentRound] = useState(0)
  const [latestCommentary, setLatestCommentary] = useState('')
  const [lastDamagedSide, setLastDamagedSide] = useState<'a' | 'b' | null>(
    null,
  )
  const [shaking, setShaking] = useState(false)
  const [winner, setWinner] = useState<'a' | 'b' | 'draw' | null>(null)
  const [poolStatus, setPoolStatus] = useState(
    initialPool?.status || 'open',
  )

  // ── Video playback state ──
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [showBetting, setShowBetting] = useState(false)
  const controlsTimeout = useRef<NodeJS.Timeout>(null)

  // ── State refs for sync handler (avoids stale closures) ──
  const hpPercentARef = useRef(100)
  const hpPercentBRef = useRef(100)

  // ── Reset function for seek support ──
  const resetOverlayState = useCallback(() => {
    setHpPercentA(100)
    setHpPercentB(100)
    hpPercentARef.current = 100
    hpPercentBRef.current = 100
    setCurrentRound(0)
    setLatestCommentary('')
    setLastDamagedSide(null)
    setShaking(false)
    setWinner(null)
    setPoolStatus(initialPool?.status || 'open')
  }, [initialPool?.status])

  // ── Timeline event handler ──
  const handleTimelineEvent = useCallback(
    (event: TimelineEvent) => {
      switch (event.type) {
        case 'round_start':
          setCurrentRound(event.round)
          break

        case 'hp_update': {
          const deltaA = hpPercentARef.current - event.hpPercentA
          const deltaB = hpPercentBRef.current - event.hpPercentB
          if (deltaA > 5 || deltaB > 5) {
            setShaking(true)
            setTimeout(() => setShaking(false), 500)
          }
          setHpPercentA(event.hpPercentA)
          setHpPercentB(event.hpPercentB)
          hpPercentARef.current = event.hpPercentA
          hpPercentBRef.current = event.hpPercentB
          break
        }

        case 'attack':
          setLastDamagedSide(event.side)
          setTimeout(() => setLastDamagedSide(null), 2000)
          break

        case 'commentary':
          setLatestCommentary(event.text)
          break

        case 'pool_lock':
          setPoolStatus('locked')
          break

        case 'verdict':
          setWinner(event.winner)
          break

        case 'pool_settle':
          setPoolStatus('settled')
          break
      }
    },
    [],
  )

  // ── Create syncer ──
  const syncer = useMemo(
    () => createTimelineSyncer(timeline, handleTimelineEvent, resetOverlayState),
    [timeline, handleTimelineEvent, resetOverlayState],
  )

  // ── Wire video events to syncer ──
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => {
      syncer.tick(video.currentTime)
      setCurrentTime(video.currentTime)
    }
    const onSeeked = () => syncer.seek(video.currentTime)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onDurationChange = () => setDuration(video.duration)

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('durationchange', onDurationChange)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('durationchange', onDurationChange)
    }
  }, [syncer])

  // ── Controls auto-hide ──
  const showControlsBriefly = () => {
    setShowControls(true)
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current)
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = parseFloat(e.target.value)
  }

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement?.parentElement
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <motion.div
      className="relative w-full h-full bg-black overflow-hidden"
      animate={shaking ? { x: [0, -4, 4, -3, 3, 0] } : {}}
      transition={shaking ? { duration: 0.4 } : {}}
      onMouseMove={showControlsBriefly}
    >
      {/* ── Video ── */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline
        onClick={togglePlay}
      />

      {/* ── Top HUD: HP Bars + Round ── */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
          }}
        >
          {/* Side A HP */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 truncate max-w-[140px]">
                {bookATitle}
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                {hpPercentA}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    hpPercentA > 50
                      ? 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
                      : hpPercentA > 25
                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(90deg, #ef4444, #f87171)',
                }}
                animate={{ width: `${hpPercentA}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            {lastDamagedSide === 'a' && (
              <motion.div
                className="text-[9px] text-red-400 mt-0.5"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                HIT!
              </motion.div>
            )}
          </div>

          {/* Round Counter */}
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Round {currentRound}/{maxRounds}
            </span>
            <RoundIndicator
              currentRound={currentRound}
              maxRounds={maxRounds}
              status="active"
            />
          </div>

          {/* Side B HP */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-zinc-400">
                {hpPercentB}%
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 truncate max-w-[140px] text-right">
                {bookBTitle}
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full ml-auto"
                style={{
                  background:
                    hpPercentB > 50
                      ? 'linear-gradient(270deg, #8b5cf6, #a78bfa)'
                      : hpPercentB > 25
                        ? 'linear-gradient(270deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(270deg, #ef4444, #f87171)',
                }}
                animate={{ width: `${hpPercentB}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            {lastDamagedSide === 'b' && (
              <motion.div
                className="text-[9px] text-red-400 mt-0.5 text-right"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                HIT!
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* ── Winner Overlay ── */}
      <AnimatePresence>
        {winner && (
          <motion.div
            className="absolute inset-0 z-40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <div className="text-6xl font-black uppercase tracking-widest text-white mb-2">
                {winner === 'draw'
                  ? 'DRAW'
                  : winner === 'a'
                    ? bookATitle
                    : bookBTitle}
              </div>
              <div className="text-2xl font-bold uppercase tracking-[0.3em] text-amber-500">
                {winner === 'draw' ? 'No Victor' : 'WINS'}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Commentary Chyron ── */}
      <AnimatePresence>
        {latestCommentary && !winner && (
          <motion.div
            className="absolute bottom-24 left-4 right-4 z-30"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            key={latestCommentary}
          >
            <div
              className="rounded-lg px-4 py-3 max-w-2xl mx-auto"
              style={{
                background: 'rgba(10,10,10,0.9)',
                border: '1px solid rgba(212,160,23,0.2)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-500/70">
                  Commentary
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300 italic">
                &ldquo;{latestCommentary}&rdquo;
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sponsor Ticker ── */}
      <div className="absolute bottom-16 left-0 right-0 z-20">
        <SponsorChyron
          sponsors={sponsors}
          modelAttribution={{ referee: 'Gemini', commentator: 'Grok' }}
        />
      </div>

      {/* ── Betting Panel Toggle ── */}
      <button
        onClick={() => setShowBetting(!showBetting)}
        className="absolute top-20 right-3 z-30 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors pointer-events-auto"
        style={{
          background: 'rgba(10,10,10,0.8)',
          border: '1px solid rgba(139,92,246,0.3)',
          color: '#a78bfa',
        }}
      >
        {showBetting ? 'Close' : 'Bets'}
      </button>

      {/* ── Betting Panel Drawer ── */}
      <AnimatePresence>
        {showBetting && initialPool && (
          <motion.div
            className="absolute top-28 right-3 z-30 w-72"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <BettingPanel
              sessionId={sessionId}
              pool={{
                ...initialPool,
                status: poolStatus,
              }}
              bookATitle={bookATitle}
              bookBTitle={bookBTitle}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Video Controls ── */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 z-30 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background:
                'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
            }}
          >
            {/* Progress bar */}
            <div className="px-4 mb-1">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 appearance-none bg-zinc-700 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500"
              />
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-white" />
                  ) : (
                    <Play className="w-5 h-5 text-white" />
                  )}
                </button>
                <span className="text-xs font-mono text-zinc-400">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5">
                  <Film className="w-3 h-3 text-amber-500" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500/70">
                    Cinematic Replay
                  </span>
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                >
                  <Maximize2 className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
