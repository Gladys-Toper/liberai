'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Users, ShoppingCart, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/crm', label: 'CRM', icon: Users },
  { href: '/admin/sales', label: 'Sales', icon: ShoppingCart },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[#1e1e1e] bg-[#0c0c0c]">
      {/* Brand */}
      <div className="flex h-14 items-center gap-3 border-b border-[#1e1e1e] px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
          <BarChart3 className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">LiberAi</p>
          <p className="text-[10px] text-zinc-600">Admin Console</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-violet-500/10 text-violet-300'
                : 'text-zinc-500 hover:bg-[#141414] hover:text-zinc-300',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#1e1e1e] px-5 py-3">
        <Link
          href="/dashboard"
          className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Back to Author Dashboard
        </Link>
      </div>
    </aside>
  )
}
