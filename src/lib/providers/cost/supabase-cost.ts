import type { ICostDataProvider } from './interface'
import type { CostSnapshot } from '../types'

const FALLBACK_DAILY = (Number(process.env.PLATFORM_INFRA_MONTHLY_COST_USD) || 50) / 30 / 2
const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
  /https:\/\/([^.]+)\.supabase/,
)?.[1]

export class SupabaseCostProvider implements ICostDataProvider {
  source = 'supabase' as const

  async getDailyCost(date: Date): Promise<CostSnapshot> {
    const token = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!token || !PROJECT_REF) {
      return { amount: FALLBACK_DAILY }
    }

    try {
      // Supabase usage API
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/usage`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (!res.ok) {
        return { amount: FALLBACK_DAILY }
      }

      const data = await res.json()
      // Supabase returns monthly usage; approximate daily fraction
      const monthlyCost = data?.total_cost || data?.cost || 0
      const dailyCost = monthlyCost / 30

      return { amount: dailyCost || FALLBACK_DAILY, raw: data }
    } catch {
      return { amount: FALLBACK_DAILY }
    }
  }
}
