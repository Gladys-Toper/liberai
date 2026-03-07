// Sprint 8: Multi-Model Arena — Provider adapter for debate roles
import type { LanguageModel } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { xai } from '@ai-sdk/xai'

// Model key type for pricing lookups
export type ModelKey = 'claude' | 'openai' | 'gemini' | 'grok'

export type DebaterModel = 'claude' | 'openai'

export type DebateRole =
  | 'debater'
  | 'referee'
  | 'commentator'
  | 'synthesizer'
  | 'axiom_extractor'

// Concrete model instances via Vercel AI SDK
const MODEL_MAP: Record<ModelKey, LanguageModel> = {
  claude: anthropic('claude-sonnet-4-6'),
  openai: openai('gpt-5.3-instant'),
  gemini: google('gemini-3.1-pro-preview'),
  grok: xai('grok-4-1-fast-non-reasoning'),
}

export interface ArenaModelProvider {
  /** Get the LLM model for a given debate role and optional side */
  getModel(role: DebateRole, side?: 'a' | 'b'): LanguageModel
  /** Get the pricing key for a given role/side (maps to MODEL_PRICING keys) */
  getModelKey(role: DebateRole, side?: 'a' | 'b'): ModelKey
  /** Model assignment for side A */
  readonly modelA: DebaterModel
  /** Model assignment for side B */
  readonly modelB: DebaterModel
}

export class DefaultArenaModelProvider implements ArenaModelProvider {
  constructor(
    public readonly modelA: DebaterModel,
    public readonly modelB: DebaterModel,
  ) {}

  /**
   * Create a provider with random Claude/OpenAI assignment.
   * One side gets Claude, the other gets OpenAI — coin flip decides which.
   */
  static createWithRandomAssignment(): DefaultArenaModelProvider {
    const coinFlip = Math.random() < 0.5
    return new DefaultArenaModelProvider(
      coinFlip ? 'claude' : 'openai',
      coinFlip ? 'openai' : 'claude',
    )
  }

  /**
   * Reconstruct provider from persisted session data.
   */
  static fromSession(modelA: string, modelB: string): DefaultArenaModelProvider {
    return new DefaultArenaModelProvider(
      (modelA as DebaterModel) || 'openai',
      (modelB as DebaterModel) || 'openai',
    )
  }

  getModel(role: DebateRole, side?: 'a' | 'b'): LanguageModel {
    return MODEL_MAP[this.getModelKey(role, side)]
  }

  getModelKey(role: DebateRole, side?: 'a' | 'b'): ModelKey {
    switch (role) {
      case 'debater':
      case 'axiom_extractor':
        return side === 'a' ? this.modelA : this.modelB
      case 'referee':
      case 'synthesizer':
        return 'gemini'
      case 'commentator':
        return 'grok'
    }
  }
}
