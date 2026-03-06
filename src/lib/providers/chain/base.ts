import { createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import type { IChainProvider } from './interface'
import type { TransactionReceipt } from '../types'

const IS_TESTNET = process.env.NEXT_PUBLIC_X402_NETWORK === 'eip155:84532'

export class BaseChainProvider implements IChainProvider {
  get chainId() {
    return IS_TESTNET ? baseSepolia.id : base.id
  }

  get rpcUrl() {
    return IS_TESTNET ? 'https://sepolia.base.org' : 'https://mainnet.base.org'
  }

  get usdcAddress() {
    return IS_TESTNET
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
      : (process.env.BASE_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
  }

  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    const chain = IS_TESTNET ? baseSepolia : base
    const client = createPublicClient({
      chain,
      transport: http(this.rpcUrl),
    })

    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    })

    return {
      txHash: receipt.transactionHash,
      status: receipt.status === 'success' ? 'success' : 'reverted',
      blockNumber: receipt.blockNumber,
      from: receipt.from,
      to: receipt.to || '',
      gasUsed: receipt.gasUsed,
    }
  }

  explorerUrl(addressOrTx: string): string {
    const baseUrl = IS_TESTNET
      ? 'https://sepolia.basescan.org'
      : 'https://basescan.org'

    // Tx hashes are 66 chars (0x + 64 hex), addresses are 42 chars (0x + 40 hex)
    const type = addressOrTx.length === 66 ? 'tx' : 'address'
    return `${baseUrl}/${type}/${addressOrTx}`
  }
}
