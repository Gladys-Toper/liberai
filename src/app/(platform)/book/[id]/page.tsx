import Link from 'next/link';
import { Star, Eye, MessageCircle, BookMarked } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { formatNumber, formatRelativeDate, estimateReadingTime, getInitials } from '@/lib/utils';

// Mock data functions
async function getBook(id: string) {
  const books: Record<string, any> = {
    '1': {
      id: '1',
      title: 'The Decline and Fall of the Roman Empire',
      subtitle: 'Volume I: The History of the Rise and Fall of the Roman Empire',
      description: `Edward Gibbon's masterpiece is a monumental work spanning over a thousand pages. This comprehensive historical narrative examines the collapse of the Western Roman Empire and the rise of Christianity.

Gibbon's elegant prose and scholarly approach to understanding the complex political, social, and religious factors that led to Rome's decline have made this work essential reading for anyone interested in history. The narrative spans from the height of Roman power under the Antonines to the fall of Constantinople.

The Decline and Fall offers not just historical facts, but a deep exploration of human nature, power, governance, and the forces that shape civilizations. Gibbon's analysis of religion's role in Rome's fate remains controversial and discussed today.`,
      author: {
        id: 'a1',
        name: 'Edward Gibbon',
        avatar: null,
        bio: 'Edward Gibbon (1737-1794) was an English historian and Member of Parliament. His multi-volume work is recognized as one of the greatest historical works ever written.',
        verified: true,
      },
      category: 'History',
      tags: ['Ancient Rome', 'History', 'Classical', 'Political History'],
      price: 0,
      reads: 12540,
      chats: 3421,
      cover: null,
      chapters: [
        {
          id: 'ch1',
          title: 'Introduction: The Extent and Military Force of the Roman Empire',
          wordCount: 8234,
          number: 1,
        },
        {
          id: 'ch2',
          title: 'The Governments of the Provinces',
          wordCount: 9876,
          number: 2,
        },
        {
          id: 'ch3',
          title: 'The Systems of the Barbarians',
          wordCount: 10234,
          number: 3,
        },
        {
          id: 'ch4',
          title: 'The Invasion of the Goths',
          wordCount: 7654,
          number: 4,
        },
        {
          id: 'ch5',
          title: 'The Final Years of the Western Empire',
          wordCount: 8765,
          number: 5,
        },
      ],
    },
  };

  return books[id] || books['1'];
}

async function getChapters(bookId: string) {
  const book = await getBook(bookId);
  return book.chapters;
}

async function getBooksByAuthor(authorId: string) {
  return [
    {
      id: '1',
      title: 'The Decline and Fall of the Roman Empire',
      author: { id: 'a1', name: 'Edward Gibbon', avatar: null },
      category: 'History',
      price: 0,
      reads: 12540,
      chats: 3421,
    },
  ];
}

export default async function BookDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [book, chapters, otherBooks] = await Promise.all([
    getBook(params.id),
    getChapters(params.id),
    getBooksByAuthor('a1'),
  ]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="border-b border-[#27272a] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-3">
            {/* Book Cover */}
            <div className="flex items-center justify-center md:col-span-1">
              <div className="relative h-80 w-64 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 p-6 text-center flex items-center justify-center">
                <div className="text-6xl font-bold text-white/20">
                  {book.title.charAt(0)}
                </div>
              </div>
            </div>

            {/* Book Info */}
            <div className="flex flex-col justify-between md:col-span-2">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">{book.category}</Badge>
                  {book.tags?.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="border-[#27272a]">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <h1 className="mb-3 text-4xl font-bold text-white sm:text-5xl">
                  {book.title}
                </h1>

                {book.subtitle && (
                  <p className="mb-4 text-lg text-zinc-400">{book.subtitle}</p>
                )}

                {/* Author Info */}
                <div className="mb-6 flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={book.author.avatar} />
                    <AvatarFallback>{getInitials(book.author.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-white">
                      {book.author.name}
                      {book.author.verified && (
                        <Star className="ml-1 inline h-4 w-4 fill-blue-400 text-blue-400" />
                      )}
                    </p>
                    <p className="text-sm text-zinc-500">Historical Writer</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-6 flex gap-6">
                  <div>
                    <p className="text-sm text-zinc-500">Total Reads</p>
                    <p className="flex items-center gap-1 text-xl font-semibold text-white">
                      <Eye className="h-5 w-5" />
                      {formatNumber(book.reads)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Conversations</p>
                    <p className="flex items-center gap-1 text-xl font-semibold text-white">
                      <MessageCircle className="h-5 w-5" />
                      {formatNumber(book.chats)}
                    </p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-8 flex items-baseline gap-2">
                  {book.price === 0 ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400">Free</Badge>
                  ) : (
                    <span className="text-2xl font-bold text-violet-400">
                      ${book.price.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href={`/book/${book.id}/read`} className="flex-1 sm:flex-none">
                    <Button className="w-full bg-violet-500 hover:bg-violet-600 text-white sm:w-auto">
                      Start Reading
                    </Button>
                  </Link>
                  <Link href={`/book/${book.id}/chat`} className="flex-1 sm:flex-none">
                    <Button variant="outline" className="w-full border-[#27272a] text-white hover:bg-[#141414] sm:w-auto">
                      Talk to this Book
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Description Section */}
      <section className="border-b border-[#27272a] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-2xl font-bold text-white">About This Book</h2>
          <div className="space-y-4 text-zinc-400">
            {book.description.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="border-b border-[#27272a] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-2xl font-bold text-white">Table of Contents</h2>
          <div className="space-y-2">
            {chapters.map((chapter, index) => (
              <Link
                key={chapter.id}
                href={`/book/${book.id}/read#chapter-${chapter.number}`}
                className="block rounded-lg border border-[#27272a] bg-[#141414] p-4 transition-all hover:bg-[#1a1a1a] hover:border-violet-500/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">
                      Chapter {chapter.number}: {chapter.title}
                    </h3>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-zinc-500">
                      {chapter.wordCount.toLocaleString()} words
                    </p>
                    <p className="text-xs text-zinc-600">
                      ~{estimateReadingTime(chapter.wordCount)} min read
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Author Card */}
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Card className="border-[#27272a] bg-[#141414] p-8">
            <div className="mb-4 flex items-start gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={book.author.avatar} />
                <AvatarFallback className="text-lg">
                  {getInitials(book.author.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="mb-1 text-xl font-bold text-white">
                  {book.author.name}
                </h3>
                <p className="text-sm text-zinc-500">Historical Writer</p>
              </div>
            </div>

            <p className="mb-6 text-zinc-400">{book.author.bio}</p>

            {otherBooks.length > 1 && (
              <div>
                <h4 className="mb-3 font-semibold text-white">Other Works</h4>
                <div className="space-y-2">
                  {otherBooks.slice(1).map((b) => (
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
