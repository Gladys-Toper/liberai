import type { IPaymentProvider } from './interface'
import type { PaymentRequirements, PaymentVerification } from '../types'

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.coinbase.com'
const NETWORK = process.env.NEXT_PUBLIC_X402_NETWORK || 'eip155:8453'
const USDC_ADDRESS = process.env.BASE_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

export class X402PaymentProvider implements IPaymentProvider {
  createPaymentRequest(
    price: number,
    recipient: string,
    description: string,
  ): PaymentRequirements {
    // x402 prices are in the token's smallest unit (USDC = 6 decimals)
    const amountInMicroUsdc = Math.round(price * 1_000_000).toString()

    return {
      price: amountInMicroUsdc,
      recipient,
      network: NETWORK,
      token: USDC_ADDRESS,
      description,
      extra: {
        facilitatorUrl: FACILITATOR_URL,
        scheme: 'exact',
        x402Version: 2,
      },
    }
  }

  async verifyPayment(request: Request): Promise<PaymentVerification> {
    const paymentHeader = request.headers.get('x-payment') || request.headers.get('X-PAYMENT')

    if (!paymentHeader) {
      return { valid: false, payer: '', amount: '0' }
    }

    try {
      // Verify via the x402 facilitator
      const res = await fetch(`${FACILITATOR_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentPayload: paymentHeader }),
      })

      if (!res.ok) {
        return { valid: false, payer: '', amount: '0' }
      }

      const data = await res.json()
      return {
        valid: data.valid === true,
        payer: data.payer || '',
        amount: data.amount || '0',
        txHash: data.txHash,
        raw: data,
      }
    } catch (e) {
      console.error('[x402] Verification failed:', e)
      return { valid: false, payer: '', amount: '0' }
    }
  }

  async settlePayment(verification: PaymentVerification): Promise<{ txHash: string }> {
    if (!verification.valid || !verification.raw) {
      throw new Error('Cannot settle invalid payment')
    }

    try {
      const res = await fetch(`${FACILITATOR_URL}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentPayload: verification.raw }),
      })

      if (!res.ok) {
        throw new Error(`Settlement failed: ${res.status}`)
      }

      const data = await res.json()
      return { txHash: data.txHash || verification.txHash || '' }
    } catch (e) {
      console.error('[x402] Settlement failed:', e)
      // If we already have a txHash from verification, use that
      if (verification.txHash) {
        return { txHash: verification.txHash }
      }
      throw e
    }
  }
}
