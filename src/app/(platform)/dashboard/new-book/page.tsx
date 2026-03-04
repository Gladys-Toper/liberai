'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { FileDropzone } from '@/components/upload/file-dropzone'

interface UploadResult {
  bookId: string
  title: string
  chapters: number
  wordCount: number
  readingTime: number
}

export default function NewBookPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [genre, setGenre] = useState('general')
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    if (description) formData.append('description', description)
    if (genre) formData.append('genre', genre)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Upload failed')
        setUploading(false)
        return
      }

      setResult(data)
      setSuccess(true)
      setUploading(false)
    } catch {
      setError('Network error — please try again')
      setUploading(false)
    }
  }

  const genres = [
    'general',
    'fiction',
    'non-fiction',
    'science-fiction',
    'fantasy',
    'mystery',
    'romance',
    'history',
    'biography',
    'self-help',
    'technology',
    'philosophy',
    'poetry',
    'business',
    'education',
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Back nav */}
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <h1 className="mb-2 text-3xl font-bold text-white">Upload a Book</h1>
        <p className="mb-8 text-zinc-400">
          Upload your EPUB file and we'll extract chapters, generate embeddings, and
          enable AI chat for your readers.
        </p>

        {success && result ? (
          <Card className="border-[#27272a] bg-[#141414] p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <BookOpen className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-white">
              Book uploaded successfully
            </h2>
            <p className="mb-6 text-sm text-zinc-400">
              <strong className="text-zinc-300">{result.title}</strong> — {result.chapters} chapters,{' '}
              {result.wordCount.toLocaleString()} words (~{result.readingTime} min read)
            </p>
            <p className="mb-6 text-xs text-zinc-500">
              AI embeddings are being generated. Chat will be available shortly.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={() => router.push(`/book/${result.bookId}`)}
                className="bg-violet-500 hover:bg-violet-600 text-white"
              >
                View Book
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null)
                  setTitle('')
                  setDescription('')
                  setGenre('general')
                  setSuccess(false)
                  setResult(null)
                }}
                className="border-[#27272a] text-zinc-300 hover:bg-[#27272a]"
              >
                Upload Another
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* File dropzone */}
            <Card className="border-[#27272a] bg-[#141414] p-6">
              <label className="mb-3 block text-sm font-medium text-zinc-300">
                EPUB File
              </label>
              <FileDropzone
                onFileSelect={setFile}
                uploading={uploading}
                success={success}
                disabled={uploading}
              />
            </Card>

            {/* Metadata form */}
            <Card className="border-[#27272a] bg-[#141414] p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Book Details</h2>
              <p className="mb-4 text-xs text-zinc-500">
                Optional — we'll extract these from the EPUB if left blank.
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Title
                  </label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Extracted from EPUB metadata"
                    disabled={uploading}
                    className="border-[#27272a] bg-[#0a0a0a] text-white placeholder:text-zinc-600 focus:border-violet-500"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A brief description of the book..."
                    disabled={uploading}
                    rows={3}
                    className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label htmlFor="genre" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Genre
                  </label>
                  <select
                    id="genre"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    disabled={uploading}
                    className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    {genres.map((g) => (
                      <option key={g} value={g}>
                        {g.charAt(0).toUpperCase() + g.slice(1).replace('-', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 py-5 font-medium text-white hover:from-violet-600 hover:to-purple-700 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Upload & Process Book'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
