'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StarRating } from './star-rating'
import { ReviewForm } from './review-form'

interface ReviewsSectionProps {
  bookId: string
  initialAvgRating: number
  initialRatingCount: number
  initialDistribution: Record<string, number>
  isAuthenticated: boolean
  userExistingRating?: number
  userExistingReview?: string
}

interface Rating {
  id: string
  rating: number
  review_text: string | null
  created_at: string
  users: { name: string; avatar_url: string | null } | null
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function ReviewsSection({
  bookId,
  initialAvgRating,
  initialRatingCount,
  initialDistribution,
  isAuthenticated,
  userExistingRating,
  userExistingReview,
}: ReviewsSectionProps) {
  const [ratings, setRatings] = useState<Rating[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(initialRatingCount)
  const [avgRating, setAvgRating] = useState(initialAvgRating)
  const [distribution, setDistribution] = useState(initialDistribution)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const fetchRatings = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/ratings?bookId=${bookId}&page=${p}&limit=10`)
      const data = await res.json()
      if (p === 1) {
        setRatings(data.ratings || [])
      } else {
        setRatings((prev) => [...prev, ...(data.ratings || [])])
      }
      setTotal(data.total || 0)
      if (data.avgRating !== undefined) setAvgRating(data.avgRating)
      if (data.distribution) setDistribution(data.distribution)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    fetchRatings(1)
  }, [fetchRatings])

  function handleReviewSubmitted() {
    setShowForm(false)
    setPage(1)
    fetchRatings(1)
  }

  const maxDistCount = Math.max(...Object.values(distribution), 1)

  return (
    <section className="border-b border-[#27272a] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-6 text-2xl font-bold text-white">Ratings & Reviews</h2>

        {/* Summary */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          {/* Average */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-5xl font-bold text-white">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</p>
              <StarRating value={Math.round(avgRating)} readonly size="sm" />
              <p className="mt-1 text-sm text-zinc-500">{total} {total === 1 ? 'rating' : 'ratings'}</p>
            </div>
          </div>

          {/* Distribution */}
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star] || 0
              const pct = total > 0 ? (count / maxDistCount) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-3 text-zinc-500">{star}</span>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <div className="flex-1 h-2 rounded-full bg-[#27272a] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-zinc-600">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Write Review CTA */}
        {isAuthenticated && !showForm && (
          <Button
            variant="outline"
            onClick={() => setShowForm(true)}
            className="mb-6 border-[#27272a] text-zinc-300 hover:bg-[#1e1e1e]"
          >
            {userExistingRating ? 'Edit Your Review' : 'Write a Review'}
          </Button>
        )}

        {showForm && (
          <Card className="mb-6 border-[#27272a] bg-[#141414] p-6">
            <ReviewForm
              bookId={bookId}
              existingRating={userExistingRating}
              existingReview={userExistingReview}
              onSubmitted={handleReviewSubmitted}
            />
          </Card>
        )}

        {/* Reviews List */}
        {ratings.length > 0 ? (
          <div className="space-y-4">
            {ratings.map((r) => (
              <Card key={r.id} className="border-[#27272a] bg-[#141414] p-5">
                <div className="mb-2 flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-violet-500/20 text-xs text-violet-300">
                      {(r.users?.name || 'U').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{r.users?.name || 'Anonymous'}</p>
                    <p className="text-xs text-zinc-600">{timeAgo(r.created_at)}</p>
                  </div>
                  <StarRating value={r.rating} readonly size="sm" />
                </div>
                {r.review_text && (
                  <p className="text-sm text-zinc-400 leading-relaxed">{r.review_text}</p>
                )}
              </Card>
            ))}

            {ratings.length < total && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  disabled={loading}
                  onClick={() => {
                    const next = page + 1
                    setPage(next)
                    fetchRatings(next)
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  <ChevronDown className="mr-1 h-4 w-4" />
                  {loading ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          !loading && (
            <p className="text-center text-zinc-600 py-8">No reviews yet. Be the first to share your thoughts!</p>
          )
        )}
      </div>
    </section>
  )
}
