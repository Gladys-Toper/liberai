'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  ChevronUp, ChevronDown, X, Gauge,
  Minus, Plus, RotateCcw, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpeedReaderProps {
  text: string
  chapterTitle?: string
  onClose: () => void
}

/**
 * Calculate the Optimal Recognition Point (ORP) for a word.
 * ORP is roughly the character where the eye naturally fixates.
 * For short words it's the first char; for longer words it shifts right.
 */
function getORP(word: string): number {
  const len = word.length
  if (len <= 1) return 0
  if (len <= 3) return 1
  if (len <= 5) return 1
  if (len <= 9) return 2
  if (len <= 13) return 3
  return 4
}

/**
 * Calculate dynamic delay for a word (longer words + punctuation = more time)
 */
function getWordDelay(word: string, baseDelay: number): number {
  let multiplier = 1.0
  // Long words get more time
  if (word.length > 8) multiplier += 0.15
  if (word.length > 12) multiplier += 0.15
  // Punctuation pauses
  if (/[.!?]$/.test(word)) multiplier += 0.6
  if (/[,;:]$/.test(word)) multiplier += 0.3
  if (/[—–]/.test(word)) multiplier += 0.2
  return baseDelay * multiplier
}

export function SpeedReader({ text, chapterTitle, onClose }: SpeedReaderProps) {
  // ── State ──────────────────────────────────────────────
  const [wpm, setWpm] = useState(300)
  const [isPlaying, setIsPlaying] = useState(false)
  const [wordIndex, setWordIndex] = useState(0)
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg')
  const [rampMode, setRampMode] = useState(false)
  const [rampWpm, setRampWpm] = useState(200)

  // ── Refs ───────────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wpmRef = useRef(wpm)
  const rampTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rampWpmRef = useRef(rampWpm)
  const wordIndexRef = useRef(wordIndex)

  // Keep refs in sync
  useEffect(() => { wpmRef.current = wpm }, [wpm])
  useEffect(() => { rampWpmRef.current = rampWpm }, [rampWpm])
  useEffect(() => { wordIndexRef.current = wordIndex }, [wordIndex])

  // ── Parse Words ────────────────────────────────────────
  const words = useMemo(() => {
    return text
      .replace(/\n+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0)
  }, [text])

  const totalWords = words.length
  const currentWord = words[wordIndex] || ''
  const progress = totalWords > 0 ? (wordIndex / (totalWords - 1)) * 100 : 0
  const effectiveWpm = rampMode ? rampWpm : wpm

  // Time remaining calculation
  const wordsRemaining = totalWords - wordIndex
  const minutesRemaining = wordsRemaining / effectiveWpm
  const timeRemaining = useMemo(() => {
    const mins = Math.floor(minutesRemaining)
    const secs = Math.round((minutesRemaining - mins) * 60)
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }, [minutesRemaining])

  // ── ORP Split ──────────────────────────────────────────
  const orpIndex = getORP(currentWord)
  const before = currentWord.slice(0, orpIndex)
  const focal = currentWord[orpIndex] || ''
  const after = currentWord.slice(orpIndex + 1)

  // ── Font Size Map ──────────────────────────────────────
  const fontSizeClass: Record<typeof fontSize, string> = {
    sm: 'text-3xl',
    md: 'text-4xl',
    lg: 'text-5xl',
    xl: 'text-6xl',
  }

  // ── Playback Engine ────────────────────────────────────
  const scheduleNext = useCallback(() => {
    const currentWpm = rampMode ? rampWpmRef.current : wpmRef.current
    const baseDelay = 60000 / currentWpm
    const idx = wordIndexRef.current
    const word = words[idx] || ''
    const delay = getWordDelay(word, baseDelay)

    timerRef.current = setTimeout(() => {
      setWordIndex((prev) => {
        const next = prev + 1
        if (next >= words.length) {
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, delay)
  }, [words, rampMode])

  // Start/stop playback
  useEffect(() => {
    if (isPlaying) {
      scheduleNext()
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isPlaying, wordIndex, scheduleNext])

  // ── RAMP Mode ──────────────────────────────────────────
  useEffect(() => {
    if (rampMode && isPlaying) {
      setRampWpm(200)
      rampWpmRef.current = 200
      rampTimerRef.current = setInterval(() => {
        setRampWpm((prev) => {
          const next = Math.min(prev + 25, wpm)
          rampWpmRef.current = next
          if (next >= wpm) {
            if (rampTimerRef.current) clearInterval(rampTimerRef.current)
          }
          return next
        })
      }, 30000) // Increase every 30 seconds
    }

    return () => {
      if (rampTimerRef.current) {
        clearInterval(rampTimerRef.current)
        rampTimerRef.current = null
      }
    }
  }, [rampMode, isPlaying, wpm])

  // ── Keyboard Shortcuts ─────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture if user is typing in an input, textarea, or contenteditable
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          setIsPlaying((p) => !p)
          break
        case 'ArrowLeft':
          e.preventDefault()
          setIsPlaying(false)
          setWordIndex((prev) => Math.max(0, prev - 1))
          break
        case 'ArrowRight':
          e.preventDefault()
          setIsPlaying(false)
          setWordIndex((prev) => Math.min(words.length - 1, prev + 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setWpm((prev) => Math.min(800, prev + 25))
          break
        case 'ArrowDown':
          e.preventDefault()
          setWpm((prev) => Math.max(100, prev - 25))
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'KeyR':
          e.preventDefault()
          setIsPlaying(false)
          setWordIndex(0)
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [words.length, onClose])

  // ── Controls ───────────────────────────────────────────
  const togglePlay = () => setIsPlaying((p) => !p)
  const skipBack = () => {
    setWordIndex((prev) => Math.max(0, prev - 10))
  }
  const skipForward = () => {
    setWordIndex((prev) => Math.min(words.length - 1, prev + 10))
  }
  const restart = () => {
    setIsPlaying(false)
    setWordIndex(0)
  }
  const adjustWpm = (delta: number) => {
    setWpm((prev) => Math.max(100, Math.min(800, prev + delta)))
  }
  const cycleFontSize = () => {
    const sizes: Array<typeof fontSize> = ['sm', 'md', 'lg', 'xl']
    const idx = sizes.indexOf(fontSize)
    setFontSize(sizes[(idx + 1) % sizes.length])
  }

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#0a0a0a]">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#1a1a1a] px-4">
        <div className="flex items-center gap-3">
          <Zap className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-zinc-300">Speed Reader</span>
          {chapterTitle && (
            <>
              <span className="text-zinc-600">/</span>
              <span className="text-xs text-zinc-500 truncate max-w-[180px]">{chapterTitle}</span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-300"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Word Display ────────────────────────────────── */}
      <div
        className="flex flex-1 flex-col items-center justify-center cursor-pointer select-none"
        onClick={togglePlay}
      >
        {/* ORP alignment guide — the focal letter stays in the center */}
        <div className="relative flex items-center justify-center">
          {/* Center marker */}
          <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-2 bg-violet-500/30 rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-px w-0.5 h-2 bg-violet-500/30 rounded-full" />

          {/* The word, split into 3 parts around ORP */}
          <div className={cn('flex items-baseline font-mono tracking-tight', fontSizeClass[fontSize])}>
            <span className="text-zinc-500 text-right" style={{ minWidth: '3ch' }}>
              {before}
            </span>
            <span className="text-violet-400 font-bold">
              {focal}
            </span>
            <span className="text-zinc-300">
              {after}
            </span>
          </div>
        </div>

        {/* Tap hint */}
        {!isPlaying && wordIndex === 0 && (
          <p className="mt-8 text-xs text-zinc-600 animate-pulse">
            Press Space or tap to start
          </p>
        )}
      </div>

      {/* ── Progress Bar ────────────────────────────────── */}
      <div className="shrink-0 px-4">
        <div className="relative h-1 w-full rounded-full bg-[#1a1a1a] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-[width] duration-150 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-zinc-600">
          <span>Word {wordIndex + 1} of {totalWords.toLocaleString()}</span>
          <span>{timeRemaining} remaining</span>
        </div>
      </div>

      {/* ── Controls ────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[#1a1a1a] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left controls: Speed */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustWpm(-25)}
              className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-300"
              title="Decrease speed (↓)"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-1.5 rounded-md bg-[#141414] px-3 py-1.5 min-w-[80px] justify-center">
              <Gauge className="h-3 w-3 text-zinc-500" />
              <span className="text-xs font-medium tabular-nums text-zinc-300">
                {rampMode ? rampWpm : wpm}
              </span>
              <span className="text-[10px] text-zinc-600">WPM</span>
            </div>
            <button
              onClick={() => adjustWpm(25)}
              className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-300"
              title="Increase speed (↑)"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Center controls: Playback */}
          <div className="flex items-center gap-1">
            <button
              onClick={restart}
              className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-300"
              title="Restart (R)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={skipBack}
              className="rounded p-2 text-zinc-400 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-200"
              title="Back 10 words (←)"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={togglePlay}
              className={cn(
                'rounded-full p-3 transition-all',
                isPlaying
                  ? 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30'
                  : 'bg-violet-500 text-white hover:bg-violet-400 shadow-lg shadow-violet-500/25',
              )}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>
            <button
              onClick={skipForward}
              className="rounded p-2 text-zinc-400 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-200"
              title="Forward 10 words (→)"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          {/* Right controls: Options */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRampMode((p) => !p)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                rampMode
                  ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30'
                  : 'bg-[#141414] text-zinc-500 hover:text-zinc-300',
              )}
              title="RAMP mode: gradually increase speed"
            >
              <ChevronUp className="h-3 w-3" />
              RAMP
            </button>
            <button
              onClick={cycleFontSize}
              className="rounded-md bg-[#141414] px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
              title="Cycle font size"
            >
              {fontSize.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-zinc-700">
          <span>Space: play/pause</span>
          <span>←→: word</span>
          <span>↑↓: speed</span>
          <span>R: restart</span>
          <span>Esc: close</span>
        </div>
      </div>
    </div>
  )
}
