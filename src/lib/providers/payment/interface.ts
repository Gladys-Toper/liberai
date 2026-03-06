import type { PaymentRequirements, PaymentVerification } from '../types'

export interface IPaymentProvider {
  /** Build a 402 payment-required response payload */
  createPaymentRequest(
    price: number,
    recipient: string,
    description: string,
  ): PaymentRequirements

  /** Verify an incoming payment proof from the request */
  verifyPayment(request: Request): Promise<PaymentVerification>

  /** Settle the payment on-chain, return tx hash */
  settlePayment(verification: PaymentVerification): Promise<{ txHash: string }>
}
