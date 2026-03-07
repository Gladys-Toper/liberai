// Sprint 8: AV Studio — Voice synthesis adapters
// ElevenLabs for debaters (gravitas, accents), Cartesia for commentator (emotion tags, speed)
// Both output PCM 16-bit signed LE at 16kHz — Simli's required input format

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import Cartesia from '@cartesia/cartesia-js'

export interface IVoiceService {
  streamAudio(text: string, voiceProfileId: string): Promise<ArrayBuffer>
}

/**
 * ElevenLabs TTS for debater voices.
 * Model: eleven_v3 (maximum expressiveness for historical gravitas)
 * Voice Design API creates custom voices: Scottish male (Smith), German male (Marx)
 */
export class ElevenLabsAdapter implements IVoiceService {
  private client: ElevenLabsClient | null = null
  private apiKey?: string

  constructor(apiKey?: string) {
    // Lazy init — don't create the client until streamAudio() is called.
    // This prevents the SDK from throwing during module load when
    // ELEVENLABS_API_KEY is not yet set (e.g. during Next.js build).
    this.apiKey = apiKey
  }

  private getClient(): ElevenLabsClient {
    if (!this.client) {
      this.client = new ElevenLabsClient({
        apiKey: this.apiKey || process.env.ELEVENLABS_API_KEY!,
      })
    }
    return this.client
  }

  async streamAudio(text: string, voiceProfileId: string): Promise<ArrayBuffer> {
    const audioStream = await this.getClient().textToSpeech.convert(voiceProfileId, {
      text,
      modelId: 'eleven_v3',
      outputFormat: 'pcm_16000', // PCM 16-bit 16kHz — required by Simli
    })

    // Collect async iterable stream into a single ArrayBuffer
    return streamToArrayBuffer(audioStream)
  }
}

/**
 * Cartesia Sonic TTS for commentator voice.
 * Model: sonic-3 (sub-100ms latency, 42 languages, emotion control)
 * Supports emotion tags from Grok output: <laugh>, <shout>, etc.
 */
export class CartesiaAdapter implements IVoiceService {
  private client: Cartesia | null = null
  private apiKey?: string

  constructor(apiKey?: string) {
    // Lazy init — same pattern as ElevenLabsAdapter
    this.apiKey = apiKey
  }

  private getClient(): Cartesia {
    if (!this.client) {
      this.client = new Cartesia({
        apiKey: this.apiKey || process.env.CARTESIA_API_KEY!,
      })
    }
    return this.client
  }

  async streamAudio(text: string, voiceProfileId: string): Promise<ArrayBuffer> {
    const response = await this.getClient().tts.generate({
      model_id: 'sonic-3',
      transcript: text,
      voice: { id: voiceProfileId, mode: 'id' as const },
      output_format: {
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: 16000,
      },
    })

    // Cartesia tts.generate() returns a Response object — extract ArrayBuffer
    return response.arrayBuffer()
  }
}

/**
 * Convert an async iterable (ElevenLabs stream) to ArrayBuffer.
 */
async function streamToArrayBuffer(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = []

  if (Symbol.asyncIterator in (stream as AsyncIterable<Uint8Array>)) {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
  } else {
    const reader = (stream as ReadableStream<Uint8Array>).getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result.buffer as ArrayBuffer
}
