'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AvatarVideoProps {
  sessionId?: string | null
  iceServers?: RTCIceServer[]
  offer?: RTCSessionDescriptionInit
  side: 'a' | 'b'
  fallbackLabel: string
  coverUrl?: string | null
  isActive?: boolean
}

export function AvatarVideo({
  sessionId,
  iceServers,
  offer,
  side,
  fallbackLabel,
  coverUrl,
  isActive = false,
}: AvatarVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [connectionState, setConnectionState] = useState<string>('new')
  const [isSpeaking, setIsSpeaking] = useState(false)

  const sideColor = side === 'a' ? '#ef4444' : '#3b82f6'
  const sideGlow = side === 'a' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'

  // WebRTC connection setup
  useEffect(() => {
    if (!sessionId || !iceServers || !offer) return

    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState)
    }

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0]

        // Detect audio activity for speaking indicator
        try {
          const audioCtx = new AudioContext()
          const source = audioCtx.createMediaStreamSource(event.streams[0])
          const analyser = audioCtx.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser)
          const dataArray = new Uint8Array(analyser.frequencyBinCount)

          const checkAudio = () => {
            analyser.getByteFrequencyData(dataArray)
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
            setIsSpeaking(avg > 15)
            requestAnimationFrame(checkAudio)
          }
          checkAudio()
        } catch {
          // Audio analysis not critical
        }
      }
    }

    // Set remote description and create answer
    async function connect() {
      try {
        await pc.setRemoteDescription(offer!)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        // Send answer back to Simli (via our API)
        await fetch(`/api/arena/av/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            answer: pc.localDescription,
          }),
        })
      } catch (err) {
        console.error('WebRTC connection failed:', err)
        setConnectionState('failed')
      }
    }

    connect()

    return () => {
      pc.close()
      pcRef.current = null
    }
  }, [sessionId, iceServers, offer])

  const isConnected = connectionState === 'connected'
  const showFallback = !sessionId || connectionState === 'failed' || connectionState === 'new'

  return (
    <div
      className="relative w-full aspect-[3/4] overflow-hidden rounded-lg"
      style={{
        background: '#0a0a0a',
        border: `2px solid ${isSpeaking ? sideColor : '#27272a'}`,
        boxShadow: isSpeaking ? `0 0 24px ${sideGlow}, inset 0 0 12px ${sideGlow}` : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className={`w-full h-full object-cover ${showFallback ? 'hidden' : ''}`}
      />

      {/* Fallback static portrait */}
      {showFallback && (
        <div className="absolute inset-0 flex items-center justify-center">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover opacity-60" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background: side === 'a'
                  ? 'linear-gradient(135deg, #1a0505, #2d0a0a)'
                  : 'linear-gradient(135deg, #050d1a, #0a1a2d)',
              }}
            >
              <span
                className="text-4xl font-black opacity-20"
                style={{ color: sideColor }}
              >
                {fallbackLabel.charAt(0)}
              </span>
            </div>
          )}

          {/* AV disabled indicator */}
          {!sessionId && (
            <div className="absolute bottom-3 left-3 right-3 text-center">
              <span className="text-[10px] text-zinc-600 bg-black/60 px-2 py-1 rounded-sm">
                AV not available
              </span>
            </div>
          )}
        </div>
      )}

      {/* Speaking glow ring */}
      <AnimatePresence>
        {isSpeaking && isConnected && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              boxShadow: `inset 0 0 30px ${sideGlow}`,
              border: `2px solid ${sideColor}40`,
              borderRadius: 'inherit',
            }}
          />
        )}
      </AnimatePresence>

      {/* Connection indicator */}
      {sessionId && (
        <div className="absolute top-2 right-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: isConnected ? '#22c55e' : connectionState === 'connecting' ? '#eab308' : '#ef4444',
              boxShadow: isConnected ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
            }}
          />
        </div>
      )}

      {/* Side label */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-2"
        style={{
          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: sideColor }}>
          {side === 'a' ? 'Side A' : 'Side B'}
        </p>
      </div>
    </div>
  )
}
