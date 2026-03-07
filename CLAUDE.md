# LiberAi — Claude Code Project Memory

## Project Overview
LiberAi is an AI-powered book publishing and debate platform built with Next.js 15, Supabase, and Vercel AI SDK. The "Ontological Pugilism Arena" lets books/authors debate each other with AI-generated arguments, live HP systems, betting pools, and cinematic video replays.

## Critical Rules

### AI Model Assignments — SINGLE SOURCE OF TRUTH
**NEVER hardcode model IDs.** All model assignments flow from `src/lib/arena/model-provider.ts`.

| Role              | Provider    | Model ID                       | Why                                    |
|-------------------|-------------|--------------------------------|----------------------------------------|
| Debaters (A & B)  | OpenAI      | `gpt-5.3`                     | Best at structured argumentation       |
| Axiom Extractor   | OpenAI      | `gpt-5.3`                     | Same model as debaters for consistency |
| Referee / Judge   | Google      | `gemini-3.1-pro`               | Best at impartial multi-criteria eval  |
| Synthesizer       | Google      | `gemini-3.1-pro`               | Same model as judge for consistency    |
| Commentator       | xAI Grok    | `grok-4.1-fast`                | Off-color, witty, edgy sports-style    |
| Lightweight/Chat  | Google      | `gemini-3.1-flash`             | Fast, cheap tasks (NOT for judging)    |
| Reader Chat       | Anthropic   | `claude-sonnet-4-20250514`     | Book Q&A for readers                   |
| Grok fallback     | Google      | `gemini-3.1-flash`             | When XAI_API_KEY not configured        |

**When updating models**: Change ONLY `model-provider.ts` and `pricing.ts`. Run `bash scripts/check-models.sh` to verify no deprecated references remain.

**DEPRECATED models — NEVER use these:**
- `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash` — replaced by `gemini-3.1-flash`
- `gpt-4o-mini`, `gpt-4o`, `gpt-4` — replaced by `gpt-5.3`
- `grok-3-fast`, `grok-2` — replaced by `grok-4.1-fast`

### Screenplay Generator — Role-Specific AI
The screenplay generator (`src/lib/arena/screenplay-generator.ts`) uses EACH ROLE'S OWN AI to write dialogue:
- **GPT-5.3** writes debater lines (formal, incisive) — temperature 0.6
- **Grok 4.1** writes commentator lines (snarky, irreverent) — temperature 0.8
- **Gemini 3.1 Pro** writes referee verdict (authoritative, measured) — temperature 0.4

This ensures voice consistency between the debate engine and the cinematic video.

### LTX Video 2.3 — Native Speech Synthesis
LTX generates **video + lip-synced speech + ambient audio** natively from text prompts. Dialogue in quotation marks with accent/emotion markers → synthesized speech. **NO separate TTS system needed.** Never add TTS libraries (elevenlabs, cartesia, etc.).

### Video Pipeline Architecture
The cinematic video pipeline uses a **self-chaining serverless pattern** to avoid Vercel's 300s timeout:
- Each invocation processes ONE video chunk in `after()`
- Then `fetch()` POSTs back to itself with `x-video-pipeline-key` header
- Auth: `VIDEO_PIPELINE_SECRET` env var
- State: `video_state JSONB` column on `debate_sessions`

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **AI SDK**: Vercel AI SDK (`ai` package) with `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/anthropic`
- **Video**: LTX Video 2.3 API (`https://api.ltx.video`)
- **Hosting**: Vercel (serverless)
- **Styling**: Tailwind CSS + Framer Motion
- **Payments**: Stripe

## Key Files
- `src/lib/arena/model-provider.ts` — AI model assignments (SINGLE SOURCE OF TRUTH)
- `src/lib/arena/debate-engine.ts` — Core debate logic (rounds, axioms, HP)
- `src/lib/arena/screenplay-generator.ts` — Debate → cinematic screenplay
- `src/lib/arena/video-service.ts` — LTX adapter (IVideoService interface)
- `src/lib/arena/timeline-sync.ts` — Video overlay sync engine
- `src/app/api/arena/[id]/video/route.ts` — Self-chaining video pipeline
- `src/components/arena/DebateArenaClient.tsx` — Main arena UI
- `src/components/arena/CinematicPlayer.tsx` — Video player with timeline overlays
- `src/lib/payments/pricing.ts` — Per-token pricing (keep in sync with model-provider.ts)

## Validation
- Run `bash scripts/check-models.sh` after any model-related changes
- Run `npx tsc --noEmit` before committing
- Run `npm run build` to verify production build

## Environment Variables
- `LTX_API_KEY` — LTX Video API key
- `VIDEO_PIPELINE_SECRET` — Self-chaining pipeline auth
- `XAI_API_KEY` — xAI Grok API key (optional, falls back to Gemini Flash)
- `OPENAI_API_KEY` — OpenAI API key
- `GOOGLE_GENERATIVE_AI_API_KEY` — Google Gemini API key
- `ANTHROPIC_API_KEY` — Anthropic Claude API key

## Supabase
- Project ID: `zsevmbfgdtoojzgxyxqf`
- Storage bucket: `debate-video` (public read)
