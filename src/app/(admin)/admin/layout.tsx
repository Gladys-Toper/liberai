import { Header } from '@/components/layout/header'
import { AdminSidebar } from './components/admin-sidebar'
import { AdminChat } from './components/admin-chat'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a]">
      <Header />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar nav */}
        <AdminSidebar />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>

        {/* AI Chat panel */}
        <aside className="relative hidden w-[380px] shrink-0 border-l border-[#1e1e1e] bg-[#0c0c0c] lg:block xl:w-[420px]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-violet-500/[0.03] to-transparent" />
          <AdminChat />
        </aside>
      </div>
    </div>
  )
}
