import { redirect } from 'next/navigation'
import { Rss } from 'lucide-react'
import { getCurrentUser } from '@/lib/db/queries'
import { getFeedForUser } from '@/lib/db/queries/social'
import { FeedList } from '@/components/social/feed-list'

export default async function FeedPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  const { items, hasMore } = await getFeedForUser(user.id, 1, 20)

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
            <Rss className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Activity Feed</h1>
            <p className="text-sm text-zinc-500">Updates from authors you follow</p>
          </div>
        </div>

        <FeedList initialItems={items} initialHasMore={hasMore} />
      </div>
    </div>
  )
}
