'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Search, Menu, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const navLinks = [
    { href: '/marketplace', label: 'Explore', icon: null },
    { href: '/library', label: 'Library', icon: null },
    { href: '/author/dashboard', label: 'For Authors', icon: null },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="sticky top-0 z-50 border-b border-[#27272a] bg-[#0a0a0a]/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <span className="hidden font-bold text-white sm:inline">
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                LiberAi
              </span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors',
                  isActive(link.href)
                    ? 'text-violet-400'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Search Bar */}
          <div className="hidden flex-1 items-center justify-center gap-2 px-4 sm:flex md:max-w-xs">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search books..."
                className="border-[#27272a] bg-[#141414] pl-10 text-white placeholder:text-zinc-600 focus:border-violet-500"
              />
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {/* Mobile Search Toggle */}
            <button
              onClick={() => setSearchExpanded(!searchExpanded)}
              className="md:hidden text-zinc-400 hover:text-white transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* User Avatar Dropdown */}
            <div className="hidden items-center gap-2 sm:flex">
              <Avatar className="h-8 w-8">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback>AK</AvatarFallback>
              </Avatar>
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-zinc-400 hover:text-white transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Search */}
        {searchExpanded && (
          <div className="border-t border-[#27272a] py-3 md:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search books..."
                className="border-[#27272a] bg-[#141414] pl-10 text-white placeholder:text-zinc-600 focus:border-violet-500"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="border-t border-[#27272a] py-3 md:hidden">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-3 py-2 text-sm font-medium transition-colors rounded',
                    isActive(link.href)
                      ? 'text-violet-400 bg-[#141414]'
                      : 'text-zinc-400 hover:text-white hover:bg-[#141414]'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
