'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BookCard } from '@/components/book/book-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Mock data
const MOCK_BOOKS = [
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
  {
    id: '7',
    title: 'Critique of Pure Reason',
    description: 'Foundational work of modern philosophy',
    author: { id: 'a7', name: 'Immanuel Kant', avatar: null },
    category: 'Philosophy',
    price: 15.99,
    reads: 4321,
    chats: 890,
  },
  {
    id: '8',
    title: 'The Second Sex',
    description: 'A landmark feminist philosophical work',
    author: { id: 'a8', name: 'Simone de Beauvoir', avatar: null },
    category: 'Philosophy',
    price: 16.99,
    reads: 5678,
    chats: 1456,
  },
];

const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'history', name: 'History' },
  { id: 'science', name: 'Science' },
  { id: 'psychology', name: 'Psychology' },
  { id: 'philosophy', name: 'Philosophy' },
  { id: 'economics', name: 'Economics' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'price-asc', label: 'Price: Low → High' },
  { value: 'price-desc', label: 'Price: High → Low' },
  { value: 'chats', label: 'Most Chats' },
];

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const filteredBooks = useMemo(() => {
    let books = MOCK_BOOKS;

    // Filter by category
    if (selectedCategory !== 'all') {
      books = books.filter(
        (book) => book.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      books = books.filter(
        (book) =>
          book.title.toLowerCase().includes(query) ||
          book.author.name.toLowerCase().includes(query) ||
          book.description.toLowerCase().includes(query)
      );
    }

    // Sort
    const sorted = [...books];
    switch (sortBy) {
      case 'price-asc':
        sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-desc':
        sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'popular':
        sorted.sort((a, b) => (b.reads || 0) - (a.reads || 0));
        break;
      case 'chats':
        sorted.sort((a, b) => (b.chats || 0) - (a.chats || 0));
        break;
      case 'newest':
      default:
        // Keep original order
        break;
    }

    return sorted;
  }, [searchQuery, selectedCategory, sortBy]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
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
          {/* Category Filter */}
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-300">Category</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    selectedCategory === category.id
                      ? 'bg-violet-500 text-white'
                      : 'border border-[#27272a] bg-[#141414] text-zinc-300 hover:text-white'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Dropdown */}
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

        {/* Results Info */}
        <div className="mb-6">
          <p className="text-sm text-zinc-400">
            <span className="font-semibold text-white">{filteredBooks.length}</span> book
            {filteredBooks.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {/* Books Grid */}
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
