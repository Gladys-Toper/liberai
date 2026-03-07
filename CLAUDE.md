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

**⚠️ CRITICAL: DO NOT GUESS MODEL IDs FROM MEMORY — THEY WILL BE WRONG.**
Always verify model IDs against the live APIs before changing:
```bash
# OpenAI models (sorted newest first):
curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | python3 -c "import sys,json; [print(m['id']) for m in sorted(json.load(sys.stdin)['data'], key=lambda m: m['created'], reverse=True)[:15]]"
# Google Gemini models:
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_GENERATIVE_AI_API_KEY" | python3 -c "import sys,json; [print(m['name'].replace('models/',''), '-', m.get('displayName','')) for m in json.load(sys.stdin)['models'] if 'gemini' in m['name']]"
# xAI Grok models:
curl -s https://api.x.ai/v1/models -H "Authorization: Bearer $XAI_API_KEY" | python3 -c "import sys,json; [print(m['id']) for m in sorted(json.load(sys.stdin)['data'], key=lambda m: m['created'], reverse=True)]"
```

| Role              | Provider    | Model ID                            | Why                                    |
|-------------------|-------------|-------------------------------------|----------------------------------------|
| Debaters (A & B)  | OpenAI      | `gpt-5.4`                          | Latest OpenAI (March 2026)             |
| Axiom Extractor   | OpenAI      | `gpt-5.4`                          | Same model as debaters for consistency |
| Referee / Judge   | Google      | `gemini-3.1-pro-preview`            | Latest Gemini Pro                      |
| Synthesizer       | Google      | `gemini-3.1-pro-preview`            | Same model as judge for consistency    |
| Screenplay        | Google      | `gemini-3.1-pro-preview`            | Cinematic dialogue                     |
| Commentator       | xAI Grok    | `grok-4-1-fast-non-reasoning`       | Off-color, witty, edgy sports-style    |
| Lightweight/Chat  | Google      | `gemini-3-flash-preview`            | Fast, cheap tasks (NOT for judging)    |
| Reader Chat       | Anthropic   | `claude-sonnet-4-20250514`          | Book Q&A for readers                   |
| Fight Poster      | Google      | `gemini-3.1-flash-image-preview`    | Nano Banana 2 — fast image gen (~3s)   |
| Grok fallback     | Google      | `gemini-3-flash-preview`            | When XAI_API_KEY not configured        |

*Last verified against live APIs: 2026-03-07*

**When updating models**: Change ONLY `model-provider.ts` and `pricing.ts`. Run the API queries above to get real model IDs. Run `bash scripts/check-models.sh` to verify no deprecated references remain.

**DEPRECATED models — NEVER use these:**
- `gpt-5.3`, `gpt-4o-mini`, `gpt-4o`, `gpt-4`, `gpt-4.1` — replaced by `gpt-5.4`
- `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-flash` — replaced by `gemini-3.1-pro-preview` / `gemini-3-flash-preview`
- `grok-4.1-fast`, `grok-3-fast`, `grok-2` — replaced by `grok-4-1-fast-non-reasoning`

### Fight Poster — Nano Banana 2
The fight poster generator (`src/app/api/arena/[id]/poster/route.ts`) uses **Nano Banana 2** (`gemini-3.1-flash-image-preview`) via `generateImage()` from Vercel AI SDK. Generates 1960s boxing-style promotional art during the video wait screen. Uses `personGeneration: 'allow_adult'` for illustrated author figures. **NOT a debate pipeline model** — used only for image generation.

### Screenplay Generator — Gemini 3.1 Pro Preview
The screenplay generator (`src/lib/arena/screenplay-generator.ts`) uses **Gemini 3.1 Pro Preview** (`gemini-3.1-pro-preview`, role: `screenplay`) to write ALL dialogue in one coherent pass — debaters, commentator, and referee voices. **NEVER use Flash or cheaper models for screenplay.**

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
├── arena/[id]/poster/  # 1960s fight poster via Nano Banana 2
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
- `src/app/api/arena/[id]/poster/route.ts` — Fight poster generator (Nano Banana 2)
- `src/lib/payments/pricing.ts` — Per-token pricing (keep in sync with model-provider.ts)

## Gotchas

- **Vercel serverless timeout**: 300s max on Pro plan. Long tasks (video gen) must use self-chaining pattern with `after()` + self-POST
- **`maxDuration`**: Set `export const maxDuration = 300` in route files that need extended execution
- **Git paths with brackets**: Quote paths like `"src/app/api/arena/[id]/video/route.ts"` in git commands
- **Supabase service client**: Use `SUPABASE_SERVICE_ROLE_KEY` for server-side DB access, never expose to client
- **Model drift**: AI sessions may hallucinate older model versions. Always check `model-provider.ts` and run `scripts/check-models.sh`
- **XAI fallback**: If `XAI_API_KEY` is not set, Grok roles fall back to Gemini 3 Flash Preview automatically
- **Model name drift**: AI sessions WILL hallucinate model IDs. **NEVER trust model names from memory.** Always query the live APIs (see commands in Critical Rules) to get real model IDs before changing `model-provider.ts`

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
- Migrations: `supabase/migrations/` (numbered 001–012+)
