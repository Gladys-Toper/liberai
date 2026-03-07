/**
 * AV Configuration — dynamic resolution from author profiles.
 *
 * Tiered video system:
 *   Tier 1: D-ID (primary) — accepts any portrait URL, generates AI video
 *   Tier 2: Simli (alternative) — requires pre-uploaded faceId
 *   Tier 3: Animated portrait (fallback) — CSS/Canvas animation with browser TTS
 *
 * Voice system:
 *   With D-ID: Microsoft Azure Neural voices (accent-appropriate, built into D-ID)
 *   With Simli: ElevenLabs/Cartesia TTS piped to Simli
 *   Fallback: Browser Web Speech API with accent-tuned parameters
 */

import { getVideoBackend, type VideoBackend } from './avatar-service'

export type TTSProvider = 'did-builtin' | 'elevenlabs' | 'cartesia' | 'browser'

export interface AVProfile {
  /** Portrait image URL (auto-resolved from Wikipedia) */
  portraitUrl: string | null
  /** D-ID/Simli stream/face identifier */
  videoId: string | null
  /** Microsoft Azure Neural voice ID (for D-ID) */
  didVoiceId: string
  /** ElevenLabs voice ID (for Simli pipeline) */
  elevenLabsVoiceId: string
  /** TTS provider in use */
  ttsProvider: TTSProvider
  /** Video backend in use */
  videoBackend: VideoBackend
}

/**
 * Build an AV profile for a debate participant.
 * Automatically selects the best available video + TTS stack.
 */
export function buildAVProfile(opts: {
  portraitUrl: string | null
  didVoiceId: string
  nationality: string | null
  role: 'debater_a' | 'debater_b' | 'commentator'
}): AVProfile {
  const backend = getVideoBackend()

  let ttsProvider: TTSProvider = 'browser'
  if (backend === 'did') ttsProvider = 'did-builtin'
  else if (backend === 'simli' && process.env.ELEVENLABS_API_KEY) ttsProvider = 'elevenlabs'
  else if (backend === 'simli' && process.env.CARTESIA_API_KEY) ttsProvider = 'cartesia'

  // For Simli, use pre-configured face IDs
  let videoId: string | null = null
  if (backend === 'simli') {
    const faceEnvMap: Record<string, string> = {
      debater_a: process.env.SIMLI_FACE_A || '',
      debater_b: process.env.SIMLI_FACE_B || '',
      commentator: process.env.SIMLI_FACE_COMMENTATOR || '',
    }
    videoId = faceEnvMap[opts.role] || null
  }

  // For Simli, use pre-configured ElevenLabs voice IDs
  const voiceEnvMap: Record<string, string> = {
    debater_a: process.env.ELEVENLABS_VOICE_A || '',
    debater_b: process.env.ELEVENLABS_VOICE_B || '',
    commentator: process.env.CARTESIA_VOICE_COMMENTATOR || '',
  }

  return {
    portraitUrl: opts.portraitUrl,
    videoId,
    didVoiceId: opts.didVoiceId,
    elevenLabsVoiceId: voiceEnvMap[opts.role] || '',
    ttsProvider,
    videoBackend: backend,
  }
}

/** Commentator D-ID voice — energetic, American sports-caster */
export const COMMENTATOR_DID_VOICE = 'en-US-GuyNeural'

/** Check if any video service is available */
export function isAVConfigured(): boolean {
  return getVideoBackend() !== 'none'
}
