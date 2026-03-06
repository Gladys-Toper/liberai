import type { CostSnapshot } from '../types'

export interface ICostDataProvider {
  source: string // 'vercel' | 'supabase' | 'ai' etc.

  /** Get the total cost for a given date from this provider */
  getDailyCost(date: Date): Promise<CostSnapshot>
}
