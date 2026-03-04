import Link from 'next/link';
import { Eye, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { formatNumber, getInitials, truncate } from '@/lib/utils';

interface BookWithAuthor {
  id: string;
  title: string;
  description?: string;
  cover?: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  category?: string;
  price?: number;
  reads?: number;
  chats?: number;
}

interface BookCardProps {
  book: BookWithAuthor;
}

export function BookCard({ book }: BookCardProps) {
  // Generate a gradient based on the category or title
  const gradientOptions = [
    'from-violet-600 to-purple-600',
    'from-blue-600 to-cyan-600',
    'from-amber-600 to-orange-600',
    'from-emerald-600 to-teal-600',
    'from-pink-600 to-rose-600',
    'from-indigo-600 to-blue-600',
  ];
  const gradientIndex = book.title.charCodeAt(0) % gradientOptions.length;
  const gradient = gradientOptions[gradientIndex];

  return (
    <Link href={`/book/${book.id}`}>
      <Card className="group overflow-hidden border-[#27272a] bg-[#141414] transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-violet-500/20 cursor-pointer h-full flex flex-col">
        {/* Cover Image Area */}
        <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${gradient}`}>
          {book.cover ? (
            <img
              src={book.cover}
              alt={book.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-6xl font-bold text-white/20">
                {book.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          {/* Title and Category */}
          <div className="flex-1">
            <h3 className="mb-1 line-clamp-2 text-base font-semibold text-white">
              {truncate(book.title, 50)}
            </h3>
            {book.category && (
              <Badge variant="secondary" className="mb-2 w-fit text-xs">
                {book.category}
              </Badge>
            )}
          </div>

          {/* Author */}
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={book.author.avatar} />
              <AvatarFallback className="text-xs">
                {getInitials(book.author.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-zinc-400">
              {truncate(book.author.name, 20)}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              <span>{formatNumber(book.reads || 0)}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              <span>{formatNumber(book.chats || 0)}</span>
            </div>
          </div>

          {/* Price */}
          <div className="pt-2 border-t border-[#27272a]">
            {book.price === 0 || !book.price ? (
              <Badge variant="outline" className="w-fit text-xs">
                Free
              </Badge>
            ) : (
              <span className="text-sm font-semibold text-violet-400">
                ${book.price.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
