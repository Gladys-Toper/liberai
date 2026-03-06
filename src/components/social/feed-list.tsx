'use client'

import { useState } from 'react'
import { ChevronDown, Rss } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FeedItem } from './feed-item'

interface FeedListProps {
  initialItems: any[]
  initialHasMore: boolean
}

export function FeedList({ initialItems, initialHasMore }: FeedListProps) {
  const [items, setItems] = useState(initialItems)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    setLoading(true)
    try {
      const next = page + 1
      const res = await fetch(`/api/social/feed?page=${next}&limit=20`)
      const data = await res.json()
      setItems((prev) => [...prev, ...(data.items || [])])
      setHasMore(data.hasMore || false)
      setPage(next)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#141414] mb-4">
          <Rss className="h-7 w-7 text-zinc-700" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Your feed is empty</h3>
        <p className="max-w-sm text-sm text-zinc-500">
          Follow authors to see their activity here. Discover new books, ratings, and comments from people you follow.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FeedItem key={item.id} item={item} />
      ))}

      {hasMore && (
        <div className="pt-4 text-center">
          <Button
            variant="ghost"
            disabled={loading}
            onClick={loadMore}
            className="text-zinc-400 hover:text-white"
          >
            <ChevronDown className="mr-1 h-4 w-4" />
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  )
}
