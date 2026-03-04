'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { BookCard } from '@/components/book/book-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BookItem {
  id: string;
  title: string;
  description?: string;
  cover?: string;
  author: { id: string; name: string; avatar: string | null };
  category: string;
  price: number;
  reads: number;
  chats: number;
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'price-asc', label: 'Price: Low → High' },
  { value: 'price-desc', label: 'Price: High → Low' },
  { value: 'chats', label: 'Most Chats' },
];

export function MarketplaceClient({
  books,
  categories,
}: {
  books: BookItem[];
  categories: { id: string; name: string }[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const filteredBooks = useMemo(() => {
    let result = books;

    if (selectedCategory !== 'all') {
      result = result.filter(
        (book) => book.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (book) =>
          book.title.toLowerCase().includes(query) ||
          book.author.name.toLowerCase().includes(query) ||
          (book.description?.toLowerCase().includes(query) ?? false)
      );
    }

    const sorted = [...result];
    switch (sortBy) {
      case 'price-asc':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'popular':
        sorted.sort((a, b) => b.reads - a.reads);
        break;
      case 'chats':
        sorted.sort((a, b) => b.chats - a.chats);
        break;
    }

    return sorted;
  }, [books, searchQuery, selectedCategory, sortBy]);

  const allCategories = [{ id: 'all', name: 'All' }, ...categories];

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Explore Books
          </h1>
          <p className="mt-2 text-zinc-400">
            Discover thousands of books and talk to them with AI
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Search by title, author, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-[#27272a] bg-[#141414] pl-10 text-white placeholder:text-zinc-600 focus:border-violet-500"
            />
          </div>
        </div>

        {/* Filters and Sort */}
        <div className="mb-8 space-y-4">
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-300">Category</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
              {allCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id === 'all' ? 'all' : category.name)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    (selectedCategory === 'all' && category.id === 'all') ||
                    selectedCategory === category.name
                      ? 'bg-violet-500 text-white'
                      : 'border border-[#27272a] bg-[#141414] text-zinc-300 hover:text-white'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Sort By
              </label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="border-[#27272a] bg-[#141414] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#27272a] bg-[#141414]">
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm text-zinc-400">
            <span className="font-semibold text-white">{filteredBooks.length}</span> book
            {filteredBooks.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {filteredBooks.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-[#27272a] bg-[#141414] py-12 text-center">
            <p className="text-zinc-400">
              No books found. Try adjusting your search or filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
