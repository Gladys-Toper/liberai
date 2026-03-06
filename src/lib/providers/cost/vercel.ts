import type { ICostDataProvider } from './interface'
import type { CostSnapshot } from '../types'

const FALLBACK_DAILY = (Number(process.env.PLATFORM_INFRA_MONTHLY_COST_USD) || 50) / 30 / 2

export class VercelCostProvider implements ICostDataProvider {
  source = 'vercel' as const

  async getDailyCost(date: Date): Promise<CostSnapshot> {
    const token = process.env.VERCEL_ACCESS_TOKEN
    if (!token) {
      return { amount: FALLBACK_DAILY }
    }

    try {
      const dateStr = date.toISOString().split('T')[0]
      // Vercel billing API (FOCUS v1.3 format)
      const res = await fetch(
        `https://api.vercel.com/v1/billing/charges?startDate=${dateStr}&endDate=${dateStr}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )

      if (!res.ok) {
        return { amount: FALLBACK_DAILY }
      }

      const data = await res.json()
      const totalCost = Array.isArray(data.charges)
        ? data.charges.reduce((sum: number, c: any) => sum + (c.billedCost || 0), 0)
        : 0

      return { amount: totalCost || FALLBACK_DAILY, raw: data }
    } catch {
      return { amount: FALLBACK_DAILY }
    }
  }
}
