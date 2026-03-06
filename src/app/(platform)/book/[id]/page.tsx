import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Star, Eye, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { formatNumber, getInitials } from '@/lib/utils';
import { getBook, getChapters, getBooksByAuthor, getCurrentUser, getBookAccessStatus, type BookAccessStatus } from '@/lib/db/queries';
import { BuyButton } from '@/components/book/buy-button';
import { getFollowStatus, getBookRatings, getUserRating } from '@/lib/db/queries/social';
import { FollowButton } from '@/components/social/follow-button';
import { ReviewsSection } from '@/components/social/reviews-section';

function estimateReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 250));
}

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = await getBook(id);

  if (!book) {
    notFound();
  }

  const user = await getCurrentUser();
  const [chapters, otherBooks, accessStatus] = await Promise.all([
    getChapters(id),
    getBooksByAuthor(book.author_id),
    user
      ? getBookAccessStatus(user.id, id)
      : (Number(book.price) === 0 ? 'free' as BookAccessStatus : 'requires_purchase' as BookAccessStatus),
  ]);

  const author = book.authors;
  const canRead = accessStatus !== 'requires_purchase';

  const [followStatus, ratingsData, userRating] = await Promise.all([
    user && author.user_id ? getFollowStatus(user.id, author.user_id) : null,
    getBookRatings(id, 1, 10),
    user ? getUserRating(user.id, id) : null,
  ]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="border-b border-[#27272a] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-3">
            {/* Book Cover */}
            <div className="flex items-center justify-center md:col-span-1">
              {book.cover_url ? (
                <img
                  src={book.cover_url}
                  alt={book.title}
                  className="h-80 w-64 rounded-lg object-cover"
                />
              ) : (
                <div className="relative h-80 w-64 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 p-6 text-center flex items-center justify-center">
                  <div className="text-6xl font-bold text-white/20">
                    {book.title.charAt(0)}
                  </div>
                </div>
              )}
            </div>

            {/* Book Info */}
            <div className="flex flex-col justify-between md:col-span-2">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">{book.category}</Badge>
                  {book.tags?.slice(0, 2).map((tag: string) => (
                    <Badge key={tag} variant="outline" className="border-[#27272a]">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <h1 className="mb-3 text-4xl font-bold text-white sm:text-5xl">
                  {book.title}
                </h1>

                {/* Author Info */}
                <div className="mb-6 flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={author.avatar_url ?? undefined} />
                    <AvatarFallback>{getInitials(author.display_name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <Link
                      href={`/author/${author.id}`}
                      className="font-semibold text-white hover:text-violet-400"
                    >
                      {author.display_name}
                      {author.verified && (
                        <Star className="ml-1 inline h-4 w-4 fill-blue-400 text-blue-400" />
                      )}
                    </Link>
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-6 flex gap-6">
                  <div>
                    <p className="text-sm text-zinc-500">Total Reads</p>
                    <p className="flex items-center gap-1 text-xl font-semibold text-white">
                      <Eye className="h-5 w-5" />
                      {formatNumber(book.total_reads)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Conversations</p>
                    <p className="flex items-center gap-1 text-xl font-semibold text-white">
                      <MessageCircle className="h-5 w-5" />
                      {formatNumber(book.total_chats)}
                    </p>
                  </div>
                  {ratingsData.avgRating > 0 && (
                    <div>
                      <p className="text-sm text-zinc-500">Rating</p>
                      <p className="flex items-center gap-1 text-xl font-semibold text-white">
                        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                        {ratingsData.avgRating.toFixed(1)}
                        <span className="text-sm font-normal text-zinc-500">({ratingsData.total})</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="mb-8 flex items-baseline gap-2">
                  {Number(book.price) === 0 ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400">Free</Badge>
                  ) : (
                    <span className="text-2xl font-bold text-violet-400">
                      ${Number(book.price).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  {canRead ? (
                    <Link href={`/book/${book.id}/read`} className="flex-1 sm:flex-none">
                      <Button className="w-full bg-violet-500 hover:bg-violet-600 text-white sm:w-auto">
                        {accessStatus === 'purchased' ? 'Continue Reading' : 'Start Reading'}
                      </Button>
                    </Link>
                  ) : (
                    <BuyButton bookId={book.id} price={Number(book.price)} />
                  )}
                  {canRead && (
                    <Link href={`/book/${book.id}/chat`} className="flex-1 sm:flex-none">
                      <Button variant="outline" className="w-full border-[#27272a] text-white hover:bg-[#141414] sm:w-auto">
                        Talk to this Book
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Description Section */}
      {book.description && (
        <section className="border-b border-[#27272a] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-4 text-2xl font-bold text-white">About This Book</h2>
            <div className="space-y-4 text-zinc-400">
              {book.description.split('\n\n').map((para: string, i: number) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Table of Contents */}
      {chapters.length > 0 && (
        <section className="border-b border-[#27272a] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-6 text-2xl font-bold text-white">Table of Contents</h2>
            <div className="space-y-2">
              {chapters.map((chapter) => (
                <Link
                  key={chapter.id}
                  href={`/book/${book.id}/read#chapter-${chapter.chapter_number}`}
                  className="block rounded-lg border border-[#27272a] bg-[#141414] p-4 transition-all hover:bg-[#1a1a1a] hover:border-violet-500/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">
                        Chapter {chapter.chapter_number}: {chapter.title}
                      </h3>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm text-zinc-500">
                        {chapter.word_count.toLocaleString()} words
                      </p>
                      <p className="text-xs text-zinc-600">
                        ~{estimateReadingTime(chapter.word_count)} min read
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Ratings & Reviews */}
      <ReviewsSection
        bookId={book.id}
        initialAvgRating={ratingsData.avgRating}
        initialRatingCount={ratingsData.total}
        initialDistribution={ratingsData.distribution}
        isAuthenticated={!!user}
        userExistingRating={userRating?.rating}
        userExistingReview={userRating?.review_text ?? undefined}
      />

      {/* Author Card */}
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Card className="border-[#27272a] bg-[#141414] p-8">
            <div className="mb-4 flex items-start gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={author.avatar_url ?? undefined} />
                <AvatarFallback className="text-lg">
                  {getInitials(author.display_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Link href={`/author/${author.id}`}>
                    <h3 className="mb-1 text-xl font-bold text-white hover:text-violet-400">
                      {author.display_name}
                    </h3>
                  </Link>
                  {followStatus && user?.id !== author.user_id && (
                    <FollowButton
                      targetUserId={author.user_id}
                      initialIsFollowing={followStatus.isFollowing}
                      initialFollowerCount={followStatus.followerCount}
                      showCount
                    />
                  )}
                </div>
              </div>
            </div>

            {author.bio && (
              <p className="mb-6 text-zinc-400">{author.bio}</p>
            )}

            {otherBooks.length > 1 && (
              <div>
                <h4 className="mb-3 font-semibold text-white">Other Works</h4>
                <div className="space-y-2">
                  {otherBooks
                    .filter((b) => b.id !== book.id)
                    .map((b) => (
                      <Link
                        key={b.id}
                        href={`/book/${b.id}`}
                        className="block text-violet-400 hover:text-violet-300"
                      >
                        {b.title}
                      </Link>
                    ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
