import { Swords } from 'lucide-react'
import { ArenaSetupCard } from '@/components/arena/ArenaSetupCard'
import { DebateSessionCard } from '@/components/arena/DebateSessionCard'
import { createClient } from '@supabase/supabase-js'

async function getDebates() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await db
    .from('debate_sessions')
    .select(`
      *,
      book_a:books!debate_sessions_book_a_id_fkey(id, title, cover_url, author:authors!books_author_id_fkey(display_name)),
      book_b:books!debate_sessions_book_b_id_fkey(id, title, cover_url, author:authors!books_author_id_fkey(display_name))
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  return data || []
}

async function getBooks() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await db
    .from('books')
    .select('id, title, author:authors!books_author_id_fkey(display_name)')
    .eq('status', 'published')
    .order('title')

  // Flatten author join into author_name for the component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((b: any) => ({
    id: b.id as string,
    title: b.title as string,
    author_name: (Array.isArray(b.author) ? b.author[0]?.display_name : b.author?.display_name) || 'Unknown',
  }))
}

export default async function ArenaPage() {
  const [debates, books] = await Promise.all([getDebates(), getBooks()])

  const activeDebates = debates.filter((d: { status: string }) => d.status === 'active' || d.status === 'extracting')
  const completedDebates = debates.filter((d: { status: string }) => d.status === 'completed')

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10">
            <Swords className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Ontological Pugilism Arena</h1>
            <p className="text-sm text-zinc-500">Where books fight through formal logic</p>
          </div>
        </div>

        {/* Setup Card */}
        <ArenaSetupCard books={books} />

        {/* Active Debates */}
        {activeDebates.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live Debates
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {activeDebates.map((debate: Record<string, unknown>) => (
                <DebateSessionCard key={debate.id as string} debate={debate} />
              ))}
            </div>
          </section>
        )}

        {/* Completed Debates */}
        {completedDebates.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-semibold text-zinc-400">Past Bouts</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {completedDebates.map((debate: Record<string, unknown>) => (
                <DebateSessionCard key={debate.id as string} debate={debate} />
              ))}
            </div>
          </section>
        )}

        {debates.length === 0 && (
          <div className="mt-16 text-center">
            <p className="text-zinc-600">No debates yet. Create the first one above.</p>
          </div>
        )}
      </div>
    </div>
  )
}
