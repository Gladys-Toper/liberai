import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BookOpen, Eye, MessageCircle, Star, ArrowRight,
  Shield, Globe, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatNumber, getInitials } from '@/lib/utils'
import { getAuthor, getBooksByAuthor, getCurrentUser } from '@/lib/db/queries'
import { getFollowStatus } from '@/lib/db/queries/social'
import { FollowButton } from '@/components/social/follow-button'

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const author = await getAuthor(id)

  if (!author) {
    notFound()
  }

  const [books, currentUser] = await Promise.all([
    getBooksByAuthor(id),
    getCurrentUser(),
  ])

  const followStatus = currentUser && author.user_id
    ? await getFollowStatus(currentUser.id, author.user_id)
    : null
  const publishedBooks = books.filter((b: any) => b.status === 'published')

  const totalReads = books.reduce((sum: number, b: any) => sum + (b.total_reads || 0), 0)
  const totalChats = books.reduce((sum: number, b: any) => sum + (b.total_chats || 0), 0)
  const avgRating = books.length > 0
    ? books.reduce((sum: number, b: any) => sum + (Number(b.average_rating) || 0), 0) / books.length
    : 0

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[#27272a]">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-transparent to-purple-600/5" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-500/5 blur-[100px] rounded-full" />

        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-8">
            {/* Avatar */}
            <div className="relative mb-6 sm:mb-0">
              <Avatar className="h-28 w-28 ring-2 ring-violet-500/20 ring-offset-2 ring-offset-[#0a0a0a]">
                <AvatarImage src={author.avatar_url ?? undefined} />
                <AvatarFallback className="bg-gradient-to-br from-violet-600 to-purple-600 text-3xl font-bold text-white">
                  {getInitials(author.display_name)}
                </AvatarFallback>
              </Avatar>
              {author.verified && (
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 ring-2 ring-[#0a0a0a]">
                  <Shield className="h-3.5 w-3.5 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-center gap-3 sm:justify-start">
                <h1 className="text-3xl font-bold text-white sm:text-4xl">
                  {author.display_name}
                </h1>
                {author.verified && (
                  <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
                    Verified
                  </Badge>
                )}
                {followStatus && currentUser?.id !== author.user_id && (
                  <FollowButton
                    targetUserId={author.user_id}
                    initialIsFollowing={followStatus.isFollowing}
                    initialFollowerCount={followStatus.followerCount}
                  />
                )}
              </div>

              {author.bio && (
                <p className="mb-6 max-w-2xl text-base leading-relaxed text-zinc-400">
                  {author.bio}
                </p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-start">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
                    <BookOpen className="h-4 w-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{publishedBooks.length}</p>
                    <p className="text-[11px] text-zinc-500">{publishedBooks.length === 1 ? 'Book' : 'Books'}</p>
                  </div>
                </div>

                <div className="h-8 w-px bg-[#27272a]" />

                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Eye className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{formatNumber(totalReads)}</p>
                    <p className="text-[11px] text-zinc-500">Total Reads</p>
                  </div>
                </div>

                <div className="h-8 w-px bg-[#27272a]" />

                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                    <MessageCircle className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{formatNumber(totalChats)}</p>
                    <p className="text-[11px] text-zinc-500">AI Chats</p>
                  </div>
                </div>

                {avgRating > 0 && (
                  <>
                    <div className="h-8 w-px bg-[#27272a]" />
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{avgRating.toFixed(1)}</p>
                        <p className="text-[11px] text-zinc-500">Avg Rating</p>
                      </div>
                    </div>
                  </>
                )}

                {followStatus && (
                  <>
                    <div className="h-8 w-px bg-[#27272a]" />
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                        <Users className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{formatNumber(followStatus.followerCount)}</p>
                        <p className="text-[11px] text-zinc-500">Followers</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Social */}
              {author.social_links && Object.keys(author.social_links as Record<string, string>).length > 0 && (
                <div className="mt-4 flex gap-2">
                  {(author.social_links as Record<string, string>).website && (
                    <a
                      href={(author.social_links as Record<string, string>).website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md bg-[#1e1e1e] px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-white"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Website
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Published Books ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Published Works</h2>
          <span className="text-sm text-zinc-500">
            {publishedBooks.length} {publishedBooks.length === 1 ? 'book' : 'books'}
          </span>
        </div>

        {publishedBooks.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {publishedBooks.map((book: any) => (
              <Link key={book.id} href={`/book/${book.id}`}>
                <Card className="group relative overflow-hidden border-[#27272a] bg-[#141414] transition-all duration-300 hover:border-violet-500/40 hover:bg-[#181818]">
                  {/* Cover */}
                  <div className="relative h-48 overflow-hidden">
                    {book.cover_url ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600/30 to-purple-600/20">
                        <span className="text-6xl font-bold text-white/10">
                          {book.title.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline" className="border-[#27272a] text-xs">
                        {book.category}
                      </Badge>
                      {Number(book.price) === 0 && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 text-xs">Free</Badge>
                      )}
                    </div>

                    <h3 className="mb-2 text-lg font-semibold text-white group-hover:text-violet-300 transition-colors">
                      {book.title}
                    </h3>

                    {book.description && (
                      <p className="mb-4 text-sm text-zinc-500 line-clamp-2">
                        {book.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {formatNumber(book.total_reads || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {formatNumber(book.total_chats || 0)}
                      </span>
                      {Number(book.average_rating) > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {Number(book.average_rating).toFixed(1)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Button size="sm" className="flex-1 bg-violet-500 text-white hover:bg-violet-600">
                        Read Now
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="border-[#27272a] text-zinc-300 hover:bg-[#1e1e1e]">
                        Chat with AI
                      </Button>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="border-[#27272a] bg-[#141414] py-16 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-zinc-700" />
            <p className="mt-4 text-zinc-500">No published books yet.</p>
          </Card>
        )}
      </section>
    </div>
  )
}
