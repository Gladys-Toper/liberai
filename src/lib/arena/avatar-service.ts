// Sprint 8: AV Studio — Simli avatar/lip-sync adapter
// Simli Speech-to-Video: <300ms latency lip-sync from static 2D portrait
// Input: PCM16 audio at 16kHz | Output: WebRTC video stream

export interface WebRTCCredentials {
  sessionId: string
  iceServers: RTCIceServer[]
  offer: RTCSessionDescriptionInit
}

export interface IAvatarService {
  startWebRTCSession(faceId: string): Promise<WebRTCCredentials>
  pipeAudioToAvatar(audioData: ArrayBuffer, sessionId: string): Promise<void>
  endSession(sessionId: string): Promise<void>
}

/**
 * Simli adapter for lip-synced avatar video via WebRTC.
 *
 * Architecture:
 *   Backend creates session → returns ICE credentials
 *   Browser connects directly to Simli via WebRTC (video)
 *   Backend pipes audio buffers (PCM16 16kHz) → Simli lip-syncs → streams to browser
 */
export class SimliAdapter implements IAvatarService {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SIMLI_API_KEY!
  }

  async startWebRTCSession(faceId: string): Promise<WebRTCCredentials> {
    const res = await fetch('https://api.simli.ai/startAudioToVideoSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        faceId,
        apiKey: this.apiKey,
        handleSilence: true,
        maxSessionLength: 600, // 10 min max per debate
        maxIdleTime: 60,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Simli session init failed (${res.status}): ${errText}`)
    }

    return res.json()
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
    } catch {
      // Best-effort cleanup — don't throw on session teardown
    }
  }
}
