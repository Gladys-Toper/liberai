import Link from 'next/link';
import { Star, Twitter, Globe, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { BookCard } from '@/components/book/book-card';
import { formatNumber, getInitials } from '@/lib/utils';

// Mock data
async function getAuthor(id: string) {
  return {
    id: 'a1',
    name: 'Edward Gibbon',
    bio: 'Edward Gibbon (1737-1794) was an English historian and Member of Parliament. His multi-volume work, The Decline and Fall of the Roman Empire, is recognized as one of the greatest historical works ever written. Gibbon\'s scholarly approach and elegant prose have influenced generations of historians.',
    avatar: null,
    verified: true,
    website: 'https://example.com',
    twitter: 'edwardgibbon',
    totalBooks: 1,
    totalReads: 45230,
    totalChats: 12340,
  };
}

async function getBooksByAuthor(authorId: string) {
  return [
    {
      id: '1',
      title: 'The Decline and Fall of the Roman Empire',
      description: 'A monumental historical work examining the collapse of Rome',
      author: { id: 'a1', name: 'Edward Gibbon', avatar: null },
      category: 'History',
      price: 0,
      reads: 12540,
      chats: 3421,
    },
  ];
}

export default async function AuthorPage({
  params,
}: {
  params: { id: string };
}) {
  const [author, books] = await Promise.all([
    getAuthor(params.id),
    getBooksByAuthor(params.id),
  ]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="border-b border-[#27272a] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col items-center text-center">
            <Avatar className="mb-6 h-24 w-24">
              <AvatarImage src={author.avatar} />
              <AvatarFallback className="text-2xl">
                {getInitials(author.name)}
              </AvatarFallback>
            </Avatar>

            <div className="mb-6">
              <h1 className="mb-2 text-4xl font-bold text-white sm:text-5xl">
                {author.name}
                {author.verified && (
                  <Star className="ml-2 inline h-8 w-8 fill-blue-400 text-blue-400" />
                )}
              </h1>
              <p className="text-zinc-400">Historical Writer</p>
            </div>

            <p className="mb-8 max-w-2xl text-lg text-zinc-300">
              {author.bio}
            </p>

            {/* Stats */}
            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <Card className="border-[#27272a] bg-[#141414] p-4 text-center">
                <p className="text-3xl font-bold text-violet-400">
                  {author.totalBooks}
                </p>
                <p className="text-sm text-zinc-500">Book{author.totalBooks !== 1 ? 's' : ''}</p>
              </Card>
              <Card className="border-[#27272a] bg-[#141414] p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">
                  {formatNumber(author.totalReads)}
                </p>
                <p className="text-sm text-zinc-500">Total Reads</p>
              </Card>
              <Card className="border-[#27272a] bg-[#141414] p-4 text-center">
                <p className="text-3xl font-bold text-pink-400">
                  {formatNumber(author.totalChats)}
                </p>
                <p className="text-sm text-zinc-500">Conversations</p>
              </Card>
            </div>

            {/* Social Links */}
            <div className="flex gap-3">
              {author.website && (
                <a
                  href={author.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-[#141414] p-3 text-zinc-400 hover:text-white transition-colors"
                >
                  <Globe className="h-5 w-5" />
                </a>
              )}
              {author.twitter && (
                <a
                  href={`https://twitter.com/${author.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-[#141414] p-3 text-zinc-400 hover:text-white transition-colors"
                >
                  <Twitter className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Books Section */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-8 text-3xl font-bold text-white">
            Books by {author.name}
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
