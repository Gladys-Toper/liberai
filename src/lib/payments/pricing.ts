// Per-token pricing in USD per 1M tokens
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  claude: { input: 3.00, output: 15.00 },    // Claude Sonnet 4.6
  openai: { input: 0.15, output: 0.60 },     // GPT-5.3 Instant
  gpt: { input: 0.15, output: 0.60 },         // GPT-5.3 Instant (alias)
  gemini: { input: 1.25, output: 10.00 },     // Gemini 3.1 Pro Preview
  grok: { input: 0.20, output: 0.50 },        // Grok 4.1 Fast (non-reasoning)
}

// Storage: Supabase Storage pricing
export const STORAGE_COST_PER_GB_MONTH = 0.021

// Embeddings: text-embedding-3-small
export const EMBEDDING_COST_PER_1K = 0.00002

/**
 * Calculate the cost of AI token usage.
 * @returns Cost in USD
 */
export function calculateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.gemini
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Calculate daily storage cost for a file.
 * @param fileSizeBytes - File size in bytes
 * @returns Daily cost in USD
 */
export function calculateStorageCost(fileSizeBytes: number): number {
  const sizeGb = fileSizeBytes / (1024 * 1024 * 1024)
  return (sizeGb * STORAGE_COST_PER_GB_MONTH) / 30
}

/**
 * Calculate embedding cost for book chunks.
 * @param chunkCount - Number of chunks embedded
 * @returns One-time embedding cost in USD (amortized daily over 30 days)
 */
export function calculateEmbeddingCost(chunkCount: number): number {
  const totalCost = (chunkCount / 1000) * EMBEDDING_COST_PER_1K
  return totalCost / 30 // amortize over 30 days
}
