#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# MODEL DRIFT DETECTOR — prevents deprecated AI model references
# ═══════════════════════════════════════════════════════════════════════════
#
# Run:  bash scripts/check-models.sh
# CI:   Add to pre-commit or CI pipeline
#
# This script scans src/ for hardcoded model strings that DON'T match
# the canonical versions defined in src/lib/arena/model-provider.ts.
# If a deprecated or unknown model string is found, it fails loudly.
#
# CANONICAL MODELS (verified against live APIs 2026-03-07):
#   GPT:    gpt-5.4
#   Gemini: gemini-3.1-pro-preview     (debate judge/referee/synthesizer/screenplay)
#   Gemini: gemini-3-flash-preview     (lightweight tasks, fallback)
#   Gemini: gemini-3.1-flash-image-preview (Nano Banana 2, fight poster)
#   Grok:   grok-4-1-fast-non-reasoning (commentator)
#   Claude: claude-sonnet-4-20250514
#
# ⚠️  DO NOT GUESS MODEL IDs. Query live APIs to verify:
#   curl api.openai.com/v1/models
#   curl generativelanguage.googleapis.com/v1beta/models
#   curl api.x.ai/v1/models
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SRC_DIR="src"
ERRORS=0

echo "🔍 Scanning for deprecated model references..."
echo ""

# ── Deprecated Google models ──────────────────────────────────────────────
# Flag anything older than gemini-3.x (i.e. gemini-2.x, gemini-1.x)
DEPRECATED_GEMINI=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E "google\(['\"]gemini-(1\.|2\.)" "$SRC_DIR" 2>/dev/null || true)

if [ -n "$DEPRECATED_GEMINI" ]; then
  echo -e "${RED}✗ DEPRECATED Gemini models found:${NC}"
  echo "$DEPRECATED_GEMINI" | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "  ${YELLOW}Fix: Use google('gemini-3.1-pro-preview') for debate/judge or google('gemini-3-flash-preview') for lightweight tasks${NC}"
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Deprecated OpenAI models ─────────────────────────────────────────────
# Flag anything older than gpt-5.4 (i.e. gpt-4.x, gpt-5.0–5.3, gpt-3.x)
DEPRECATED_OPENAI=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E "openai\(['\"]gpt-(3|4|5\.[0-3])" "$SRC_DIR" 2>/dev/null || true)

if [ -n "$DEPRECATED_OPENAI" ]; then
  echo -e "${RED}✗ DEPRECATED OpenAI models found:${NC}"
  echo "$DEPRECATED_OPENAI" | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "  ${YELLOW}Fix: Use openai('gpt-5.4') — the canonical debater model${NC}"
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Deprecated xAI models ────────────────────────────────────────────────
# Flag anything older than grok-4-1 (i.e. grok-2, grok-3, grok-4-0, grok-4.1-fast [wrong format])
DEPRECATED_GROK=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E "xai\(['\"]grok-(2|3[^.]|4-0|4\.)" "$SRC_DIR" 2>/dev/null || true)

if [ -n "$DEPRECATED_GROK" ]; then
  echo -e "${RED}✗ DEPRECATED Grok models found:${NC}"
  echo "$DEPRECATED_GROK" | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "  ${YELLOW}Fix: Use xai('grok-4-1-fast-non-reasoning') — the canonical commentator model${NC}"
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Check for hardcoded model strings outside model-provider.ts ──────────
# Files that are ALLOWED to hardcode model strings:
#   - model-provider.ts (the single source of truth)
#   - pricing.ts (model pricing comments)
#   - chat/route.ts (reader-facing chat, not debate pipeline)
#   - video-service.ts (LTX model names, not AI models)
HARDCODED=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E "(openai|google|xai|anthropic)\(['\"]" "$SRC_DIR" \
  | grep -v 'model-provider\.ts' \
  | grep -v 'pricing\.ts' \
  | grep -v 'video-service\.ts' \
  | grep -v 'node_modules' \
  | grep -v '\.test\.' \
  | grep -v '// ALLOWED:' \
  2>/dev/null || true)

if [ -n "$HARDCODED" ]; then
  echo -e "${YELLOW}⚠ Hardcoded model references found outside model-provider.ts:${NC}"
  echo "$HARDCODED" | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "  ${YELLOW}Consider importing from model-provider.ts instead.${NC}"
  echo -e "  ${YELLOW}If intentional, add '// ALLOWED: <reason>' comment to suppress.${NC}"
  echo ""
fi

# ── Summary ───────────────────────────────────────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}✗ Found $ERRORS deprecated model reference(s). Fix before committing.${NC}"
  echo ""
  echo "  Canonical models (src/lib/arena/model-provider.ts):"
  echo "    Debaters:     openai('gpt-5.4')"
  echo "    Judge:        google('gemini-3.1-pro-preview')"
  echo "    Commentator:  xai('grok-4-1-fast-non-reasoning')"
  echo "    Lightweight:  google('gemini-3-flash-preview')"
  echo "    Poster:       google.image('gemini-3.1-flash-image-preview')"
  echo "    Reader chat:  anthropic('claude-sonnet-4-20250514')"
  exit 1
else
  echo -e "${GREEN}✓ All model references are up to date.${NC}"
  exit 0
fi
