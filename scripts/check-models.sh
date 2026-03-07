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
# CANONICAL MODELS (update these when upgrading):
#   GPT:    gpt-5.3
#   Gemini: gemini-3.1-pro  (debate judge/referee/synthesizer)
#   Gemini: gemini-3.1-flash (lightweight tasks, fallback)
#   Grok:   grok-4.1-fast   (commentator)
#   Claude: claude-sonnet-4-20250514
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
DEPRECATED_GEMINI=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E "google\(['\"]gemini-(2\.|1\.5|2\.0|2\.5)" "$SRC_DIR" 2>/dev/null || true)

if [ -n "$DEPRECATED_GEMINI" ]; then
  echo -e "${RED}✗ DEPRECATED Gemini models found:${NC}"
  echo "$DEPRECATED_GEMINI" | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "  ${YELLOW}Fix: Use google('gemini-3.1-pro') for debate/judge or google('gemini-3.1-flash') for lightweight tasks${NC}"
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Deprecated OpenAI models ─────────────────────────────────────────────
DEPRECATED_OPENAI=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E "openai\(['\"]gpt-(4o|4|3\.5|5\.[0-2]|5\.[4-9])" "$SRC_DIR" 2>/dev/null || true)

if [ -n "$DEPRECATED_OPENAI" ]; then
  echo -e "${RED}✗ DEPRECATED OpenAI models found:${NC}"
  echo "$DEPRECATED_OPENAI" | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "  ${YELLOW}Fix: Use openai('gpt-5.3') — the canonical debater model${NC}"
  echo ""
  ERRORS=$((ERRORS + 1))
fi

# ── Deprecated xAI models ────────────────────────────────────────────────
DEPRECATED_GROK=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E "xai\(['\"]grok-(2|3|4\.0)" "$SRC_DIR" 2>/dev/null || true)

if [ -n "$DEPRECATED_GROK" ]; then
  echo -e "${RED}✗ DEPRECATED Grok models found:${NC}"
  echo "$DEPRECATED_GROK" | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "  ${YELLOW}Fix: Use xai('grok-4.1-fast') — the canonical commentator model${NC}"
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
  echo "    Debaters:     openai('gpt-5.3')"
  echo "    Judge:        google('gemini-3.1-pro')"
  echo "    Commentator:  xai('grok-4.1-fast')"
  echo "    Lightweight:  google('gemini-3.1-flash')"
  echo "    Reader chat:  anthropic('claude-sonnet-4-20250514')"
  exit 1
else
  echo -e "${GREEN}✓ All model references are up to date.${NC}"
  exit 0
fi
