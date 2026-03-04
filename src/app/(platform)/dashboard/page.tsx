import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, TrendingUp, MessageSquare, Eye, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import {
  getCurrentUser,
  getCurrentAuthor,
  getAuthorDashboardBooks,
  getAuthorRecentConversations,
} from '@/lib/db/queries';
import { AuthorOnboarding } from './author-onboarding';

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card className="border-[#27272a] bg-[#141414] p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className={`rounded-lg p-3 ${color}`}>
          {Icon}
        </div>
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/dashboard');
  }

  const author = await getCurrentAuthor();

  // Logged in but not an author yet — show onboarding
  if (!author) {
    const defaultName = user.user_metadata?.full_name || user.email?.split('@')[0] || '';
    return <AuthorOnboarding defaultName={defaultName} />;
  }

  const [books, conversations] = await Promise.all([
    getAuthorDashboardBooks(author.id),
    getAuthorRecentConversations(author.id),
  ]);

  const totalReads = books.reduce((sum, b) => sum + (b.total_reads || 0), 0);
  const totalChats = books.reduce((sum, b) => sum + (b.total_chats || 0), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              Author Dashboard
            </h1>
            <p className="mt-2 text-zinc-400">
              Manage your books and track reader engagement
            </p>
          </div>
          <Link href="/dashboard/new-book">
            <Button className="bg-violet-500 hover:bg-violet-600 text-white">
              <Plus className="mr-2 h-5 w-5" />
              Add New Book
            </Button>
          </Link>
        </div>

        {/* Analytics Cards */}
        <div className="mb-12 grid gap-6 md:grid-cols-3">
          <StatCard
            label="Total Reads"
            value={formatNumber(totalReads)}
            icon={<Eye className="h-6 w-6 text-white" />}
            color="bg-blue-500/10"
          />
          <StatCard
            label="Total Conversations"
            value={formatNumber(totalChats)}
            icon={<MessageSquare className="h-6 w-6 text-white" />}
            color="bg-violet-500/10"
          />
          <StatCard
            label="Published Books"
            value={String(books.length)}
            icon={<TrendingUp className="h-6 w-6 text-white" />}
            color="bg-pink-500/10"
          />
        </div>

        {/* Books List */}
        <div className="mb-12">
          <h2 className="mb-6 text-2xl font-bold text-white">
            Your Books
          </h2>

          {books.length > 0 ? (
            <div className="space-y-4">
              {books.map((book) => (
                <Card
                  key={book.id}
                  className="border-[#27272a] bg-[#141414] p-6"
                >
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">
                        {book.title}
                      </h3>
                      {book.published_date && (
                        <p className="mt-2 text-sm text-zinc-500">
                          Published {new Date(book.published_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="flex w-full gap-4 sm:w-auto">
                      <div className="text-right">
                        <p className="text-sm text-zinc-500">Reads</p>
                        <p className="text-lg font-semibold text-white">
                          {formatNumber(book.total_reads || 0)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-zinc-500">Chats</p>
                        <p className="text-lg font-semibold text-white">
                          {formatNumber(book.total_chats || 0)}
                        </p>
                      </div>
                    </div>

                    <Link href={`/book/${book.id}`}>
                      <Button
                        variant="outline"
                        className="border-[#27272a] text-zinc-300 hover:text-white hover:bg-[#1a1a1a]"
                      >
                        View Book
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-[#27272a] bg-[#141414] py-12 text-center">
              <p className="mb-4 text-zinc-400">
                You haven&apos;t published any books yet.
              </p>
              <Link href="/dashboard/new-book">
                <Button className="bg-violet-500 hover:bg-violet-600 text-white">
                  Publish Your First Book
                </Button>
              </Link>
            </Card>
          )}
        </div>

        {/* Recent Conversations */}
        <div>
          <h2 className="mb-6 text-2xl font-bold text-white">
            Recent Reader Conversations
          </h2>

          {conversations.length > 0 ? (
            <div className="space-y-3">
              {conversations.map((conv) => (
                <Card
                  key={conv.id}
                  className="border-[#27272a] bg-[#141414] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-white">
                        {conv.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        About: <span className="text-zinc-400">{conv.bookTitle}</span>
                        {' · '}
                        {conv.message_count} message{conv.message_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-600 whitespace-nowrap">
                      {new Date(conv.updated_at).toLocaleString()}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-[#27272a] bg-[#141414] py-8 text-center">
              <p className="text-zinc-400">
                No reader conversations yet.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
