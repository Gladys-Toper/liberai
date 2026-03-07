'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Search, Menu, X, ChevronDown, LogOut, User, LayoutDashboard, Shield, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/db/supabase-browser'
import { NotificationBell } from '@/components/social/notification-bell'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()
        setIsAdmin(data?.role === 'admin')
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const baseLinks = [
    { href: '/marketplace', label: 'Explore' },
    { href: '/library', label: 'Library' },
    { href: '/arena', label: 'Arena' },
  ]

  const navLinks = user
    ? [...baseLinks, { href: '/feed', label: 'Feed' }, { href: '/dashboard', label: 'For Authors' }]
    : [...baseLinks, { href: '/dashboard', label: 'For Authors' }]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

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
            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors',
                  isActive('/admin')
                    ? 'text-violet-400'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                Admin
              </Link>
            )}
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

            {/* Auth Section */}
            {loading ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-[#27272a]" />
            ) : user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[#27272a]">
                    <Avatar
                      src={user.user_metadata?.avatar_url}
                      name={user.user_metadata?.full_name || user.email || ''}
                      size="sm"
                      className="ring-0"
                    />
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    <div className="px-4 py-2 border-b border-[#27272a]">
                      <p className="text-sm font-medium text-white truncate">
                        {user.user_metadata?.full_name || 'User'}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                      <User className="h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem onClick={() => router.push('/admin')}>
                        <Shield className="h-4 w-4" />
                        Admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem destructive onClick={handleSignOut}>
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                    Sign in
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700"
                  >
                    Sign up
                  </Button>
                </Link>
              </div>
            )}

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
              {/* Mobile auth links */}
              {!user && (
                <>
                  <Link
                    href="/login"
                    className="px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-[#141414] rounded"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="px-3 py-2 text-sm font-medium text-violet-400 hover:bg-[#141414] rounded"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign up
                  </Link>
                </>
              )}
              {user && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleSignOut()
                  }}
                  className="px-3 py-2 text-sm font-medium text-red-400 hover:bg-[#141414] rounded text-left"
                >
                  Sign out
                </button>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
