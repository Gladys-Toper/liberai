'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Swords, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Book {
  id: string
  title: string
  author_name: string
}

export function ArenaSetupCard({ books }: { books: Book[] }) {
  const router = useRouter()
  const [bookAId, setBookAId] = useState('')
  const [bookBId, setBookBId] = useState('')
  const [crucibleQuestion, setCrucibleQuestion] = useState('')
  const [maxRounds, setMaxRounds] = useState(5)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!bookAId || !bookBId || !crucibleQuestion.trim()) {
      setError('Select two books and enter a crucible question')
      return
    }
    if (bookAId === bookBId) {
      setError('Books must be different')
      return
    }

    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/arena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookAId, bookBId, crucibleQuestion, maxRounds }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create debate')
      }

      const { session } = await res.json()
      router.push(`/arena/${session.id}`)
    } catch (err) {
      setError((err as Error).message)
      setCreating(false)
    }
  }

  const placeholders = [
    'Is freedom more important than security?',
    'Does technology liberate or enslave humanity?',
    'Is morality objective or culturally constructed?',
    'Should economic growth be prioritized over environmental sustainability?',
  ]

  return (
    <div className="rounded-xl border border-[#27272a] bg-[#141414] p-6">
      <h2 className="mb-6 text-lg font-semibold text-white">Create a New Bout</h2>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Book A */}
        <div>
          <label className="mb-2 block text-sm font-medium text-red-400">
            Corner A (Red)
          </label>
          <select
            value={bookAId}
            onChange={(e) => setBookAId(e.target.value)}
            className="w-full rounded-lg border border-[#27272a] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none"
          >
            <option value="">Select a book...</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author_name}
              </option>
            ))}
          </select>
        </div>

        {/* Book B */}
        <div>
          <label className="mb-2 block text-sm font-medium text-blue-400">
            Corner B (Blue)
          </label>
          <select
            value={bookBId}
            onChange={(e) => setBookBId(e.target.value)}
            className="w-full rounded-lg border border-[#27272a] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select a book...</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Crucible Question */}
      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          Crucible Question
        </label>
        <textarea
          value={crucibleQuestion}
          onChange={(e) => setCrucibleQuestion(e.target.value)}
          placeholder={placeholders[0]}
          rows={2}
          className="w-full rounded-lg border border-[#27272a] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none resize-none"
        />
      </div>

      {/* Max Rounds */}
      <div className="mt-4 flex items-center gap-4">
        <label className="text-sm text-zinc-400">Rounds:</label>
        <input
          type="range"
          min={1}
          max={15}
          value={maxRounds}
          onChange={(e) => setMaxRounds(parseInt(e.target.value))}
          className="flex-1 accent-violet-500"
        />
        <span className="min-w-[2ch] text-sm font-mono text-white">{maxRounds}</span>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      <Button
        onClick={handleCreate}
        disabled={creating || !bookAId || !bookBId || !crucibleQuestion.trim()}
        className="mt-6 w-full bg-gradient-to-r from-red-600 to-blue-600 text-white hover:from-red-700 hover:to-blue-700 disabled:opacity-50"
      >
        {creating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Extracting axioms...
          </>
        ) : (
          <>
            <Swords className="mr-2 h-4 w-4" />
            START FIGHT
          </>
        )}
      </Button>
    </div>
  )
}
