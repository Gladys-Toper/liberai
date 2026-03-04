import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, Upload, Brain, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookCard } from '@/components/book/book-card';
import { Skeleton } from '@/components/ui/skeleton';

// Mock data functions (replace with actual DB calls)
async function getFeaturedBooks() {
  // This would call: import { getFeaturedBooks } from '@/lib/db';
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
    {
      id: '2',
      title: 'A Brief History of Time',
      description: 'From the Big Bang to Black Holes',
      author: { id: 'a2', name: 'Stephen Hawking', avatar: null },
      category: 'Science',
      price: 0,
      reads: 8932,
      chats: 2156,
    },
    {
      id: '3',
      title: 'Thinking, Fast and Slow',
      description: 'Insights into the psychology of decision-making',
      author: { id: 'a3', name: 'Daniel Kahneman', avatar: null },
      category: 'Psychology',
      price: 14.99,
      reads: 15234,
      chats: 4567,
    },
    {
      id: '4',
      title: 'The Origins of Species',
      description: 'The foundation of evolutionary theory',
      author: { id: 'a4', name: 'Charles Darwin', avatar: null },
      category: 'Science',
      price: 0,
      reads: 7654,
      chats: 1899,
    },
    {
      id: '5',
      title: 'Sapiens',
      description: 'A brief history of humankind',
      author: { id: 'a5', name: 'Yuval Noah Harari', avatar: null },
      category: 'History',
      price: 18.99,
      reads: 18765,
      chats: 5432,
    },
    {
      id: '6',
      title: 'The Wealth of Nations',
      description: 'An inquiry into the nature and causes',
      author: { id: 'a6', name: 'Adam Smith', avatar: null },
      category: 'Economics',
      price: 12.99,
      reads: 6543,
      chats: 1234,
    },
  ];
}

async function getCategories() {
  // This would call: import { getCategories } from '@/lib/db';
  return [
    { id: 'history', name: 'History' },
    { id: 'science', name: 'Science' },
    { id: 'psychology', name: 'Psychology' },
    { id: 'philosophy', name: 'Philosophy' },
    { id: 'economics', name: 'Economics' },
    { id: 'biography', name: 'Biography' },
    { id: 'fiction', name: 'Fiction' },
    { id: 'technology', name: 'Technology' },
  ];
}

function BookCardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full rounded-lg bg-[#27272a]" />
      <Skeleton className="h-4 w-3/4 rounded bg-[#27272a]" />
      <Skeleton className="h-4 w-1/2 rounded bg-[#27272a]" />
    </div>
  );
}

export default async function HomePage() {
  const [featuredBooks, categories] = await Promise.all([
    getFeaturedBooks(),
    getCategories(),
  ]);

  return (
    <div className="bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
        {/* Animated Gradient Orb Background */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/10 blur-3xl" />
          <div className="absolute -right-40 -bottom-40 h-80 w-80 rounded-full bg-gradient-to-bl from-blue-500/20 to-cyan-500/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Talk to{' '}
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Books
            </span>
          </h1>
          <p className="mb-8 text-lg text-zinc-400 sm:text-xl">
            The AI-native publishing platform where every book becomes a conversation.
            Ask questions, explore ideas, and engage with literature like never before.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/marketplace">
              <Button
                size="lg"
                className="w-full bg-violet-500 hover:bg-violet-600 text-white sm:w-auto"
              >
                Explore Books
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/author/dashboard">
              <Button
                size="lg"
                variant="outline"
                className="w-full border-[#27272a] text-white hover:bg-[#141414] sm:w-auto"
              >
                Publish Your Book
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Books Section */}
      <section className="border-y border-[#27272a] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Featured Books
            </h2>
            <p className="mt-2 text-zinc-400">
              Discover our most popular and engaging titles
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Suspense fallback={Array.from({ length: 6 }).map((_, i) => (
              <BookCardSkeleton key={i} />
            ))}>
              {featuredBooks.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </Suspense>
          </div>

          <div className="mt-12 text-center">
            <Link href="/marketplace">
              <Button variant="outline" className="border-[#27272a] text-white hover:bg-[#141414]">
                View All Books
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-8 text-3xl font-bold text-white sm:text-4xl">
            Browse by Category
          </h2>

          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/marketplace?category=${category.id}`}
                className="shrink-0"
              >
                <Badge
                  variant="outline"
                  className="cursor-pointer border-[#27272a] px-4 py-2 text-sm text-zinc-300 hover:bg-[#141414] hover:text-violet-400 transition-all"
                >
                  {category.name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-y border-[#27272a] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-white sm:text-4xl">
            How It Works
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Upload,
                title: 'Upload Your Book',
                description:
                  'Authors publish their work to our platform in minutes with full control over pricing and distribution.',
              },
              {
                icon: Brain,
                title: 'AI Learns Your Content',
                description:
                  'Our AI system deeply understands your book, ready to answer questions and discuss themes.',
              },
              {
                icon: MessageSquare,
                title: 'Readers Converse',
                description:
                  'Readers ask questions, explore ideas, and engage directly with the content in real-time.',
              },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="rounded-lg border border-[#27272a] bg-[#141414] p-8">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-3 text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="text-zinc-400">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
            Ready to Transform Publishing?
          </h2>
          <p className="mb-8 text-lg text-zinc-400">
            Join thousands of readers and authors already using LiberAi to revolutionize
            how we engage with books.
          </p>
          <Link href="/marketplace">
            <Button size="lg" className="bg-violet-500 hover:bg-violet-600 text-white">
              Start Exploring
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
