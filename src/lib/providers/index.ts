import type { IPaymentProvider } from './payment/interface'
import type { ISplitProvider } from './splits/interface'
import type { IChainProvider } from './chain/interface'
import type { ICostDataProvider } from './cost/interface'
import type { IStorageProvider } from './storage/interface'

// Singletons
let paymentProvider: IPaymentProvider | null = null
let splitProvider: ISplitProvider | null = null
let chainProvider: IChainProvider | null = null
let costProviders: ICostDataProvider[] | null = null
let storageProvider: IStorageProvider | null = null

export function getPaymentProvider(): IPaymentProvider {
  if (!paymentProvider) {
    const provider = process.env.PAYMENT_PROVIDER || 'x402'
    switch (provider) {
      case 'x402':
      default: {
        const { X402PaymentProvider } = require('./payment/x402')
        paymentProvider = new X402PaymentProvider()
      }
    }
  }
  return paymentProvider!
}

export function getSplitProvider(): ISplitProvider {
  if (!splitProvider) {
    const provider = process.env.SPLIT_PROVIDER || 'oxsplits'
    switch (provider) {
      case 'oxsplits':
      default: {
        const { OxSplitsSplitProvider } = require('./splits/oxsplits')
        splitProvider = new OxSplitsSplitProvider()
      }
    }
  }
  return splitProvider!
}

export function getChainProvider(): IChainProvider {
  if (!chainProvider) {
    const provider = process.env.CHAIN_PROVIDER || 'base'
    switch (provider) {
      case 'base':
      default: {
        const { BaseChainProvider } = require('./chain/base')
        chainProvider = new BaseChainProvider()
      }
    }
  }
  return chainProvider!
}

export function getCostProviders(): ICostDataProvider[] {
  if (!costProviders) {
    const { VercelCostProvider } = require('./cost/vercel')
    const { SupabaseCostProvider } = require('./cost/supabase-cost')
    const { AICostProvider } = require('./cost/ai')
    costProviders = [
      new VercelCostProvider(),
      new SupabaseCostProvider(),
      new AICostProvider(),
    ]
  }
  return costProviders!
}

export function getStorageProvider(): IStorageProvider {
  if (!storageProvider) {
    const provider = process.env.STORAGE_PROVIDER || 'supabase'
    switch (provider) {
      case 'supabase':
      default: {
        const { SupabaseStorageProvider } = require('./storage/supabase-storage')
        storageProvider = new SupabaseStorageProvider()
      }
    }
  }
  return storageProvider!
}

// Re-export interfaces for convenience
export type { IPaymentProvider } from './payment/interface'
export type { ISplitProvider } from './splits/interface'
export type { IChainProvider } from './chain/interface'
export type { ICostDataProvider } from './cost/interface'
export type { IStorageProvider } from './storage/interface'
