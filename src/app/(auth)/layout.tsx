import Link from 'next/link'
import { BookOpen } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
          <BookOpen className="h-7 w-7 text-white" />
        </div>
        <span className="text-2xl font-bold">
          <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
            LiberAi
          </span>
        </span>
      </Link>
      {children}
    </div>
  )
}
