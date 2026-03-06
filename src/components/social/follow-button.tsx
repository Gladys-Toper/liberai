'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, UserCheck, UserMinus } from 'lucide-react'

interface FollowButtonProps {
  targetUserId: string
  initialIsFollowing: boolean
  initialFollowerCount: number
  showCount?: boolean
}

export function FollowButton({
  targetUserId,
  initialIsFollowing,
  initialFollowerCount,
  showCount = false,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [followerCount, setFollowerCount] = useState(initialFollowerCount)
  const [hovering, setHovering] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    if (loading) return
    setLoading(true)

    const wasFollowing = isFollowing

    // Optimistic update
    setIsFollowing(!wasFollowing)
    setFollowerCount((c) => (wasFollowing ? c - 1 : c + 1))

    try {
      const res = await fetch('/api/social/follow', {
        method: wasFollowing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followingId: targetUserId }),
      })

      if (!res.ok) {
        // Revert on failure
        setIsFollowing(wasFollowing)
        setFollowerCount((c) => (wasFollowing ? c + 1 : c - 1))
      }
    } catch {
      setIsFollowing(wasFollowing)
      setFollowerCount((c) => (wasFollowing ? c + 1 : c - 1))
    } finally {
      setLoading(false)
    }
  }

  if (isFollowing) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={handleToggle}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={
            hovering
              ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15 hover:text-red-400'
              : 'border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/15 hover:text-violet-400'
          }
        >
          {hovering ? (
            <>
              <UserMinus className="mr-1.5 h-3.5 w-3.5" />
              Unfollow
            </>
          ) : (
            <>
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              Following
            </>
          )}
        </Button>
        {showCount && (
          <span className="text-sm text-zinc-500">{followerCount}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={loading}
        onClick={handleToggle}
        className="bg-violet-500 text-white hover:bg-violet-600"
      >
        <UserPlus className="mr-1.5 h-3.5 w-3.5" />
        Follow
      </Button>
      {showCount && (
        <span className="text-sm text-zinc-500">{followerCount}</span>
      )}
    </div>
  )
}
