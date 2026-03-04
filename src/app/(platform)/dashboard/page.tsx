import Link from 'next/link';
import { Plus, TrendingUp, MessageSquare, Eye, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { formatNumber, getInitials } from '@/lib/utils';

// Mock data
async function getAuthorAnalytics() {
  return {
    totalReads: 45230,
    totalChats: 12340,
    totalMessages: 34567,
    readsTrend: 12, // percentage
    chatsTrend: 8,
    messagesTrend: 15,
  };
}

async function getAuthorBooks(authorId: string) {
  return [
    {
      id: '1',
      title: 'The Decline and Fall of the Roman Empire',
      published: '2024-01-15',
      reads: 12540,
      chats: 3421,
      messages: 8234,
    },
  ];
}

async function getRecentConversations() {
  return [
    {
      id: '1',
      bookTitle: 'The Decline and Fall of the Roman Empire',
      userName: 'Alex Johnson',
      message: 'What were the main causes of Rome\'s decline?',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      id: '2',
      bookTitle: 'The Decline and Fall of the Roman Empire',
      userName: 'Sarah Chen',
      message: 'How did Christianity affect the empire?',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    },
    {
      id: '3',
      bookTitle: 'The Decline and Fall of the Roman Empire',
      userName: 'Marcus Rivera',
      message: 'Explain the role of barbarian invasions',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  ];
}

function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card className="border-[#27272a] bg-[#141414] p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          <p className="mt-2 flex items-center gap-1 text-sm text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            {trend}% this month
          </p>
        </div>
        <div className={`rounded-lg p-3 ${color}`}>
          {Icon}
        </div>
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const [analytics, books, conversations] = await Promise.all([
    getAuthorAnalytics(),
    getAuthorBooks('a1'),
    getRecentConversations(),
  ]);

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
            value={formatNumber(analytics.totalReads)}
            trend={analytics.readsTrend}
            icon={<Eye className="h-6 w-6 text-white" />}
            color="bg-blue-500/10"
          />
          <StatCard
            label="Total Conversations"
            value={formatNumber(analytics.totalChats)}
            trend={analytics.chatsTrend}
            icon={<MessageSquare className="h-6 w-6 text-white" />}
            color="bg-violet-500/10"
          />
          <StatCard
            label="Total Messages"
            value={formatNumber(analytics.totalMessages)}
            trend={analytics.messagesTrend}
            icon={<MessageSquare className="h-6 w-6 text-white" />}
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
                      <p className="mt-2 text-sm text-zinc-500">
                        Published {new Date(book.published).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex w-full gap-4 sm:w-auto">
                      <div className="text-right">
                        <p className="text-sm text-zinc-500">Reads</p>
                        <p className="text-lg font-semibold text-white">
                          {formatNumber(book.reads)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-zinc-500">Chats</p>
                        <p className="text-lg font-semibold text-white">
                          {formatNumber(book.chats)}
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
                You haven't published any books yet.
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
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {getInitials(conv.userName)}
                          </AvatarFallback>
                        </Avatar>
                        <p className="font-medium text-white">
                          {conv.userName}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-zinc-300">
                        {conv.message}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        About: <span className="text-zinc-400">{conv.bookTitle}</span>
                      </p>
                    </div>
                    <p className="text-xs text-zinc-600 whitespace-nowrap">
                      {new Date(conv.timestamp).toLocaleString()}
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
