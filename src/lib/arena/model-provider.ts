// Sprint 8: Multi-Model Arena — Provider adapter for debate roles
//
// Model assignments (fixed):
//   Debaters (both sides): OpenAI GPT
//   Referee/Judge:         Google Gemini
//   Commentator:           xAI Grok (falls back to Gemini if XAI_API_KEY missing)
//   Synthesizer:           Google Gemini

import type { LanguageModel } from 'ai'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { xai } from '@ai-sdk/xai'

// Model key type for pricing lookups
export type ModelKey = 'openai' | 'gemini' | 'grok'

export type DebateRole =
  | 'debater'
  | 'referee'
  | 'commentator'
  | 'synthesizer'
  | 'axiom_extractor'

// Check if XAI API key is configured (non-empty)
const isXAIConfigured = !!process.env.XAI_API_KEY

// Concrete model instances via Vercel AI SDK
// Falls back to Gemini for commentator when XAI key is not configured
const MODEL_MAP: Record<ModelKey, LanguageModel> = {
  openai: openai('gpt-5.4'),
  gemini: google('gemini-2.5-flash'),
  grok: isXAIConfigured
    ? xai('grok-3-fast')
    : google('gemini-2.5-flash'), // Fallback when XAI not configured
}

export interface ArenaModelProvider {
  /** Get the LLM model for a given debate role */
  getModel(role: DebateRole): LanguageModel
  /** Get the pricing key for a given role (maps to MODEL_PRICING keys) */
  getModelKey(role: DebateRole): ModelKey
}

export class DefaultArenaModelProvider implements ArenaModelProvider {
  /**
   * Create the standard arena provider.
   * Both debaters always use OpenAI GPT.
   */
  static create(): DefaultArenaModelProvider {
    return new DefaultArenaModelProvider()
  }

  /**
   * Reconstruct provider from persisted session data.
   * Kept for backwards compatibility with existing sessions.
   */
  static fromSession(_modelA?: string, _modelB?: string): DefaultArenaModelProvider {
    return new DefaultArenaModelProvider()
  }

  getModel(role: DebateRole): LanguageModel {
    return MODEL_MAP[this.getModelKey(role)]
  }

  getModelKey(role: DebateRole): ModelKey {
    switch (role) {
      case 'debater':
      case 'axiom_extractor':
        return 'openai'
      case 'referee':
      case 'synthesizer':
        return 'gemini'
      case 'commentator':
        return 'grok'
    }
  }
}
