'use client'

import { useState, useEffect, useRef, useCallback, use, useMemo } from 'react'
import { Newsreader } from 'next/font/google'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import Link from 'next/link'
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Loader2, BookOpen, MessageSquare, List,
  Sparkles, X, AlertCircle, Zap,
} from 'lucide-react'
import { ChatMessage } from '@/components/chat/chat-message'
import { ChatInput } from '@/components/chat/chat-input'
import { SpeedReader } from '@/components/book/SpeedReader'
import { createClient } from '@/lib/db/supabase-browser'
import { cn } from '@/lib/utils'

// Distinguished serif for the reading experience
const serifFont = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})

interface ChapterMeta {
  id: string
  title: string
  chapter_number: number
  word_count: number
  reading_time_minutes: number
}

// ─────────────────────────────────────────────────────────
export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookId } = use(params)

  // ── Book & Chapters ──────────────────────────────────
  const [book, setBook] = useState<{ title: string; authorName: string } | null>(null)
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [chapterContents, setChapterContents] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)

  // ── Panel Widths ─────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(260)
  const [rightWidth, setRightWidth] = useState(380)
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // ── Mobile Tabs ──────────────────────────────────────
  const [mobileTab, setMobileTab] = useState<'chapters' | 'read' | 'chat'>('read')

  // ── Speed Reader ────────────────────────────────────
  const [speedReaderOpen, setSpeedReaderOpen] = useState(false)

  // ── Text Selection ───────────────────────────────────
  const [selectedText, setSelectedText] = useState('')
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null)
  const [contextQuote, setContextQuote] = useState<string | null>(null)

  // ── Refs ──────────────────────────────────────────────
  const readingRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Hide page-level scroll (prevents footer from showing below the fixed-height reader)
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [])

  // ── Chat ──────────────────────────────────────────────
  const sessionId = useMemo(() => `session_${bookId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, [bookId])

  const { messages, status, error, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { bookId, sessionId },
    }),
  })
  const isBusy = status === 'submitted' || status === 'streaming'

  // ═══════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const [bookRes, chapterRes] = await Promise.all([
        fetch(`/api/books/${bookId}`),
        supabase
          .from('chapters')
          .select('id, title, chapter_number, word_count, reading_time_minutes')
          .eq('book_id', bookId)
          .order('chapter_number', { ascending: true }),
      ])

      if (bookRes.ok) {
        const data = await bookRes.json()
        setBook({ title: data.book.title, authorName: data.book.authorName })
      }

      if (chapterRes.data && chapterRes.data.length > 0) {
        setChapters(chapterRes.data)
        setActiveChapterId(chapterRes.data[0].id)
      }

      setLoading(false)
    }

    load()
  }, [bookId])

  // Load chapter content on demand
  useEffect(() => {
    if (!activeChapterId || chapterContents.has(activeChapterId)) return

    const supabase = createClient()
    let cancelled = false

    async function loadContent() {
      setContentLoading(true)
      const { data } = await supabase
        .from('chapters')
        .select('content')
        .eq('id', activeChapterId)
        .single()

      if (!cancelled && data?.content) {
        setChapterContents(prev => {
          const next = new Map(prev)
          next.set(activeChapterId!, data.content)
          return next
        })
      }
      if (!cancelled) setContentLoading(false)
    }

    loadContent()
    return () => { cancelled = true }
  }, [activeChapterId, chapterContents])

  // ═══════════════════════════════════════════════════════
  // PANEL RESIZE
  // ═══════════════════════════════════════════════════════

  const handleResizeStart = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(side)
    dragStartX.current = e.clientX
    dragStartWidth.current = side === 'left' ? leftWidth : rightWidth
  }, [leftWidth, rightWidth])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current
      if (dragging === 'left') {
        setLeftWidth(Math.max(180, Math.min(400, dragStartWidth.current + delta)))
      } else {
        setRightWidth(Math.max(280, Math.min(600, dragStartWidth.current - delta)))
      }
    }

    const onUp = () => setDragging(null)

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging])

  // ═══════════════════════════════════════════════════════
  // TEXT SELECTION → ASK AI
  // ═══════════════════════════════════════════════════════

  useEffect(() => {
    function handleMouseUp() {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !readingRef.current) return

      const text = selection.toString().trim()
      if (text.length < 5) return

      const range = selection.getRangeAt(0)
      if (!readingRef.current.contains(range.commonAncestorContainer)) return

      const rect = range.getBoundingClientRect()
      const containerRect = readingRef.current.getBoundingClientRect()

      setSelectedText(text)
      setSelectionPos({
        x: Math.min(
          Math.max(60, rect.left + rect.width / 2 - containerRect.left),
          containerRect.width - 60
        ),
        y: rect.top - containerRect.top - 44,
      })
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Clear floating button when clicking elsewhere
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('[data-ask-ai]')) return

      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) {
          setSelectedText('')
          setSelectionPos(null)
        }
      }, 100)
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // ═══════════════════════════════════════════════════════
  // CHAT HANDLERS
  // ═══════════════════════════════════════════════════════

  const handleAskAI = useCallback(() => {
    if (!selectedText) return
    const quote = selectedText.length > 300
      ? selectedText.slice(0, 300) + '...'
      : selectedText
    setContextQuote(quote)
    setMobileTab('chat')
    setSelectedText('')
    setSelectionPos(null)
    window.getSelection()?.removeAllRanges()
  }, [selectedText])

  const handleSendMessage = useCallback((content: string) => {
    const msg = contextQuote
      ? `Regarding this passage from the book:\n\n> "${contextQuote}"\n\n${content}`
      : content
    sendMessage({ text: msg })
    setContextQuote(null)
  }, [contextQuote, sendMessage])

  const getMessageText = (msg: (typeof messages)[0]): string =>
    msg.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')

  // Scroll chat to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ═══════════════════════════════════════════════════════
  // CHAPTER NAVIGATION
  // ═══════════════════════════════════════════════════════

  const activeChapter = chapters.find(c => c.id === activeChapterId)
  const activeContent = activeChapterId ? chapterContents.get(activeChapterId) : null
  const activeIndex = chapters.findIndex(c => c.id === activeChapterId)

  const goToChapter = useCallback((chapterId: string) => {
    setActiveChapterId(chapterId)
    setMobileTab('read')
    readingRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const goPrev = () => { if (activeIndex > 0) goToChapter(chapters[activeIndex - 1].id) }
  const goNext = () => { if (activeIndex < chapters.length - 1) goToChapter(chapters[activeIndex + 1].id) }

  // ═══════════════════════════════════════════════════════
  // CONTENT RENDERER
  // ═══════════════════════════════════════════════════════

  const renderContent = (text: string) => {
    const paragraphs = text.split(/\n\n+/)
    return paragraphs.map((p, i) => {
      const trimmed = p.trim()
      if (!trimmed) return null

      // Detect if it looks like a heading (short, no period at end, all caps)
      if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.endsWith(',') && i > 0) {
        const isAllCaps = trimmed === trimmed.toUpperCase() && trimmed.length > 3
        if (isAllCaps) {
          return (
            <h3 key={i} className="mb-4 mt-10 text-lg font-semibold tracking-wide text-zinc-200 uppercase">
              {trimmed}
            </h3>
          )
        }
      }

      return (
        <p key={i} className="mb-6 text-[17px] leading-[1.85] text-zinc-300/90">
          {trimmed}
        </p>
      )
    })
  }

  // ═══════════════════════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          <p className="text-sm text-zinc-600">Loading book...</p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="flex h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] flex-col overflow-hidden bg-[#0a0a0a]">

      {/* ── Top Bar ────────────────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#1a1a1a] bg-[#0a0a0a] px-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/book/${bookId}`}
            className="flex items-center gap-1.5 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-medium hidden sm:inline">Back</span>
          </Link>

          <div className="h-4 w-px bg-[#27272a]" />

          <span className="text-sm font-medium text-zinc-300 truncate max-w-[160px] sm:max-w-none">
            {book?.title || 'Book'}
          </span>

          {activeChapter && (
            <>
              <span className="text-zinc-600 hidden sm:inline">/</span>
              <span className="text-xs text-zinc-500 hidden sm:inline truncate max-w-[180px]">
                {activeChapter.title}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Speed Reader Toggle */}
          <button
            onClick={() => setSpeedReaderOpen(true)}
            disabled={!activeContent}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all mr-2',
              'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 disabled:opacity-25 disabled:cursor-not-allowed',
            )}
            title="Speed Read this chapter"
          >
            <Zap className="h-3 w-3" />
            <span className="hidden sm:inline">Speed Read</span>
          </button>

          <div className="h-4 w-px bg-[#27272a] mr-1" />

          <button
            onClick={goPrev}
            disabled={activeIndex <= 0}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-300 disabled:opacity-25"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs tabular-nums text-zinc-600 min-w-[3ch] text-center">
            {activeIndex + 1}/{chapters.length}
          </span>
          <button
            onClick={goNext}
            disabled={activeIndex >= chapters.length - 1}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-[#1e1e1e] hover:text-zinc-300 disabled:opacity-25"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Mobile Tab Bar ─────────────────────────────── */}
      <div className="flex h-10 shrink-0 border-b border-[#1a1a1a] lg:hidden">
        {([
          { key: 'chapters' as const, icon: List, label: 'Chapters' },
          { key: 'read' as const, icon: BookOpen, label: 'Read' },
          { key: 'chat' as const, icon: MessageSquare, label: 'AI Chat' },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 text-sm font-medium transition-colors',
              mobileTab === key
                ? 'border-b-2 border-violet-500 text-violet-400'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Panel Container ────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL: Chapters ──────────────────────── */}
        <aside
          style={{ width: leftWidth }}
          className={cn(
            'reader-panel shrink-0 flex-col overflow-y-auto border-r border-[#1a1a1a] bg-[#080808]',
            'lg:flex',
            mobileTab === 'chapters' ? 'flex' : 'hidden',
          )}
        >
          {/* Sidebar Header */}
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#1a1a1a] bg-[#080808]/95 px-4 py-3 backdrop-blur-sm">
            <BookOpen className="h-3.5 w-3.5 text-violet-400/70" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Chapters
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-zinc-700">
              {chapters.length}
            </span>
          </div>

          {/* Chapter List */}
          <nav className="py-1">
            {chapters.map((ch) => {
              const isActive = ch.id === activeChapterId
              return (
                <button
                  key={ch.id}
                  onClick={() => goToChapter(ch.id)}
                  className={cn(
                    'group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-all',
                    isActive
                      ? 'bg-violet-500/[0.07] border-l-2 border-violet-500'
                      : 'border-l-2 border-transparent hover:bg-white/[0.02]',
                  )}
                >
                  <span className={cn(
                    'mt-px font-mono text-[11px] tabular-nums',
                    isActive ? 'text-violet-400' : 'text-zinc-700 group-hover:text-zinc-500',
                  )}>
                    {String(ch.chapter_number).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-[13px] leading-snug',
                      isActive
                        ? 'font-medium text-violet-300'
                        : 'text-zinc-400 group-hover:text-zinc-200',
                    )}>
                      {ch.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-700">
                      {ch.reading_time_minutes || Math.ceil((ch.word_count || 0) / 250)} min
                    </p>
                  </div>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* ── LEFT RESIZE HANDLE ────────────────────────── */}
        <div
          onMouseDown={(e) => handleResizeStart('left', e)}
          className={cn(
            'hidden lg:flex w-[3px] shrink-0 cursor-col-resize items-center justify-center transition-colors',
            dragging === 'left' ? 'bg-violet-500/30' : 'bg-transparent hover:bg-violet-500/15',
          )}
        />

        {/* ── MIDDLE PANEL: Reading ─────────────────────── */}
        <div
          className={cn(
            'relative flex-1 overflow-hidden',
            mobileTab === 'read' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
          )}
        >
          <div
            ref={readingRef}
            className={cn('flex-1 overflow-y-auto', serifFont.className)}
          >
            {contentLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
              </div>
            ) : activeContent ? (
              <div className="mx-auto max-w-[66ch] px-6 py-10 sm:px-10 sm:py-14">
                {/* Chapter Header */}
                <header className="mb-12">
                  <p className="mb-3 font-mono text-[11px] tracking-[0.2em] text-violet-400/50 uppercase"
                     style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}>
                    Chapter {activeChapter?.chapter_number}
                  </p>
                  <h1 className="text-[28px] font-medium leading-tight text-zinc-100 sm:text-[34px]">
                    {activeChapter?.title}
                  </h1>
                  <div className="mt-5 h-px w-20 bg-gradient-to-r from-violet-500/40 to-transparent" />
                </header>

                {/* Chapter Body */}
                <div className="selection:bg-violet-500/25 selection:text-white">
                  {renderContent(activeContent)}
                </div>

                {/* Chapter Footer Nav */}
                <div className="mt-16 flex items-center justify-between border-t border-[#1a1a1a] pt-8 pb-8"
                     style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}>
                  {activeIndex > 0 ? (
                    <button
                      onClick={goPrev}
                      className="group flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                      <div className="text-left">
                        <p className="text-[11px] text-zinc-600">Previous</p>
                        <p className="text-zinc-400 text-[13px]">{chapters[activeIndex - 1].title}</p>
                      </div>
                    </button>
                  ) : <div />}
                  {activeIndex < chapters.length - 1 && (
                    <button
                      onClick={goNext}
                      className="group flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <div className="text-right">
                        <p className="text-[11px] text-zinc-600">Next</p>
                        <p className="text-zinc-400 text-[13px]">{chapters[activeIndex + 1].title}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : chapters.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-600"
                   style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}>
                <BookOpen className="h-12 w-12 text-zinc-800" />
                <p className="text-sm">No chapters found for this book.</p>
                <Link href={`/book/${bookId}`} className="text-xs text-violet-400 hover:text-violet-300">
                  Back to book details
                </Link>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-700">Select a chapter to begin reading</p>
              </div>
            )}

            {/* Floating "Ask AI" Button */}
            {selectedText && selectionPos && (
              <button
                data-ask-ai
                onClick={handleAskAI}
                style={{ top: selectionPos.y, left: selectionPos.x }}
                className="absolute z-50 flex items-center gap-1.5 rounded-full bg-violet-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400 hover:shadow-violet-500/40 animate-ask-ai-pop"
              >
                <Sparkles className="h-3 w-3" />
                Ask AI
              </button>
            )}
          </div>

          {/* Speed Reader Overlay */}
          {speedReaderOpen && activeContent && (
            <SpeedReader
              text={activeContent}
              chapterTitle={activeChapter?.title}
              onClose={() => setSpeedReaderOpen(false)}
            />
          )}
        </div>

        {/* ── RIGHT RESIZE HANDLE ───────────────────────── */}
        <div
          onMouseDown={(e) => handleResizeStart('right', e)}
          className={cn(
            'hidden lg:flex w-[3px] shrink-0 cursor-col-resize items-center justify-center transition-colors',
            dragging === 'right' ? 'bg-violet-500/30' : 'bg-transparent hover:bg-violet-500/15',
          )}
        />

        {/* ── RIGHT PANEL: AI Chat ──────────────────────── */}
        <aside
          style={{ width: rightWidth }}
          className={cn(
            'reader-panel shrink-0 flex-col overflow-hidden border-l border-[#1a1a1a] bg-[#080808]',
            'lg:flex',
            mobileTab === 'chat' ? 'flex' : 'hidden',
          )}
        >
          {/* Chat Header */}
          <div className="flex items-center gap-2 border-b border-[#1a1a1a] px-4 py-3 shrink-0">
            <MessageSquare className="h-3.5 w-3.5 text-violet-400/70" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              AI Assistant
            </span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="rounded-2xl bg-violet-500/[0.08] p-4">
                  <Sparkles className="h-7 w-7 text-violet-400/80" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300">
                    Ask about this book
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 max-w-[220px]">
                    Highlight text while reading to ask the AI about specific passages, or just type a question below.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={{
                      id: msg.id,
                      role: msg.role as 'user' | 'assistant',
                      content: getMessageText(msg),
                      timestamp: new Date(),
                    }}
                    bookId={bookId}
                  />
                ))}

                {isBusy && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-lg bg-[#141414] px-3 py-2 text-zinc-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    Something went wrong. Try again.
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Context Quote (when text is selected for AI) */}
          {contextQuote && (
            <div className="shrink-0 border-t border-[#1a1a1a] px-4 py-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 rounded-md border-l-2 border-violet-500/70 bg-violet-500/[0.06] px-3 py-2">
                  <p className="text-[11px] leading-relaxed text-zinc-400 line-clamp-3 italic">
                    &ldquo;{contextQuote}&rdquo;
                  </p>
                </div>
                <button
                  onClick={() => setContextQuote(null)}
                  className="mt-1 rounded p-0.5 text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Chat Input */}
          <div className="shrink-0 border-t border-[#1a1a1a] p-3">
            <ChatInput onSend={handleSendMessage} disabled={isBusy} />
          </div>
        </aside>

      </div>
    </div>
  )
}
