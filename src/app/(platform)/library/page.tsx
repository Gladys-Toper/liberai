import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials, formatNumber } from '@/lib/utils';

// Mock data
async function getUserLibrary() {
  return [
    {
      id: '1',
      title: 'The Decline and Fall of the Roman Empire',
      author: { id: 'a1', name: 'Edward Gibbon', avatar: null },
      progress: 65,
      lastRead: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    },
    {
      id: '2',
      title: 'Thinking, Fast and Slow',
      author: { id: 'a3', name: 'Daniel Kahneman', avatar: null },
      progress: 42,
      lastRead: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    },
    {
      id: '5',
      title: 'Sapiens',
      author: { id: 'a5', name: 'Yuval Noah Harari', avatar: null },
      progress: 88,
      lastRead: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    },
  ];
}

export default async function LibraryPage() {
  const books = await getUserLibrary();

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            My Library
          </h1>
          <p className="mt-2 text-zinc-400">
            Books you're reading and want to explore
          </p>
        </div>

        {books.length > 0 ? (
          <>
            {/* Reading Now Section */}
            <div className="mb-12">
              <h2 className="mb-6 text-xl font-semibold text-white">
                Currently Reading
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {books.map((book) => (
                  <Card
                    key={book.id}
                    className="group border-[#27272a] bg-[#141414] overflow-hidden transition-all hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/10"
                  >
                    <div className="relative h-48 overflow-hidden bg-gradient-to-br from-violet-600 to-purple-600">
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-6xl font-bold text-white/20">
                          {book.title.charAt(0)}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Title and Author */}
                      <div>
                        <h3 className="line-clamp-2 font-semibold text-white mb-2">
                          {book.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={book.author.avatar} />
                            <AvatarFallback className="text-xs">
                              {getInitials(book.author.name)}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-sm text-zinc-400">
                            {book.author.name}
                          </p>
                        </div>
                      </div>

                      {/* Progress */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm text-zinc-400">
                            Progress
                          </p>
                          <p className="text-sm font-semibold text-violet-400">
                            {book.progress}%
                          </p>
                        </div>
                        <Progress value={book.progress} className="h-2" />
                      </div>

                      {/* Continue Reading Button */}
                      <Link href={`/book/${book.id}/read`}>
                        <Button
                          className="w-full bg-violet-500 hover:bg-violet-600 text-white"
                        >
                          Continue Reading
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>

                      {/* Chat Button */}
                      <Link href={`/book/${book.id}/chat`}>
                        <Button
                          variant="outline"
                          className="w-full border-[#27272a] text-white hover:bg-[#1a1a1a]"
                        >
                          Talk to Book
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Explore More CTA */}
            <div className="rounded-lg border border-[#27272a] bg-[#141414] p-8 text-center">
              <h3 className="mb-3 text-xl font-semibold text-white">
                Discover More Books
              </h3>
              <p className="mb-6 text-zinc-400">
                Explore our library of thousands of books and find your next great read.
              </p>
              <Link href="/marketplace">
                <Button className="bg-violet-500 hover:bg-violet-600 text-white">
                  Browse All Books
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-[#27272a] bg-[#141414] py-16 text-center">
            <h2 className="mb-2 text-xl font-semibold text-white">
              Your library is empty
            </h2>
            <p className="mb-6 text-zinc-400">
              Start exploring books to build your personal library.
            </p>
            <Link href="/marketplace">
              <Button className="bg-violet-500 hover:bg-violet-600 text-white">
                Explore Books
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
