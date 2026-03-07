'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AvatarVideoProps {
  /** D-ID stream ID for WebRTC connection */
  streamId?: string | null
  /** D-ID session ID for API calls */
  sessionId?: string | null
  /** ICE servers for WebRTC */
  iceServers?: RTCIceServer[]
  /** SDP offer from D-ID/Simli */
  offer?: RTCSessionDescriptionInit
  /** Debate side */
  side: 'a' | 'b'
  /** Author name for display */
  fallbackLabel: string
  /** Author portrait URL (Wikipedia) for D-ID source or fallback display */
  portraitUrl?: string | null
  /** Book cover URL as secondary fallback */
  coverUrl?: string | null
  /** Whether this avatar is currently "active" (their turn) */
  isActive?: boolean
  /** Browser TTS is currently speaking this character */
  isTTSSpeaking?: boolean
  /** Author nationality for accent display */
  nationality?: string | null
  /** D-ID API base URL for SDP/ICE relay */
  avApiBase?: string
  /** Broadcast mode — full-bleed, no frame, fills parent container */
  broadcast?: boolean
}

/**
 * AI Video Avatar for the Oxford Union Debate Arena.
 *
 * Three tiers:
 *   1. D-ID WebRTC video — real AI-generated talking head from portrait
 *   2. Animated portrait — CSS 3D transforms, breathing, head sway
 *   3. Static fallback — book cover or initial letter
 *
 * The avatar sits within a Gothic ornamental frame that matches
 * the Oxford Union debating chamber aesthetic.
 */
export function AvatarVideo({
  streamId,
  sessionId,
  iceServers,
  offer,
  side,
  fallbackLabel,
  portraitUrl,
  coverUrl,
  isActive = false,
  isTTSSpeaking = false,
  nationality,
  avApiBase,
  broadcast = false,
}: AvatarVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [connectionState, setConnectionState] = useState<string>('new')
  const [isVideoSpeaking, setIsVideoSpeaking] = useState(false)

  const speaking = isVideoSpeaking || isTTSSpeaking
  const sideColor = side === 'a' ? '#c93535' : '#2d6bc4'
  const sideGlow = side === 'a' ? 'rgba(201,53,53,0.4)' : 'rgba(45,107,196,0.4)'
  const frameGold = 'rgba(180,140,50,0.6)'
  const frameGoldBright = 'rgba(212,175,55,0.9)'

  // Display image: prefer portrait (Wikipedia historical photo), fall back to book cover
  const displayImage = portraitUrl || coverUrl

  // ── D-ID WebRTC Connection ──────────────────────────────────────────
  const setupWebRTC = useCallback(async () => {
    if (!streamId || !sessionId || !iceServers || !offer) return

    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState)
    }

    // Handle incoming video + audio tracks from D-ID
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (!stream) return

      if (event.track.kind === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream
      }
      if (event.track.kind === 'audio' && audioRef.current) {
        audioRef.current.srcObject = stream
      }

      // Detect speech from audio stream
      try {
        const audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const checkAudio = () => {
          if (pc.connectionState !== 'connected') return
          analyser.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setIsVideoSpeaking(avg > 15)
          requestAnimationFrame(checkAudio)
        }
        checkAudio()
      } catch { /* Audio analysis not critical */ }
    }

    // Send ICE candidates to D-ID
    pc.onicecandidate = async (event) => {
      if (event.candidate && avApiBase) {
        try {
          await fetch(`${avApiBase}/ice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              streamId,
              sessionId,
              candidate: event.candidate.toJSON(),
            }),
          })
        } catch { /* ICE candidate delivery is best-effort */ }
      }
    }

    try {
      await pc.setRemoteDescription(offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // Send SDP answer to D-ID via our API relay
      if (avApiBase) {
        await fetch(`${avApiBase}/sdp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            streamId,
            sessionId,
            answer: { type: answer.type, sdp: answer.sdp },
          }),
        })
      }
    } catch (err) {
      console.error('WebRTC connection failed:', err)
      setConnectionState('failed')
    }
  }, [streamId, sessionId, iceServers, offer, avApiBase])

  useEffect(() => {
    setupWebRTC()
    return () => {
      pcRef.current?.close()
      pcRef.current = null
    }
  }, [setupWebRTC])

  // ── Animated portrait effects (Tier 2 fallback) ─────────────────────
  // Audio waveform visualization for speaking state
  useEffect(() => {
    if (!speaking || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const bars = 24
    const phases = Array.from({ length: bars }, () => Math.random() * Math.PI * 2)

    function draw(time: number) {
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const barWidth = canvas.width / bars
      for (let i = 0; i < bars; i++) {
        const amplitude = 0.3 + 0.7 * Math.abs(Math.sin(time * 0.003 + phases[i]))
        const height = amplitude * canvas.height * 0.8
        const y = (canvas.height - height) / 2
        const gradient = ctx.createLinearGradient(0, y, 0, y + height)
        gradient.addColorStop(0, side === 'a' ? 'rgba(201,53,53,0.1)' : 'rgba(45,107,196,0.1)')
        gradient.addColorStop(0.5, side === 'a' ? 'rgba(201,53,53,0.7)' : 'rgba(45,107,196,0.7)')
        gradient.addColorStop(1, side === 'a' ? 'rgba(201,53,53,0.1)' : 'rgba(45,107,196,0.1)')
        ctx.fillStyle = gradient
        ctx.fillRect(i * barWidth + 1, y, barWidth - 2, height)
      }
      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [speaking, side])

  const isConnected = connectionState === 'connected'
  const showVideo = streamId && isConnected

  // ── BROADCAST MODE: full-bleed, no frame, fills parent ─────────────
  if (broadcast) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        {/* D-ID WebRTC video (full-bleed) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${showVideo ? '' : 'hidden'}`}
          style={{ filter: 'contrast(1.05) saturate(1.1) sepia(0.03)' }}
        />
        <audio ref={audioRef} autoPlay />

        {/* Portrait / Cover fallback (full-bleed) */}
        {!showVideo && (
          <div className="absolute inset-0">
            {displayImage ? (
              <>
                <motion.img
                  src={displayImage}
                  alt={fallbackLabel}
                  className="w-full h-full object-cover"
                  animate={speaking ? {
                    scale: [1, 1.008, 1.003, 1.006, 1],
                    rotateY: [0, 0.3, -0.2, 0.15, 0],
                  } : isActive ? {
                    scale: [1, 1.004, 1],
                  } : {}}
                  transition={speaking ? {
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  } : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    filter: speaking
                      ? 'brightness(1.1) saturate(1.15) contrast(1.05)'
                      : isActive
                        ? 'brightness(0.75) saturate(0.85) sepia(0.08)'
                        : 'brightness(0.55) saturate(0.65) sepia(0.15)',
                    transition: 'filter 0.6s ease',
                  }}
                />
                {/* Dramatic cinematic vignette */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `
                      radial-gradient(ellipse 90% 80% at 50% 30%, transparent 20%, rgba(0,0,0,0.5) 100%),
                      linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 25%, transparent 60%, rgba(0,0,0,0.6) 100%)
                    `,
                  }}
                />
                {/* Side-colored glow when speaking */}
                <AnimatePresence>
                  {speaking && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.1, 0.25, 0.1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        background: side === 'a'
                          ? 'radial-gradient(ellipse at 50% 50%, rgba(201,53,53,0.3), transparent 70%)'
                          : 'radial-gradient(ellipse at 50% 50%, rgba(45,107,196,0.3), transparent 70%)',
                      }}
                    />
                  )}
                </AnimatePresence>
              </>
            ) : (
              /* No image: large initial letter */
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: side === 'a'
                    ? 'radial-gradient(ellipse at 50% 40%, #2d1212, #1a0808, #0a0404)'
                    : 'radial-gradient(ellipse at 50% 40%, #0d1a2d, #081018, #040810)',
                }}
              >
                <span
                  className="font-serif font-bold"
                  style={{
                    fontSize: 'min(200px, 25vw)',
                    color: sideColor,
                    opacity: 0.12,
                    textShadow: `0 0 80px ${sideGlow}`,
                  }}
                >
                  {fallbackLabel.charAt(0)}
                </span>
              </div>
            )}

            {/* Audio waveform when speaking */}
            <AnimatePresence>
              {speaking && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.8 }}
                  exit={{ opacity: 0 }}
                >
                  <canvas ref={canvasRef} width={200} height={60} className="w-full h-full" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* LIVE badge */}
        {showVideo && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1 rounded"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">LIVE</span>
          </div>
        )}

        {/* Nationality badge */}
        {nationality && (
          <div className="absolute top-4 right-4 z-20 px-2 py-1 rounded"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          >
            <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-amber-400/70">
              {nationality}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── FRAME MODE (default): Gothic ornamental frame ──────────────────
  return (
    <div className="relative w-full">
      {/* ── Gothic ornamental frame ─── */}
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: '8px 8px 4px 4px',
          clipPath: 'polygon(0% 8%, 5% 3%, 15% 0.5%, 50% 0%, 85% 0.5%, 95% 3%, 100% 8%, 100% 100%, 0% 100%)',
        }}
      >
        {/* Ornate gold border frame */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            border: speaking ? `3px solid ${frameGoldBright}` : `2px solid ${frameGold}`,
            borderRadius: 'inherit',
            boxShadow: speaking
              ? `0 0 20px ${sideGlow}, 0 0 40px ${sideGlow}, inset 0 0 15px rgba(180,140,50,0.15)`
              : `inset 0 0 20px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)`,
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}
        />

        {/* Inner decorative border */}
        <div
          className="absolute inset-[4px] z-10 pointer-events-none"
          style={{
            border: `1px solid rgba(180,140,50,0.2)`,
            borderRadius: '6px',
          }}
        />

        {/* Main content area */}
        <div className="relative aspect-[3/4]" style={{ background: '#0a0805' }}>

          {/* ── Tier 1: D-ID WebRTC AI Video ─── */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${showVideo ? '' : 'hidden'}`}
            style={{
              // Subtle warm grading to match Oxford Union candlelight
              filter: 'contrast(1.05) saturate(1.1) sepia(0.05)',
            }}
          />
          {/* Separate audio element for D-ID voice output */}
          <audio ref={audioRef} autoPlay />

          {/* ── Tier 2/3: Portrait fallback (animated or static) ─── */}
          {!showVideo && (
            <div className="absolute inset-0">
              {displayImage ? (
                <>
                  {/* Historical portrait / book cover as avatar */}
                  <motion.div
                    className="w-full h-full"
                    animate={speaking ? {
                      // Subtle head movement when speaking
                      rotateY: [0, 0.5, -0.3, 0.2, 0],
                      rotateX: [0, -0.3, 0.2, -0.1, 0],
                      scale: [1, 1.005, 1.002, 1.004, 1],
                    } : isActive ? {
                      // Gentle breathing when active but not speaking
                      scale: [1, 1.003, 1],
                    } : {}}
                    transition={speaking ? {
                      duration: 2.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    } : {
                      duration: 4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    style={{ perspective: '800px', transformStyle: 'preserve-3d' }}
                  >
                    <img
                      src={displayImage}
                      alt={fallbackLabel}
                      className="w-full h-full object-cover"
                      style={{
                        filter: speaking
                          ? 'brightness(1.15) saturate(1.2) contrast(1.05)'
                          : isActive
                            ? 'brightness(0.85) saturate(0.9) sepia(0.1)'
                            : 'brightness(0.65) saturate(0.7) sepia(0.2)',
                        transition: 'filter 0.5s ease',
                      }}
                    />
                  </motion.div>

                  {/* Dramatic vignette */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'radial-gradient(ellipse 80% 70% at 50% 35%, transparent 30%, rgba(0,0,0,0.6) 100%)',
                    }}
                  />

                  {/* Candlelight wash from above */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(180deg, rgba(180,140,50,0.08) 0%, transparent 40%, rgba(0,0,0,0.3) 100%)',
                    }}
                  />

                  {/* Speaking glow overlay */}
                  <AnimatePresence>
                    {speaking && (
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.15, 0.35, 0.15] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          background: `radial-gradient(ellipse at 50% 40%, ${sideGlow}, transparent 70%)`,
                        }}
                      />
                    )}
                  </AnimatePresence>
                </>
              ) : (
                /* No image: richly styled initial */
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    background: side === 'a'
                      ? 'radial-gradient(ellipse at 50% 40%, #2d1212, #1a0808, #0d0404)'
                      : 'radial-gradient(ellipse at 50% 40%, #0d1a2d, #081018, #040810)',
                  }}
                >
                  <span
                    className="text-6xl font-serif font-bold"
                    style={{
                      color: sideColor,
                      opacity: 0.15,
                      textShadow: `0 0 40px ${sideGlow}`,
                    }}
                  >
                    {fallbackLabel.charAt(0)}
                  </span>
                </div>
              )}

              {/* Audio waveform overlay when speaking */}
              <AnimatePresence>
                {speaking && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <canvas
                      ref={canvasRef}
                      width={200}
                      height={60}
                      className="w-full h-full"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Speaking pulse ring */}
              <AnimatePresence>
                {speaking && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      boxShadow: `inset 0 0 40px ${sideGlow}, inset 0 0 80px rgba(180,140,50,0.1)`,
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── "LIVE" / "AI VIDEO" badge when D-ID is active ─── */}
          {showVideo && (
            <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-sm"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-[0.15em] text-red-400">
                LIVE
              </span>
            </div>
          )}

          {/* ── Nationality accent badge ─── */}
          {nationality && !showVideo && (
            <div className="absolute top-2 right-2 z-20 px-1.5 py-0.5 rounded-sm"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            >
              <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-amber-500/60">
                {nationality}
              </span>
            </div>
          )}
        </div>

        {/* ── Bottom nameplate (Gothic brass style) ─── */}
        <div
          className="relative px-3 py-1.5"
          style={{
            background: 'linear-gradient(180deg, rgba(10,8,5,0.95), rgba(15,12,6,0.98))',
            borderTop: '1px solid rgba(180,140,50,0.3)',
          }}
        >
          <div
            className="absolute top-0 left-[10%] right-[10%] h-[1px]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(180,140,50,0.4), transparent)',
            }}
          />
          <p
            className="text-[9px] font-black uppercase text-center"
            style={{
              letterSpacing: '0.2em',
              color: speaking ? frameGoldBright : 'rgba(180,140,50,0.5)',
              textShadow: speaking ? `0 0 8px ${sideGlow}` : 'none',
              transition: 'color 0.3s, text-shadow 0.3s',
            }}
          >
            {side === 'a' ? 'Proposition' : 'Opposition'}
          </p>
        </div>
      </div>
    </div>
  )
}
