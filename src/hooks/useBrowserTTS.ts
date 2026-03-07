'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

/**
 * Voice profile for a debate character.
 * Supports both hardcoded defaults and dynamic profiles
 * resolved from author nationality via author-profile.ts.
 */
export interface VoiceProfile {
  pitch: number   // 0-2, default 1
  rate: number    // 0.1-10, default 1
  volume: number  // 0-1
  /** Accent hint for voice matching (e.g. 'german', 'scottish') */
  accentHint?: string
  /** Ordered list of preferred voice names to try */
  preferredVoices?: string[]
}

/** Default profiles used when no dynamic profile is provided */
const DEFAULT_PROFILES: Record<string, VoiceProfile> = {
  debater_a: {
    pitch: 0.7,
    rate: 0.85,
    volume: 1,
    accentHint: 'neutral',
    preferredVoices: ['Daniel', 'Google UK English Male'],
  },
  debater_b: {
    pitch: 0.9,
    rate: 0.9,
    volume: 1,
    accentHint: 'neutral',
    preferredVoices: ['Google UK English Male', 'Daniel'],
  },
  commentator: {
    pitch: 1.15,
    rate: 1.2,
    volume: 1,
    accentHint: 'american',
    preferredVoices: ['Alex', 'Google US English', 'Samantha'],
  },
}

interface TTSState {
  speaking: boolean
  activeRole: string | null
  queue: Array<{ text: string; role: string }>
}

/**
 * Browser TTS hook with dynamic accent-aware voice selection.
 *
 * Accepts optional dynamic voice profiles resolved from author nationalities.
 * When provided, these override the hardcoded defaults so each author
 * speaks with their appropriate accent (German for Marx, Scottish for Smith, etc).
 *
 * This is the FALLBACK when D-ID video is not configured.
 * When D-ID is active, TTS is handled server-side via Azure Neural voices.
 */
export function useBrowserTTS(dynamicProfiles?: Record<string, VoiceProfile>) {
  const [state, setState] = useState<TTSState>({
    speaking: false,
    activeRole: null,
    queue: [],
  })
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const processingRef = useRef(false)
  const mountedRef = useRef(true)

  // Initialize synthesis and load voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    synthRef.current = window.speechSynthesis

    function loadVoices() {
      voicesRef.current = synthRef.current?.getVoices() || []
    }

    loadVoices()
    synthRef.current.addEventListener('voiceschanged', loadVoices)

    return () => {
      mountedRef.current = false
      synthRef.current?.cancel()
      synthRef.current?.removeEventListener('voiceschanged', loadVoices)
    }
  }, [])

  /** Resolve the best profile for a role: dynamic override > default */
  const getProfile = useCallback((role: string): VoiceProfile => {
    return dynamicProfiles?.[role] || DEFAULT_PROFILES[role] || DEFAULT_PROFILES.commentator
  }, [dynamicProfiles])

  /**
   * Find the best matching voice for a profile.
   * Tries preferred voices in order, then falls back to any English voice.
   */
  const findVoice = useCallback((profile: VoiceProfile): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current
    if (!voices.length) return null

    // Try each preferred voice name in order
    if (profile.preferredVoices) {
      for (const pref of profile.preferredVoices) {
        const match = voices.find(v =>
          v.name.toLowerCase().includes(pref.toLowerCase()),
        )
        if (match) return match
      }
    }

    // Fallback: English male voice
    const english = voices.filter(v => v.lang.startsWith('en'))
    return english[0] || voices[0] || null
  }, [])

  const processQueue = useCallback(() => {
    if (processingRef.current) return
    if (!synthRef.current) return

    setState(prev => {
      if (prev.queue.length === 0) {
        processingRef.current = false
        return { ...prev, speaking: false, activeRole: null }
      }

      const [next, ...rest] = prev.queue
      processingRef.current = true

      const profile = getProfile(next.role)
      const utterance = new SpeechSynthesisUtterance(next.text)

      const voice = findVoice(profile)
      if (voice) utterance.voice = voice

      utterance.pitch = profile.pitch
      utterance.rate = profile.rate
      utterance.volume = profile.volume

      utterance.onend = () => {
        processingRef.current = false
        if (mountedRef.current) {
          processQueue()
        }
      }
      utterance.onerror = () => {
        processingRef.current = false
        if (mountedRef.current) {
          processQueue()
        }
      }

      synthRef.current!.speak(utterance)

      return {
        speaking: true,
        activeRole: next.role,
        queue: rest,
      }
    })
  }, [findVoice, getProfile])

  // Process queue when items are added
  useEffect(() => {
    if (state.queue.length > 0 && !processingRef.current) {
      processQueue()
    }
  }, [state.queue, processQueue])

  const speak = useCallback((text: string, role: string) => {
    if (!synthRef.current) return

    // Truncate very long text to keep TTS reasonable
    const truncated = text.length > 800 ? text.slice(0, 800) + '...' : text

    setState(prev => ({
      ...prev,
      queue: [...prev.queue, { text: truncated, role }],
    }))
  }, [])

  const speakRound = useCallback((
    attackText: string,
    attackerSide: 'a' | 'b',
    defenseText: string,
    commentary: string | null,
  ) => {
    const attackRole = attackerSide === 'a' ? 'debater_a' : 'debater_b'
    const defenseRole = attackerSide === 'a' ? 'debater_b' : 'debater_a'

    speak(attackText, attackRole)
    speak(defenseText, defenseRole)
    if (commentary) {
      speak(commentary, 'commentator')
    }
  }, [speak])

  const stop = useCallback(() => {
    synthRef.current?.cancel()
    processingRef.current = false
    setState({ speaking: false, activeRole: null, queue: [] })
  }, [])

  return {
    speaking: state.speaking,
    activeRole: state.activeRole,
    speak,
    speakRound,
    stop,
  }
}
