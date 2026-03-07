// ═══════════════════════════════════════════════════════════════════════════
// ARENA AI CASTING — Single source of truth for ALL model assignments
// ═══════════════════════════════════════════════════════════════════════════
//
// ┌────────────────────┬──────────────────────┬──────────────────────────┐
// │ Role               │ AI Provider          │ Model ID                 │
// ├────────────────────┼──────────────────────┼──────────────────────────┤
// │ Debaters (A & B)   │ OpenAI               │ gpt-5.3                  │
// │ Axiom Extractor    │ OpenAI               │ gpt-5.3                  │
// │ Referee / Judge    │ Google Gemini         │ gemini-3.1-pro           │
// │ Synthesizer        │ Google Gemini         │ gemini-3.1-pro           │
// │ Commentator        │ xAI Grok             │ grok-4.1-fast            │
// │ (fallback)         │ Google Gemini         │ gemini-3.1-flash         │
// └────────────────────┴──────────────────────┴──────────────────────────┘
//
// WHY THESE MODELS:
//   GPT-5.3      — Best at structured argumentation and rhetorical depth
//   Gemini 3.1 Pro — Best at impartial multi-criteria evaluation (judge)
//   Grok 4.1 Fast  — Off-color, witty, edgy sports-style commentary
//
// CINEMATIC VIDEO PIPELINE (LTX 2.3):
//   LTX generates video + lip-synced speech + ambient audio natively.
//   Dialogue in quotation marks → synthesized speech with accent/emotion.
//   The screenplay generator uses EACH ROLE'S OWN AI to write its lines:
//     • Grok writes commentator dialogue (snarky, irreverent)
//     • GPT writes debater dialogue (formal, incisive)
//     • Gemini Pro writes referee verdict (authoritative, measured)
//   This ensures voice consistency between the debate and the video.
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

// Check if XAI API key is configured (non-empty)
const isXAIConfigured = !!process.env.XAI_API_KEY

// ── Concrete model instances via Vercel AI SDK ──────────────────────────
// IMPORTANT: Keep these in sync with MODEL_PRICING in src/lib/payments/pricing.ts
const MODEL_MAP: Record<ModelKey, LanguageModel> = {
  openai: openai('gpt-5.3'),                // GPT-5.3 — debaters + axiom extraction
  gemini: google('gemini-3.1-pro'),          // Gemini 3.1 Pro — referee/judge + synthesizer
  grok: isXAIConfigured
    ? xai('grok-4.1-fast')                   // Grok 4.1 Fast — off-color commentator
    : google('gemini-3.1-flash'),            // Fallback when XAI_API_KEY not configured
}

// Gemini Flash — used for lightweight tasks (NOT for debate judging)
export const geminiFlash = google('gemini-3.1-flash')

export interface ArenaModelProvider {
  /** Get the LLM model for a given debate role */
  getModel(role: DebateRole): LanguageModel
  /** Get the pricing key for a given role (maps to MODEL_PRICING keys) */
  getModelKey(role: DebateRole): ModelKey
}

export class DefaultArenaModelProvider implements ArenaModelProvider {
  /**
   * Create the standard arena provider.
   * Both debaters always use OpenAI GPT-5.3.
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
