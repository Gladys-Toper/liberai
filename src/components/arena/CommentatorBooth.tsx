'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Minimize2, Maximize2, MessageSquare } from 'lucide-react'
import { AvatarVideo } from './AvatarVideo'

interface CommentatorBoothProps {
  sessionId?: string | null
  iceServers?: RTCIceServer[]
  offer?: RTCSessionDescriptionInit
  latestCommentary?: string | null
  /** 'fixed' = legacy floating PiP, 'inline' = embedded in layout */
  position?: 'fixed' | 'inline'
  /** Compact mode for small inline windows */
  compact?: boolean
}

export function CommentatorBooth({
  sessionId,
  iceServers,
  offer,
  latestCommentary,
  position = 'fixed',
  compact = false,
}: CommentatorBoothProps) {
  const [minimized, setMinimized] = useState(false)

  // ── Inline (Oxford Union corner PiP) ──
  if (position === 'inline') {
    return (
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          background: 'rgba(10,10,10,0.95)',
          border: '1px solid rgba(212,160,23,0.3)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6), 0 0 8px rgba(212,160,23,0.08)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Label bar */}
        <div
          className="px-2 py-1 flex items-center gap-1.5"
          style={{
            background: 'linear-gradient(90deg, rgba(212,160,23,0.1), transparent)',
            borderBottom: '1px solid rgba(212,160,23,0.15)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-500/70">
            Commentator
          </span>
        </div>

        {/* Avatar */}
        <div className={compact ? 'p-1' : 'p-1.5'}>
          <AvatarVideo
            sessionId={sessionId || null}
            iceServers={iceServers}
            offer={offer}
            side="a"
            fallbackLabel="Grok"
            isActive
          />
        </div>
      </div>
    )
  }

  // ── Fixed (legacy floating PiP) ──
  return (
    <AnimatePresence>
      <motion.div
        className="fixed z-40"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          bottom: minimized ? 16 : 80,
          right: 16,
          width: minimized ? 48 : 200,
          height: minimized ? 48 : 'auto',
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      >
        <div
          className="relative overflow-hidden rounded-lg"
          style={{
            background: 'rgba(10,10,10,0.95)',
            border: '1px solid rgba(212,160,23,0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(212,160,23,0.1)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Minimize/maximize toggle */}
          <button
            onClick={() => setMinimized(!minimized)}
            className="absolute top-1.5 right-1.5 z-10 p-1 rounded-sm transition-colors hover:bg-white/10"
          >
            {minimized ? (
              <Maximize2 className="w-3 h-3 text-amber-500/60" />
            ) : (
              <Minimize2 className="w-3 h-3 text-amber-500/60" />
            )}
          </button>

          {/* Minimized icon state */}
          {minimized && (
            <div className="w-12 h-12 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-amber-500" />
            </div>
          )}

          {/* Expanded state */}
          {!minimized && (
            <>
              {/* Label */}
              <div
                className="px-3 py-1.5"
                style={{
                  background: 'linear-gradient(90deg, rgba(212,160,23,0.1), transparent)',
                  borderBottom: '1px solid rgba(212,160,23,0.15)',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3 text-amber-500" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500/80">
                    Commentator
                  </span>
                </div>
              </div>

              {/* Avatar video */}
              <div className="p-1.5">
                <AvatarVideo
                  sessionId={sessionId || null}
                  iceServers={iceServers}
                  offer={offer}
                  side="a"
                  fallbackLabel="Grok"
                  isActive
                />
              </div>

              {/* Latest commentary snippet */}
              {latestCommentary && (
                <div className="px-3 py-2 border-t border-amber-500/10">
                  <p className="text-[10px] leading-relaxed text-zinc-400 line-clamp-2">
                    {latestCommentary}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
