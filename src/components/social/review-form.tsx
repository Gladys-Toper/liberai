'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StarRating } from './star-rating'

interface ReviewFormProps {
  bookId: string
  existingRating?: number
  existingReview?: string
  onSubmitted?: () => void
}

export function ReviewForm({ bookId, existingRating, existingReview, onSubmitted }: ReviewFormProps) {
  const [rating, setRating] = useState(existingRating || 0)
  const [reviewText, setReviewText] = useState(existingReview || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) {
      setError('Please select a rating')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/social/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, rating, reviewText: reviewText.trim() || undefined }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to submit review')
        return
      }

      onSubmitted?.()
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">Your Rating</label>
        <StarRating value={rating} onChange={setRating} size="lg" />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          Review <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Share your thoughts about this book..."
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-[#27272a] bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none resize-none"
        />
        <p className="mt-1 text-right text-xs text-zinc-600">{reviewText.length}/2000</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button
        type="submit"
        disabled={submitting || rating === 0}
        className="bg-violet-500 text-white hover:bg-violet-600"
      >
        {submitting ? 'Submitting...' : existingRating ? 'Update Review' : 'Submit Review'}
      </Button>
    </form>
  )
}
