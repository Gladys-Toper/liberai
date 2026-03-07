#!/usr/bin/env npx tsx
/**
 * Embed Das Kapital and Wealth of Nations using the platform's chunking + embedding pipeline.
 * Run with: npx tsx --env-file=.env.local scripts/embed-books.mts
 */
import { createClient } from '@supabase/supabase-js'
// Resolve from project root
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Dynamic import with full path
const { chunkChapters } = await import(path.join(root, 'src/lib/ai/chunking.ts'))
const { generateEmbeddings } = await import(path.join(root, 'src/lib/ai/embeddings.ts'))

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BOOKS = [
  { id: '00000000-0000-4000-8000-000000000400', title: 'Das Kapital' },
  { id: '00000000-0000-4000-8000-000000000500', title: 'The Wealth of Nations' },
]

async function embedBook(bookId: string, title: string) {
  console.log(`\n📖 Embedding: ${title}`)

  // Get chapters
  const { data: chapters, error: chapErr } = await db
    .from('chapters')
    .select('id, title, content, chapter_number')
    .eq('book_id', bookId)
    .order('chapter_number')

  if (chapErr || !chapters?.length) {
    console.error(`  No chapters found:`, chapErr?.message)
    return
  }
  console.log(`  Found ${chapters.length} chapters`)

  // Delete existing chunks
  await db.from('book_chunks').delete().eq('book_id', bookId)
  console.log(`  Cleared existing chunks`)

  // Chunk
  const chunks = chunkChapters(
    chapters.map(c => ({
      title: c.title,
      content: c.content || '',
      chapterNumber: c.chapter_number,
    }))
  )
  console.log(`  Chunked into ${chunks.length} pieces`)

  // Build chapter ID lookup
  const chapterIdMap = new Map(chapters.map(c => [c.chapter_number, c.id]))

  // Embed in batches of 100 texts (OpenAI limit)
  const EMBED_BATCH = 100
  const INSERT_BATCH = 50
  let totalEmbedded = 0

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH)
    const texts = batch.map(c => c.content)

    console.log(`  Embedding batch ${Math.floor(i / EMBED_BATCH) + 1}/${Math.ceil(chunks.length / EMBED_BATCH)} (${batch.length} chunks)...`)
    const embeddings = await generateEmbeddings(texts)

    // Insert in sub-batches
    for (let j = 0; j < batch.length; j += INSERT_BATCH) {
      const subBatch = batch.slice(j, j + INSERT_BATCH)
      const rows = subBatch.map((chunk, k) => ({
        book_id: bookId,
        chapter_id: chapterIdMap.get(chunk.chapterNumber) || chapters[0].id,
        content: chunk.content,
        embedding: JSON.stringify(embeddings[j + k]),
        chunk_index: chunk.chunkIndex,
        metadata: {
          chapter_title: chunk.chapterTitle,
          chapter_number: chunk.chapterNumber,
          start_char: chunk.metadata.startChar,
          end_char: chunk.metadata.endChar,
        },
      }))

      const { error: insertErr } = await db.from('book_chunks').insert(rows)
      if (insertErr) {
        console.error(`  Insert error:`, insertErr.message)
        // Try individually
        for (const row of rows) {
          const { error: e2 } = await db.from('book_chunks').insert(row)
          if (e2) console.error(`    Single insert failed:`, e2.message)
        }
      }
      totalEmbedded += subBatch.length
    }

    console.log(`  Progress: ${totalEmbedded}/${chunks.length}`)
  }

  console.log(`  ✅ ${title}: ${totalEmbedded} chunks embedded`)
}

async function main() {
  console.log('═══ Embedding Books for RAG ═══')

  for (const book of BOOKS) {
    await embedBook(book.id, book.title)
  }

  // Verify
  for (const book of BOOKS) {
    const { count } = await db
      .from('book_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('book_id', book.id)
    console.log(`\n${book.title}: ${count} chunks in vector store`)
  }

  console.log('\n═══ Embedding Complete ═══')
}

main().catch(e => { console.error(e); process.exit(1) })
