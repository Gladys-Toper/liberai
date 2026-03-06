'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bell, Star, UserPlus, MessageCircle, BookOpen, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Notification {
  id: string
  type: string
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  metadata: Record<string, any>
  read: boolean
  created_at: string
  users?: { name: string } | null
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const typeIcons: Record<string, typeof Bell> = {
  new_follower: UserPlus,
  new_rating: Star,
  new_comment: MessageCircle,
  book_milestone: BookOpen,
}

function getNotifText(n: Notification): { text: string; href: string } {
  const name = n.metadata?.actorName || n.users?.name || 'Someone'
  const bookTitle = n.metadata?.bookTitle

  switch (n.type) {
    case 'new_follower':
      return { text: `${name} started following you`, href: `/author/${n.target_id}` }
    case 'new_rating':
      return { text: `${name} rated "${bookTitle}" ${n.metadata?.rating}★`, href: `/book/${n.target_id}` }
    case 'new_comment':
      return {
        text: n.metadata?.isReply
          ? `${name} replied to your comment on "${bookTitle}"`
          : `${name} commented on "${bookTitle}"`,
        href: `/book/${n.target_id}`,
      }
    case 'book_milestone':
      return { text: `"${bookTitle}" reached a new milestone!`, href: `/book/${n.target_id}` }
    default:
      return { text: 'You have a new notification', href: '#' }
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fetch unread count on mount + poll
  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/social/notifications?countOnly=true')
        const data = await res.json()
        setCount(data.count || 0)
      } catch {
        // ignore
      }
    }

    fetchCount()
    const interval = setInterval(fetchCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleOpen() {
    setOpen(!open)
    if (!open && !loaded) {
      try {
        const res = await fetch('/api/social/notifications?limit=15')
        const data = await res.json()
        setNotifications(data.notifications || [])
        setLoaded(true)
      } catch {
        // ignore
      }
    }
  }

  async function markAllRead() {
    try {
      await fetch('/api/social/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setCount(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      // ignore
    }
  }

  async function markRead(ids: string[]) {
    try {
      await fetch('/api/social/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
      })
      setCount((c) => Math.max(0, c - ids.length))
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
      )
    } catch {
      // ignore
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-[#27272a] hover:text-white"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-[#27272a] bg-[#141414] shadow-xl z-50">
          <div className="flex items-center justify-between border-b border-[#27272a] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllRead}
                className="h-7 text-xs text-violet-400 hover:text-violet-300"
              >
                <Check className="mr-1 h-3 w-3" />
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length > 0 ? (
              notifications.map((n) => {
                const { text, href } = getNotifText(n)
                const Icon = typeIcons[n.type] || Bell
                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => {
                      if (!n.read) markRead([n.id])
                      setOpen(false)
                    }}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#1a1a1a] ${
                      !n.read ? 'bg-violet-500/5' : ''
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.read ? 'text-zinc-500' : 'text-zinc-300'}`}>{text}</p>
                      <p className="text-xs text-zinc-600">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                    )}
                  </Link>
                )
              })
            ) : (
              <div className="py-8 text-center text-sm text-zinc-600">No notifications yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
