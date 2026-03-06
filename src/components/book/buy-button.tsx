'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { x402Fetch, getNetworkLabel } from '@/lib/payments/client'

interface BuyButtonProps {
  bookId: string
  price: number
  className?: string
}

export function BuyButton({ bookId, price, className }: BuyButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePurchase() {
    setLoading(true)
    setError(null)

    try {
      const res = await x402Fetch(`/api/books/${bookId}/purchase`)
      const data = await res.json()

      if (data.free || data.purchased || data.author || data.success) {
        router.push(data.readUrl || `/book/${bookId}/read`)
        return
      }

      if (!res.ok) {
        setError(data.error || 'Purchase failed. Please try again.')
      }
    } catch (err: unknown) {
      // x402 paywall was cancelled or wallet error
      const message = err instanceof Error ? err.message : 'Payment failed'
      if (message.toLowerCase().includes('cancel') || message.toLowerCase().includes('rejected')) {
        setError(null) // User cancelled, not an error
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={className}>
      <Button
        onClick={handlePurchase}
        disabled={loading}
        className="w-full bg-violet-500 hover:bg-violet-600 text-white sm:w-auto"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Wallet className="mr-2 h-4 w-4" />
            Buy for ${price.toFixed(2)} USDC
          </>
        )}
      </Button>

      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}

      <p className="mt-2 text-xs text-zinc-600">
        Pay with USDC on {getNetworkLabel()}.{' '}
        <a
          href="https://www.coinbase.com/onramp"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300"
        >
          Need USDC?
        </a>
      </p>
    </div>
  )
}
