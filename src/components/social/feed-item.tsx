import Link from 'next/link'
import { BookOpen, Star, UserPlus, MessageCircle, RefreshCw } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface FeedItemProps {
  item: {
    id: string
    event_type: string
    actor_id: string
    target_type: string
    target_id: string
    metadata: Record<string, any>
    created_at: string
    users?: { name: string; avatar_url: string | null } | null
  }
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

const eventIcons: Record<string, { icon: typeof BookOpen; color: string; bg: string }> = {
  new_book: { icon: BookOpen, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  new_rating: { icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  new_follow: { icon: UserPlus, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  new_comment: { icon: MessageCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  book_update: { icon: RefreshCw, color: 'text-purple-400', bg: 'bg-purple-500/10' },
}

function getEventText(item: FeedItemProps['item']): { text: string; href: string } {
  const name = item.metadata?.actorName || item.users?.name || 'Someone'
  const bookTitle = item.metadata?.bookTitle

  switch (item.event_type) {
    case 'new_book':
      return { text: `${name} published "${bookTitle}"`, href: `/book/${item.target_id}` }
    case 'new_rating': {
      const stars = '★'.repeat(item.metadata?.rating || 0) + '☆'.repeat(5 - (item.metadata?.rating || 0))
      return { text: `${name} rated "${bookTitle}" ${stars}`, href: `/book/${item.target_id}` }
    }
    case 'new_follow':
      return { text: `${name} started following a new author`, href: `/author/${item.target_id}` }
    case 'new_comment':
      return { text: `${name} commented on "${bookTitle}"`, href: `/book/${item.target_id}` }
    case 'book_update':
      return { text: `${name} updated "${bookTitle}"`, href: `/book/${item.target_id}` }
    default:
      return { text: `${name} did something`, href: '#' }
  }
}

export function FeedItem({ item }: FeedItemProps) {
  const config = eventIcons[item.event_type] || eventIcons.book_update
  const Icon = config.icon
  const { text, href } = getEventText(item)

  return (
    <Link href={href} className="block">
      <div className="flex items-start gap-3 rounded-lg border border-[#27272a] bg-[#141414] p-4 transition-colors hover:border-violet-500/30 hover:bg-[#181818]">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
          <Icon className={`h-4.5 w-4.5 ${config.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-300">{text}</p>
          <p className="mt-1 text-xs text-zinc-600">{timeAgo(item.created_at)}</p>
        </div>
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="bg-violet-500/20 text-[10px] text-violet-300">
            {(item.users?.name || item.metadata?.actorName || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
    </Link>
  )
}
