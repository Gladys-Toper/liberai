'use client'

import { useState } from 'react'
import {
  X, Copy, Check, FileText, Twitter, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatChapterForPlatform,
  type ChapterData,
} from '@/lib/formatters'

interface ShareModalProps {
  chapter: ChapterData
  onClose: () => void
}

const PLATFORMS = [
  { key: 'substack' as const, label: 'Substack', icon: FileText, color: 'text-orange-400' },
  { key: 'twitter' as const, label: 'Twitter/X', icon: Twitter, color: 'text-blue-400' },
  { key: 'newsletter' as const, label: 'Newsletter', icon: Mail, color: 'text-emerald-400' },
]

export function ShareModal({ chapter, onClose }: ShareModalProps) {
  const [platform, setPlatform] = useState<'substack' | 'twitter' | 'newsletter'>('substack')
  const [copied, setCopied] = useState(false)

  const result = formatChapterForPlatform(chapter, platform)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.formatted)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="relative mx-4 flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-[#27272a] bg-[#111] shadow-2xl"
        style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e1e1e] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Share Chapter</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">{chapter.title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Platform Tabs */}
        <div className="flex border-b border-[#1e1e1e] px-5">
          {PLATFORMS.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => setPlatform(key)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors',
                platform === key
                  ? `border-violet-500 text-white`
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', platform === key ? color : '')} />
              {label}
            </button>
          ))}
        </div>

        {/* Content Preview */}
        <div className="flex-1 overflow-y-auto p-5">
          {result.tweetCount && (
            <p className="mb-3 text-xs text-zinc-500">
              {result.tweetCount} tweets in thread
            </p>
          )}
          <pre className="max-h-[40vh] overflow-auto rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] p-4 text-xs leading-relaxed text-zinc-400 whitespace-pre-wrap">
            {result.formatted}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#1e1e1e] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md bg-violet-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-600"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy to Clipboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
