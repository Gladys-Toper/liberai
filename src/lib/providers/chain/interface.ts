import type { TransactionReceipt } from '../types'

export interface IChainProvider {
  chainId: number
  rpcUrl: string
  usdcAddress: string

  /** Get a transaction receipt by hash */
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt>

  /** Build a block explorer URL for an address or tx hash */
  explorerUrl(addressOrTx: string): string
}
