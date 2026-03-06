import { SplitsClient } from '@0xsplits/splits-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'
import type { ISplitProvider } from './interface'
import type { Recipient, Balance } from '../types'

const IS_TESTNET = process.env.NEXT_PUBLIC_X402_NETWORK === 'eip155:84532'

function getChain() {
  return IS_TESTNET ? baseSepolia : base
}

function getRpcUrl() {
  return IS_TESTNET ? 'https://sepolia.base.org' : 'https://mainnet.base.org'
}

function getSplitsClient(): SplitsClient {
  const chain = getChain()
  const rpcUrl = getRpcUrl()

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as any

  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY
  let walletClient: any = undefined

  if (privateKey) {
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    })
  }

  return new SplitsClient({
    chainId: chain.id,
    publicClient,
    walletClient,
  })
}

export class OxSplitsSplitProvider implements ISplitProvider {
  async createSplit(
    recipients: Recipient[],
    controller?: string,
  ): Promise<{ address: string }> {
    const client = getSplitsClient()

    const splitRecipients = recipients.map(r => ({
      address: r.address as `0x${string}`,
      percentAllocation: r.percentAllocation / 100,
    }))

    // createSplit handles tx submission + receipt internally
    const result = await client.splitV2.createSplit({
      recipients: splitRecipients,
      distributorFeePercent: 0,
      ownerAddress: (controller || process.env.PLATFORM_WALLET_ADDRESS) as `0x${string}`,
      splitType: 'pull' as any,
    }) as any

    const splitAddress = result?.splitAddress || result?.event?.args?.split || ''

    return { address: splitAddress }
  }

  async updateSplit(
    splitAddress: string,
    recipients: Recipient[],
  ): Promise<{ txHash: string }> {
    const client = getSplitsClient()

    const splitRecipients = recipients.map(r => ({
      address: r.address as `0x${string}`,
      percentAllocation: r.percentAllocation / 100,
    }))

    const result = await client.splitV2.updateSplit({
      splitAddress: splitAddress as `0x${string}`,
      recipients: splitRecipients,
      distributorFeePercent: 0,
    }) as any

    return { txHash: result?.txHash || result?.hash || '' }
  }

  async distribute(
    splitAddress: string,
    token: string,
  ): Promise<{ txHash: string }> {
    const client = getSplitsClient()

    try {
      const balance = await client.splitV2.getSplitBalance({
        splitAddress: splitAddress as `0x${string}`,
        tokenAddress: token as `0x${string}`,
      })

      if (!balance.splitBalance && !balance.warehouseBalance) {
        return { txHash: '' }
      }
    } catch {
      // Balance check failed, try distribute anyway
    }

    // 0xSplits v2 uses pull-based distribution — recipients withdraw directly.
    // No server-side distribute call needed.
    return { txHash: '' }
  }

  async getBalances(splitAddress: string): Promise<Balance[]> {
    const client = getSplitsClient()
    const usdcAddress = process.env.BASE_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

    try {
      const balance = await client.splitV2.getSplitBalance({
        splitAddress: splitAddress as `0x${string}`,
        tokenAddress: usdcAddress as `0x${string}`,
      })

      const total = (balance.splitBalance || BigInt(0)) + (balance.warehouseBalance || BigInt(0))

      if (total === BigInt(0)) return []

      return [{
        token: usdcAddress,
        amount: total,
        formattedAmount: (Number(total) / 1e6).toFixed(2), // USDC has 6 decimals
      }]
    } catch {
      return []
    }
  }
}
