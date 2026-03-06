// Shared types for all provider abstractions

export interface Recipient {
  address: string
  percentAllocation: number // basis points (100 = 1%)
}

export interface Balance {
  token: string
  amount: bigint
  formattedAmount: string
}

export interface PaymentRequirements {
  price: string
  recipient: string
  network: string
  token: string
  description: string
  extra?: Record<string, unknown>
}

export interface PaymentVerification {
  valid: boolean
  payer: string
  amount: string
  txHash?: string
  raw?: unknown
}

export interface TransactionReceipt {
  txHash: string
  status: 'success' | 'reverted'
  blockNumber: bigint
  from: string
  to: string
  gasUsed: bigint
}

export interface CostSnapshot {
  amount: number
  raw?: unknown
}
