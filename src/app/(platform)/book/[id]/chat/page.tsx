'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import Link from 'next/link'
import { ArrowLeft, Loader, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChatMessage } from '@/components/chat/chat-message'
import { ChatInput } from '@/components/chat/chat-input'
import { ChatSuggestions } from '@/components/chat/chat-suggestions'

interface BookInfo {
  id: string
  title: string
  cover_url: string | null
  authorName: string
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookId } = use(params)
  const [book, setBook] = useState<BookInfo | null>(null)
  const [bookLoading, setBookLoading] = useState(true)
  const [embeddingsReady, setEmbeddingsReady] = useState<boolean | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, status, error, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { bookId },
    }),
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  // Load book info
  useEffect(() => {
    async function loadBook() {
      try {
        const res = await fetch(`/api/books/${bookId}`)
        if (res.ok) {
          const data = await res.json()
          setBook(data.book)
          setEmbeddingsReady(data.embeddingsReady)
        }
      } catch {
        // ignore
      } finally {
        setBookLoading(false)
      }
    }
    loadBook()
  }, [bookId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = (content: string) => {
    sendMessage({ text: content })
  }

  // Extract text content from v6 parts-based messages
  const getMessageText = (message: (typeof messages)[0]): string => {
    return message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
  }

  const bookTitle = book?.title || 'Book'
  const authorName = book?.authorName || 'Author'

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-[#0a0a0a]">
      {/* Book Info Sidebar - Desktop */}
      <aside className="hidden w-80 border-r border-[#27272a] bg-[#0a0a0a] p-6 lg:flex lg:flex-col">
        <Link href={`/book/${bookId}`}>
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Book
          </Button>
        </Link>

        <Card className="border-[#27272a] bg-[#141414] p-4">
          {book?.cover_url ? (
            <img
              src={book.cover_url}
              alt={bookTitle}
              className="mb-4 h-40 w-full rounded-lg object-cover"
            />
          ) : (
            <div className="mb-4 h-40 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600" />
          )}
          <h3 className="mb-2 font-semibold text-white">
            {bookLoading ? 'Loading...' : bookTitle}
          </h3>
          <p className="mb-4 text-sm text-zinc-400">{authorName}</p>

          <div className="space-y-3 border-t border-[#27272a] pt-4">
            <div>
              <p className="text-xs text-zinc-500">About this feature</p>
              <p className="mt-1 text-sm text-zinc-300">
                Ask any questions about the content. The AI will provide answers
                with citations from the book.
              </p>
            </div>
          </div>
        </Card>
      </aside>

      {/* Chat Area */}
      <main className="flex flex-1 flex-col">
        {/* Mobile Book Info */}
        <div className="border-b border-[#27272a] bg-[#0a0a0a] p-4 lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{bookTitle}</p>
              <p className="text-xs text-zinc-500">{authorName}</p>
            </div>
            <Link href={`/book/${bookId}`}>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Embeddings Warning */}
        {embeddingsReady === false && (
          <div className="mx-auto mt-4 flex max-w-2xl items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              This book hasn&apos;t been indexed yet. Chat may not have full
              context. The author needs to generate embeddings first.
            </span>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl space-y-8 pt-12">
              <div className="text-center">
                <h2 className="mb-2 text-2xl font-bold text-white">
                  Talk to {bookTitle}
                </h2>
                <p className="text-zinc-400">
                  Ask questions about the content. The AI will provide answers
                  with citations.
                </p>
              </div>

              <ChatSuggestions
                bookTitle={bookTitle}
                onSelectSuggestion={handleSendMessage}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={{
                    id: message.id,
                    role: message.role as 'user' | 'assistant',
                    content: getMessageText(message),
                    timestamp: new Date(),
                  }}
                  bookId={bookId}
                />
              ))}

              {isBusy && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-[#141414] px-4 py-3 text-zinc-300">
                    <Loader className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">
                      Something went wrong. Please try again.
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[#27272a] bg-[#0a0a0a] p-4 sm:p-6">
          <div className="mx-auto max-w-2xl">
            <ChatInput onSend={handleSendMessage} disabled={isBusy} />
          </div>
        </div>
      </main>
    </div>
  )
}
