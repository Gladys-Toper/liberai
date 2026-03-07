# LiberAi — Claude Code Project Memory

## Project Overview
LiberAi is an AI-powered book publishing and debate platform built with Next.js 15, Supabase, and Vercel AI SDK. The "Ontological Pugilism Arena" lets books/authors debate each other with AI-generated arguments, live HP systems, betting pools, and cinematic video replays.

## Commands

```bash
npm run dev          # Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint
npm start            # Production server
npm run mcp          # Start MCP server (agent protocol)
npx tsc --noEmit     # Type check (run before committing)
bash scripts/check-models.sh  # Detect deprecated AI model references
```

**Database:**
```bash
npx supabase migration new <name>  # Create migration file
npx supabase db push               # Apply migrations to remote
```

## Critical Rules

### AI Model Assignments — SINGLE SOURCE OF TRUTH
**NEVER hardcode model IDs.** All model assignments flow from `src/lib/arena/model-provider.ts`.

| Role              | Provider    | Model ID                       | Why                                    |
|-------------------|-------------|--------------------------------|----------------------------------------|
| Debaters (A & B)  | OpenAI      | `gpt-5.3`                     | Best at structured argumentation       |
| Axiom Extractor   | OpenAI      | `gpt-5.3`                     | Same model as debaters for consistency |
| Referee / Judge   | Google      | `gemini-3.1-pro`               | Best at impartial multi-criteria eval  |
| Synthesizer       | Google      | `gemini-3.1-pro`               | Same model as judge for consistency    |
| Screenplay        | Google      | `gemini-3.1-pro`               | Cinematic dialogue (min: 3.1-pro/grok-4.2+) |
| Commentator       | xAI Grok    | `grok-4.1-fast`                | Off-color, witty, edgy sports-style    |
| Lightweight/Chat  | Google      | `gemini-3.1-flash`             | Fast, cheap tasks (NOT for judging)    |
| Reader Chat       | Anthropic   | `claude-sonnet-4-20250514`     | Book Q&A for readers                   |
| Grok fallback     | Google      | `gemini-3.1-flash`             | When XAI_API_KEY not configured        |

**When updating models**: Change ONLY `model-provider.ts` and `pricing.ts`. Run `bash scripts/check-models.sh` to verify no deprecated references remain.

**DEPRECATED models — NEVER use these:**
- `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash` — replaced by `gemini-3.1-flash`
- `gpt-4o-mini`, `gpt-4o`, `gpt-4` — replaced by `gpt-5.3`
- `grok-3-fast`, `grok-2` — replaced by `grok-4.1-fast`

### Screenplay Generator — Gemini 3.1 Pro
The screenplay generator (`src/lib/arena/screenplay-generator.ts`) uses **Gemini 3.1 Pro** (role: `screenplay`) to write ALL dialogue in one coherent pass — debaters, commentator, and referee voices. Minimum quality floor: `gemini-3.1-pro` or `grok-4.2+`. **NEVER use Flash or cheaper models for screenplay.**

LTX 2.3 handles all voice synthesis from the quoted dialogue.

### LTX Video 2.3 — Native Speech Synthesis
LTX generates **video + lip-synced speech + ambient audio** natively from text prompts. Dialogue in quotation marks with accent/emotion markers → synthesized speech. **NO separate TTS system needed.** Never add TTS libraries (elevenlabs, cartesia, etc.).

### Video Pipeline Architecture
The cinematic video pipeline uses a **self-chaining serverless pattern** to avoid Vercel's 300s timeout:
- Each invocation processes ONE video chunk in `after()`
- Then `fetch()` POSTs back to itself with `x-video-pipeline-key` header
- Auth: `VIDEO_PIPELINE_SECRET` env var
- State: `video_state JSONB` column on `debate_sessions`

## Architecture

### Directory Structure
```
src/
├── app/
│   ├── (admin)/         # Admin dashboard routes
│   ├── (auth)/          # Login/signup routes
│   ├── (marketing)/     # Landing pages
│   ├── (platform)/      # Reader-facing platform
│   └── api/             # API routes (see below)
├── components/
│   └── arena/           # Debate UI (DebateArenaClient, CinematicPlayer, overlays)
└── lib/
    ├── arena/           # Debate engine, models, video, screenplay
    ├── agents/          # A2A agent network (trust, metering, events)
    ├── ai/              # RAG pipeline (book chunk search, embeddings)
    ├── auth/            # Supabase auth helpers, API key validation
    ├── db/              # Database queries
    ├── payments/        # Stripe + pricing + token cost calculations
    ├── social/          # Social features
    └── upload/          # File upload handling
```

### API Routes
```
api/
├── arena/[id]/video/   # Self-chaining cinematic video pipeline
├── a2a/                # Agent-to-Agent JSON-RPC (tasks, swarms, discovery)
├── chat/               # Reader book Q&A (multi-model)
├── author-chat/        # Author dashboard AI assistant
├── admin-chat/         # Admin dashboard AI assistant
├── v1/                 # Versioned external API (author/admin chat)
├── auth/               # Auth callbacks
├── wallet/             # Crypto wallet (x402 payments)
└── mcp/                # MCP server endpoint
```

### Path Alias
`@/*` maps to `./src/*` — use `@/lib/...`, `@/components/...`, etc.

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **AI SDK**: Vercel AI SDK (`ai` package) with `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/anthropic`
- **Video**: LTX Video 2.3 API (`https://api.ltx.video`)
- **Hosting**: Vercel (serverless)
- **Styling**: Tailwind CSS + Framer Motion
- **Payments**: Stripe + x402 crypto micropayments

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

## Gotchas

- **Vercel serverless timeout**: 300s max on Pro plan. Long tasks (video gen) must use self-chaining pattern with `after()` + self-POST
- **`maxDuration`**: Set `export const maxDuration = 300` in route files that need extended execution
- **Git paths with brackets**: Quote paths like `"src/app/api/arena/[id]/video/route.ts"` in git commands
- **Supabase service client**: Use `SUPABASE_SERVICE_ROLE_KEY` for server-side DB access, never expose to client
- **Model drift**: AI sessions may hallucinate older model versions. Always check `model-provider.ts` and run `scripts/check-models.sh`
- **XAI fallback**: If `XAI_API_KEY` is not set, Grok roles fall back to Gemini 3.1 Flash automatically

## Environment Variables
- `LTX_API_KEY` — LTX Video API key
- `VIDEO_PIPELINE_SECRET` — Self-chaining pipeline auth
- `XAI_API_KEY` — xAI Grok API key (optional, falls back to Gemini Flash)
- `OPENAI_API_KEY` — OpenAI API key
- `GOOGLE_GENERATIVE_AI_API_KEY` — Google Gemini API key
- `ANTHROPIC_API_KEY` — Anthropic Claude API key
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (client-safe)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service key (server-only)
- `STRIPE_SECRET_KEY` — Stripe payments

## Supabase
- Project ID: `zsevmbfgdtoojzgxyxqf`
- Storage bucket: `debate-video` (public read)
- Migrations: `supabase/migrations/` (numbered 001–010+)
