// Sprint 8: AV Studio — Character voice/face/model mapping
// Maps each debate role to its TTS model, voice ID, and Simli face ID

export type TTSProvider = 'elevenlabs' | 'cartesia'

export interface AVProfile {
  faceId: string           // Simli dashboard portrait ID
  voiceId: string          // TTS voice profile ID
  ttsModel: string         // TTS model ID
  ttsProvider: TTSProvider // Which TTS adapter to use
}

/**
 * AV profiles for each debate character.
 * faceIds come from uploading branded portraits to Simli dashboard.
 * voiceIds come from ElevenLabs Voice Design or Cartesia voice library.
 */
export const AV_PROFILES: Record<string, AVProfile> = {
  debater_a: {
    faceId: process.env.SIMLI_FACE_A || '',
    voiceId: process.env.ELEVENLABS_VOICE_A || '',
    ttsModel: 'eleven_v3',      // Maximum expressiveness for historical gravitas
    ttsProvider: 'elevenlabs',
  },
  debater_b: {
    faceId: process.env.SIMLI_FACE_B || '',
    voiceId: process.env.ELEVENLABS_VOICE_B || '',
    ttsModel: 'eleven_v3',
    ttsProvider: 'elevenlabs',
  },
  commentator: {
    faceId: process.env.SIMLI_FACE_COMMENTATOR || '',
    voiceId: process.env.CARTESIA_VOICE_COMMENTATOR || '',
    ttsModel: 'sonic-3',        // Sub-100ms latency for live commentary
    ttsProvider: 'cartesia',
  },
}

/**
 * Check if AV is configured (all required env vars present).
 * If not configured, debate still works — just without video/audio.
 */
export function isAVConfigured(): boolean {
  return !!(
    process.env.SIMLI_API_KEY &&
    process.env.SIMLI_FACE_A &&
    process.env.SIMLI_FACE_B &&
    process.env.ELEVENLABS_API_KEY &&
    process.env.ELEVENLABS_VOICE_A &&
    process.env.ELEVENLABS_VOICE_B &&
    process.env.CARTESIA_API_KEY &&
    process.env.CARTESIA_VOICE_COMMENTATOR &&
    process.env.SIMLI_FACE_COMMENTATOR
  )
}

// TTS model reference:
// ElevenLabs: 'eleven_v3' (most expressive) | 'eleven_flash_v2_5' (fastest, ~75ms)
//             | 'eleven_multilingual_v2' (emotionally nuanced) | 'eleven_turbo_v2_5' (~250ms)
// Cartesia:   'sonic-3' (latest) | 'sonic-3-latest' | 'sonic-3-2026-01-12' (snapshot)
//
// All audio output: PCM 16-bit signed LE, 16kHz sample rate (Simli requirement)
