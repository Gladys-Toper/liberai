import type { Recipient, Balance } from '../types'

export interface ISplitProvider {
  /** Create a new split contract. Controller can call updateSplit. */
  createSplit(
    recipients: Recipient[],
    controller?: string,
  ): Promise<{ address: string }>

  /** Update split percentages (only callable by controller) */
  updateSplit(
    splitAddress: string,
    recipients: Recipient[],
  ): Promise<{ txHash: string }>

  /** Distribute accumulated funds from the split contract */
  distribute(
    splitAddress: string,
    token: string,
  ): Promise<{ txHash: string }>

  /** Query undistributed balances */
  getBalances(splitAddress: string): Promise<Balance[]>
}
