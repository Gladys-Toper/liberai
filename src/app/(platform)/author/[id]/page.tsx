import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Star, Globe } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { BookCard } from '@/components/book/book-card';
import { formatNumber, getInitials } from '@/lib/utils';
import { getAuthor, getBooksByAuthor } from '@/lib/db/queries';

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const author = await getAuthor(id);

  if (!author) {
    notFound();
  }

  const booksRaw = await getBooksByAuthor(id);

  const books = booksRaw.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description || undefined,
    cover: b.cover_url || undefined,
    author: {
      id: b.authors.id,
      name: b.authors.display_name,
      avatar: b.authors.avatar_url,
    },
    category: b.category,
    price: Number(b.price),
    reads: b.total_reads,
    chats: b.total_chats,
  }));

  const totalReads = booksRaw.reduce((sum, b) => sum + b.total_reads, 0);
  const totalChats = booksRaw.reduce((sum, b) => sum + b.total_chats, 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="border-b border-[#27272a] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col items-center text-center">
            <Avatar className="mb-6 h-24 w-24">
              <AvatarImage src={author.avatar_url ?? undefined} />
              <AvatarFallback className="text-2xl">
                {getInitials(author.display_name)}
              </AvatarFallback>
            </Avatar>

            <div className="mb-6">
              <h1 className="mb-2 text-4xl font-bold text-white sm:text-5xl">
                {author.display_name}
                {author.verified && (
                  <Star className="ml-2 inline h-8 w-8 fill-blue-400 text-blue-400" />
                )}
              </h1>
            </div>

            {author.bio && (
              <p className="mb-8 max-w-2xl text-lg text-zinc-300">
                {author.bio}
              </p>
            )}

            {/* Stats */}
            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <Card className="border-[#27272a] bg-[#141414] p-4 text-center">
                <p className="text-3xl font-bold text-violet-400">
                  {booksRaw.length}
                </p>
                <p className="text-sm text-zinc-500">
                  Book{booksRaw.length !== 1 ? 's' : ''}
                </p>
              </Card>
              <Card className="border-[#27272a] bg-[#141414] p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">
                  {formatNumber(totalReads)}
                </p>
                <p className="text-sm text-zinc-500">Total Reads</p>
              </Card>
              <Card className="border-[#27272a] bg-[#141414] p-4 text-center">
                <p className="text-3xl font-bold text-pink-400">
                  {formatNumber(totalChats)}
                </p>
                <p className="text-sm text-zinc-500">Conversations</p>
              </Card>
            </div>

            {/* Social Links */}
            {author.social_links && Object.keys(author.social_links).length > 0 && (
              <div className="flex gap-3">
                {author.social_links.website && (
                  <a
                    href={author.social_links.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-[#141414] p-3 text-zinc-400 hover:text-white transition-colors"
                  >
                    <Globe className="h-5 w-5" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Books Section */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-8 text-3xl font-bold text-white">
            Books by {author.display_name}
          </h2>

          {books.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-[#27272a] bg-[#141414] py-12 text-center">
              <p className="text-zinc-400">
                No books from this author yet.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
