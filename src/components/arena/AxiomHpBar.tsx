'use client'

import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'

interface AxiomHpBarProps {
  hp: number
  isDestroyed: boolean
  side: 'a' | 'b'
  animate?: boolean
}

export function AxiomHpBar({ hp, isDestroyed, side, animate }: AxiomHpBarProps) {
  const prevHpRef = useRef(hp)
  const [showDamageFlash, setShowDamageFlash] = useState(false)
  const [showShatter, setShowShatter] = useState(false)

  const spring = useSpring(hp, { stiffness: 120, damping: 20 })
  const width = useTransform(spring, (v) => `${Math.max(0, Math.min(100, v))}%`)

  useEffect(() => {
    const prev = prevHpRef.current
    spring.set(hp)

    // Detect damage
    if (hp < prev) {
      setShowDamageFlash(true)
      setTimeout(() => setShowDamageFlash(false), 500)
    }

    // Detect destruction
    if (isDestroyed && !showShatter && prev > 0) {
      setShowShatter(true)
    }

    prevHpRef.current = hp
  }, [hp, isDestroyed, spring, showShatter])

  // Gradient color based on HP %
  const getGradient = () => {
    if (isDestroyed) return '#27272a'
    if (hp > 60) {
      return side === 'a'
        ? 'linear-gradient(90deg, #dc2626, #ef4444)'
        : 'linear-gradient(90deg, #2563eb, #3b82f6)'
    }
    if (hp > 30) return 'linear-gradient(90deg, #d97706, #eab308)'
    return 'linear-gradient(90deg, #991b1b, #dc2626)'
  }

  const glowColor = hp > 60
    ? side === 'a' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'
    : hp > 30 ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.5)'

  return (
    <div className="relative">
      {/* Bar track */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full"
        style={{
          background: '#1a1a1a',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
        }}
      >
        {/* Damage flash */}
        <AnimatePresence>
          {showDamageFlash && (
            <motion.div
              className="absolute inset-0 z-10 rounded-full"
              initial={{ opacity: 0.8 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              style={{ background: 'rgba(255,200,200,0.6)' }}
            />
          )}
        </AnimatePresence>

        {/* HP fill with spring animation */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width,
            background: getGradient(),
            boxShadow: !isDestroyed ? `0 0 8px ${glowColor}` : 'none',
          }}
        />

        {/* Pulse on active damage */}
        {animate && !isDestroyed && (
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{
              background: side === 'a'
                ? 'rgba(239,68,68,0.3)'
                : 'rgba(59,130,246,0.3)',
            }}
          />
        )}
      </div>

      {/* Critical warning pulse */}
      {hp > 0 && hp <= 20 && !isDestroyed && (
        <motion.div
          className="absolute -inset-0.5 rounded-full pointer-events-none"
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          style={{ border: '1px solid rgba(239,68,68,0.5)' }}
        />
      )}

      {/* Shatter effect on destruction */}
      <AnimatePresence>
        {showShatter && (
          <>
            {/* Central burst */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 2.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: side === 'a'
                    ? 'radial-gradient(circle, rgba(239,68,68,0.6), transparent)'
                    : 'radial-gradient(circle, rgba(59,130,246,0.6), transparent)',
                }}
              />
            </motion.div>

            {/* Particle fragments */}
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full pointer-events-none"
                style={{
                  background: side === 'a' ? '#ef4444' : '#3b82f6',
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos((i * Math.PI * 2) / 6) * 30,
                  y: Math.sin((i * Math.PI * 2) / 6) * 15 - 5,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{ duration: 0.5, delay: i * 0.03, ease: 'easeOut' }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
