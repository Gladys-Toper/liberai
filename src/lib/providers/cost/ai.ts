import type { ICostDataProvider } from './interface'
import type { CostSnapshot } from '../types'
import { MODEL_PRICING } from '@/lib/payments/pricing'

/**
 * AICostProvider calculates AI costs from token usage stored in the database.
 * Unlike other cost providers, this doesn't call external APIs — it reads
 * from chat_messages and calculates costs using known model pricing.
 *
 * The actual per-book attribution is done in the cron job; this provider
 * just returns the total AI spend for a given date across all messages.
 */
export class AICostProvider implements ICostDataProvider {
  source = 'ai' as const

  private supabaseUrl: string
  private supabaseKey: string

  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  }

  async getDailyCost(date: Date): Promise<CostSnapshot> {
    if (!this.supabaseUrl || !this.supabaseKey) {
      return { amount: 0 }
    }

    try {
      const dateStr = date.toISOString().split('T')[0]
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)
      const nextDateStr = nextDate.toISOString().split('T')[0]

      // Query chat_messages for the date range
      const res = await fetch(
        `${this.supabaseUrl}/rest/v1/chat_messages?select=model_used,input_tokens,output_tokens&created_at=gte.${dateStr}&created_at=lt.${nextDateStr}&role=eq.assistant`,
        {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
          },
        },
      )

      if (!res.ok) return { amount: 0 }

      const messages: Array<{
        model_used: string | null
        input_tokens: number | null
        output_tokens: number | null
      }> = await res.json()

      let totalCost = 0
      for (const msg of messages) {
        const model = (msg.model_used || 'gemini') as keyof typeof MODEL_PRICING
        const pricing = MODEL_PRICING[model] || MODEL_PRICING.gemini
        const inputCost = ((msg.input_tokens || 0) / 1_000_000) * pricing.input
        const outputCost = ((msg.output_tokens || 0) / 1_000_000) * pricing.output
        totalCost += inputCost + outputCost
      }

      return { amount: totalCost, raw: { messageCount: messages.length } }
    } catch {
      return { amount: 0 }
    }
  }
}
