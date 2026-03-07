/**
 * AV Service Adapters — AI video generation for debate avatars.
 *
 * Supports two backends:
 *   1. D-ID (primary) — accepts any portrait URL, generates lip-synced
 *      talking head video via WebRTC. End-to-end: text → TTS → lip-sync → video.
 *   2. Simli (alternative) — requires pre-uploaded faceId from dashboard,
 *      higher quality but not scalable without manual setup.
 *
 * D-ID Talks Streams flow:
 *   POST /talks/streams          → create stream (source_url = portrait)
 *   POST /talks/streams/{id}/sdp → send SDP answer
 *   POST /talks/streams/{id}/ice → send ICE candidates
 *   POST /talks/streams/{id}     → send text to speak
 *   DELETE /talks/streams/{id}   → close stream
 */

const DID_API_BASE = 'https://api.d-id.com'

// ── Shared types ─────────────────────────────────────────────────────────

export interface WebRTCCredentials {
  sessionId: string
  streamId: string
  iceServers: RTCIceServer[]
  offer: RTCSessionDescriptionInit
}

export interface IAvatarService {
  createStream(portraitUrl: string): Promise<WebRTCCredentials>
  sendSdpAnswer(streamId: string, sessionId: string, answer: RTCSessionDescriptionInit): Promise<void>
  sendIceCandidate(streamId: string, sessionId: string, candidate: RTCIceCandidateInit): Promise<void>
  sendTalkText(streamId: string, sessionId: string, text: string, voiceId: string): Promise<void>
  sendTalkAudio(streamId: string, sessionId: string, audioData: ArrayBuffer): Promise<void>
  closeStream(streamId: string, sessionId: string): Promise<void>
}

// ── WAV Helper ───────────────────────────────────────────────────────────

/** Wrap raw PCM 16-bit mono audio in a WAV container for D-ID compatibility. */
function wrapPCMToWAV(
  pcmData: ArrayBuffer,
  sampleRate = 16000,
  numChannels = 1,
  bitsPerSample = 16,
): ArrayBuffer {
  const dataSize = pcmData.byteLength
  const headerSize = 44
  const fileSize = headerSize + dataSize
  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, fileSize - 8, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true)
  view.setUint16(32, numChannels * bitsPerSample / 8, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  new Uint8Array(buffer, headerSize).set(new Uint8Array(pcmData))
  return buffer
}

// ── D-ID Adapter ─────────────────────────────────────────────────────────

/**
 * D-ID Talks Streams adapter — accepts any portrait URL,
 * generates real-time lip-synced talking head video via WebRTC.
 *
 * Uses Microsoft Azure Neural voices for accent-appropriate English TTS.
 * Voice IDs are resolved from author nationality via author-profile.ts.
 */
export class DIDAdapter implements IAvatarService {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DID_API_KEY || ''
  }

  private get authHeader(): string {
    return `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`
  }

  /**
   * Create a D-ID talk stream from a portrait URL.
   * Returns WebRTC credentials for the browser to connect.
   */
  async createStream(portraitUrl: string): Promise<WebRTCCredentials> {
    const res = await fetch(`${DID_API_BASE}/talks/streams`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_url: portraitUrl,
        stream_warmup: true,
        output_resolution: 512,
        session_timeout: 600,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`D-ID stream creation failed (${res.status}): ${errText}`)
    }

    const data = await res.json()

    return {
      sessionId: data.session_id,
      streamId: data.id,
      iceServers: (data.ice_servers || []).map((s: { urls: string | string[]; username?: string; credential?: string }) => ({
        urls: Array.isArray(s.urls) ? s.urls : [s.urls],
        username: s.username,
        credential: s.credential,
      })),
      offer: {
        type: 'offer' as const,
        sdp: data.jsep?.sdp || data.offer?.sdp,
      },
    }
  }

  /**
   * Send the browser's SDP answer to complete WebRTC handshake.
   */
  async sendSdpAnswer(
    streamId: string,
    sessionId: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const res = await fetch(`${DID_API_BASE}/talks/streams/${streamId}/sdp`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        answer: { type: answer.type, sdp: answer.sdp },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`D-ID SDP answer failed (${res.status}): ${errText}`)
    }
  }

  /**
   * Send ICE candidate for NAT traversal.
   */
  async sendIceCandidate(
    streamId: string,
    sessionId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const res = await fetch(`${DID_API_BASE}/talks/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn(`D-ID ICE candidate failed (${res.status}): ${errText}`)
    }
  }

  /**
   * Send text to the D-ID stream — generates talking head video with
   * accent-appropriate voice via Microsoft Azure Neural TTS.
   */
  async sendTalkText(
    streamId: string,
    sessionId: string,
    text: string,
    voiceId: string,
  ): Promise<void> {
    const res = await fetch(`${DID_API_BASE}/talks/streams/${streamId}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        script: {
          type: 'text',
          input: text.slice(0, 2000), // D-ID max per chunk
          provider: {
            type: 'microsoft',
            voice_id: voiceId,
          },
        },
        config: { stitch: true },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`D-ID talk failed (${res.status}): ${errText}`)
    }
  }

  /**
   * Send pre-generated audio to D-ID for lip-synced video.
   * Used when ElevenLabs/Cartesia generates the audio externally.
   * Wraps raw PCM 16-bit 16kHz mono data in a WAV container
   * and sends as a base64 data URI to D-ID.
   */
  async sendTalkAudio(
    streamId: string,
    sessionId: string,
    audioData: ArrayBuffer,
  ): Promise<void> {
    // Wrap raw PCM in WAV container for D-ID compatibility
    const wavBuffer = wrapPCMToWAV(audioData)
    const base64 = Buffer.from(wavBuffer).toString('base64')
    const audioUrl = `data:audio/wav;base64,${base64}`

    const res = await fetch(`${DID_API_BASE}/talks/streams/${streamId}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        script: {
          type: 'audio',
          audio_url: audioUrl,
        },
        config: { stitch: true },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`D-ID talk audio failed (${res.status}): ${errText}`)
    }
  }

  /**
   * Close the D-ID stream and release resources.
   */
  async closeStream(streamId: string, _sessionId: string): Promise<void> {
    try {
      await fetch(`${DID_API_BASE}/talks/streams/${streamId}`, {
        method: 'DELETE',
        headers: { Authorization: this.authHeader },
      })
    } catch {
      // Best-effort cleanup
    }
  }
}

// ── Simli Adapter (legacy, requires pre-uploaded faceId) ─────────────────

/**
 * Simli adapter — requires faceId from Simli dashboard upload.
 * Higher quality lip-sync but not scalable for arbitrary authors.
 * Kept as alternative when custom faces are pre-configured.
 */
export class SimliAdapter {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SIMLI_API_KEY || ''
  }

  async startWebRTCSession(faceId: string): Promise<WebRTCCredentials> {
    const res = await fetch('https://api.simli.ai/startAudioToVideoSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        faceId,
        apiKey: this.apiKey,
        handleSilence: true,
        maxSessionLength: 600,
        maxIdleTime: 60,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Simli session init failed (${res.status}): ${errText}`)
    }

    const data = await res.json()
    return {
      sessionId: data.sessionId,
      streamId: data.sessionId, // Simli uses sessionId as stream identifier
      iceServers: data.iceServers || [],
      offer: data.offer || { type: 'offer', sdp: '' },
    }
  }

  async pipeAudioToAvatar(audioData: ArrayBuffer, sessionId: string): Promise<void> {
    const res = await fetch(`https://api.simli.ai/session/${sessionId}/audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-API-Key': this.apiKey,
      },
      body: audioData,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Simli audio pipe failed (${res.status}): ${errText}`)
    }
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      await fetch(`https://api.simli.ai/session/${sessionId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': this.apiKey },
      })
    } catch { /* best-effort */ }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

export type VideoBackend = 'did' | 'simli' | 'none'

/** Detect which video backend is available. */
export function getVideoBackend(): VideoBackend {
  if (process.env.DID_API_KEY) return 'did'
  if (process.env.SIMLI_API_KEY && process.env.SIMLI_FACE_A) return 'simli'
  return 'none'
}

/** Check if any AI video service is configured. */
export function isVideoConfigured(): boolean {
  return getVideoBackend() !== 'none'
}
