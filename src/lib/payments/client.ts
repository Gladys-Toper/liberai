'use client'

/**
 * Client-side x402 payment utility.
 * Wraps fetch with automatic 402 payment handling.
 *
 * The x402 client requires a wallet signer which is only available
 * at runtime when the user connects their wallet. We export a factory
 * that creates a pre-configured fetch wrapper on demand.
 */

import { wrapFetchWithPayment, x402Client } from '@x402/fetch'

const NETWORK = process.env.NEXT_PUBLIC_X402_NETWORK || 'eip155:8453'

let cachedFetch: typeof fetch | null = null

/**
 * Create an x402-enabled fetch wrapper.
 * Handles 402 responses by prompting wallet payment.
 *
 * For the initial integration, we use a simple approach:
 * the payment flow is handled server-side via the purchase API,
 * so the client just needs to call the purchase endpoint.
 * The actual x402 protocol negotiation happens between the server
 * and the x402 facilitator.
 */
export async function x402Fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // For now, use standard fetch — the purchase endpoint handles
  // the x402 protocol server-side. When client-side x402 paywall
  // is integrated (requiring wallet connect), this will wrap with
  // wrapFetchWithPayment using the connected wallet's signer.
  return fetch(input, init)
}

/**
 * Get the network label for display.
 */
export function getNetworkLabel(): string {
  return NETWORK === 'eip155:84532' ? 'Base Sepolia (Testnet)' : 'Base'
}
