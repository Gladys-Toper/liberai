import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-[#27272a] bg-[#0a0a0a]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-white">
                <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  LiberAi
                </span>
              </span>
            </div>
            <p className="text-sm text-zinc-500">
              The AI-native publishing platform where every book becomes a conversation.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-white">Product</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/" className="text-zinc-500 hover:text-white transition-colors">
                    Explore
                  </Link>
                </li>
                <li>
                  <Link href="/library" className="text-zinc-500 hover:text-white transition-colors">
                    Library
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-white">For Authors</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/author/dashboard" className="text-zinc-500 hover:text-white transition-colors">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-white">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="text-zinc-500 hover:text-white transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-zinc-500 hover:text-white transition-colors">
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-white">Company</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/about" className="text-zinc-500 hover:text-white transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-zinc-500 hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-8 border-t border-[#27272a]" />

        {/* Bottom */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-zinc-500">
            © 2026 LiberAi. All rights reserved. Built with <span className="text-violet-400">AI</span>.
          </p>
          <p className="text-sm text-zinc-600">
            Transforming how readers engage with books.
          </p>
        </div>
      </div>
    </footer>
  );
}
