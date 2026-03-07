// ═══════════════════════════════════════════════════════════════════════════
// ARENA AI CASTING — Single source of truth for ALL model assignments
// ═══════════════════════════════════════════════════════════════════════════
//
// Models verified against live APIs on 2026-03-07:
//   OpenAI:  curl api.openai.com/v1/models
//   Google:  curl generativelanguage.googleapis.com/v1beta/models
//   xAI:    curl api.x.ai/v1/models
//
// ┌────────────────────┬──────────────────────┬──────────────────────────────────────┐
// │ Role               │ AI Provider          │ Model ID                             │
// ├────────────────────┼──────────────────────┼──────────────────────────────────────┤
// │ Debaters (A & B)   │ OpenAI               │ gpt-5.4                              │
// │ Axiom Extractor    │ OpenAI               │ gpt-5.4                              │
// │ Referee / Judge    │ Google Gemini         │ gemini-3.1-pro-preview               │
// │ Synthesizer        │ Google Gemini         │ gemini-3.1-pro-preview               │
// │ Screenplay         │ Google Gemini         │ gemini-3.1-pro-preview               │
// │ Commentator        │ xAI Grok             │ grok-4-1-fast-non-reasoning          │
// │ (fallback)         │ Google Gemini         │ gemini-3-flash-preview               │
// │ Fight Poster       │ Google Imagen         │ gemini-3.1-flash-image-preview       │
// └────────────────────┴──────────────────────┴──────────────────────────────────────┘
//
// WHY THESE MODELS:
//   GPT-5.4                       — Latest OpenAI (March 2026), best argumentation
//   Gemini 3.1 Pro Preview        — Latest Gemini Pro, best impartial eval + screenplay
//   Grok 4.1 Fast (non-reasoning) — Latest xAI fast model, edgy commentary
//   Gemini 3 Flash Preview        — Latest Flash for fallback/lightweight tasks
//   Nano Banana 2                 — Latest Google image gen (fight posters)
//
// SCREENPLAY GENERATOR:
//   Uses Gemini 3.1 Pro Preview (latest Gemini Pro).
//   One LLM call generates ALL dialogue (debaters, commentator, referee)
//   in one coherent screenplay. LTX 2.3 handles all voice synthesis —
//   dialogue in quotation marks → lip-synced speech with accent/emotion.
//
// TO UPDATE MODELS: Change the MODEL_MAP below. Everything flows from here.
// The screenplay generator imports getModel() — never hardcode model IDs elsewhere.
// ═══════════════════════════════════════════════════════════════════════════

import type { LanguageModel } from 'ai'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { xai } from '@ai-sdk/xai'

// Model key type for pricing lookups (maps to MODEL_PRICING in pricing.ts)
export type ModelKey = 'openai' | 'gemini' | 'grok'

export type DebateRole =
  | 'debater'
  | 'referee'
  | 'commentator'
  | 'synthesizer'
  | 'axiom_extractor'
  | 'screenplay'

// Check if XAI API key is configured (non-empty)
const isXAIConfigured = !!process.env.XAI_API_KEY

// ── Concrete model instances via Vercel AI SDK ──────────────────────────
// IMPORTANT: Keep these in sync with MODEL_PRICING in src/lib/payments/pricing.ts
const MODEL_MAP: Record<ModelKey, LanguageModel> = {
  openai: openai('gpt-5.4'),                         // GPT-5.4 (March 2026) — debaters + axiom extraction
  gemini: google('gemini-3.1-pro-preview'),           // Gemini 3.1 Pro Preview — referee/judge + synthesizer + screenplay
  grok: isXAIConfigured
    ? xai('grok-4-1-fast-non-reasoning')              // Grok 4.1 Fast — off-color commentator
    : google('gemini-3-flash-preview'),               // Fallback when XAI_API_KEY not configured
}

// Gemini Flash — used for lightweight tasks (NOT for debate judging)
export const geminiFlash = google('gemini-3-flash-preview')

export interface ArenaModelProvider {
  /** Get the LLM model for a given debate role */
  getModel(role: DebateRole): LanguageModel
  /** Get the pricing key for a given role (maps to MODEL_PRICING keys) */
  getModelKey(role: DebateRole): ModelKey
}

export class DefaultArenaModelProvider implements ArenaModelProvider {
  /**
   * Create the standard arena provider.
   * Both debaters always use OpenAI GPT-5.4.
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
      case 'screenplay':
        return 'gemini'
      case 'commentator':
        return 'grok'
    }
  }
}
