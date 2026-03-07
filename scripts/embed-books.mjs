#!/usr/bin/env node
/**
 * Embed Das Kapital and Wealth of Nations.
 * Uses @ai-sdk/openai + ai (same as the platform).
 */
import { createClient } from '@supabase/supabase-js'
import { openai } from '@ai-sdk/openai'
import { embedMany } from 'ai'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const EMBEDDING_MODEL = openai.embedding('text-embedding-3-small')

const BOOKS = [
  { id: '00000000-0000-4000-8000-000000000400', title: 'Das Kapital' },
  { id: '00000000-0000-4000-8000-000000000500', title: 'The Wealth of Nations' },
]

// ── Chunking (matches src/lib/ai/chunking.ts) ──
const CHARS_PER_TOKEN = 4
function chunkChapters(chapters, maxTokens = 500, overlapTokens = 100) {
  const maxChars = maxTokens * CHARS_PER_TOKEN
  const overlapChars = overlapTokens * CHARS_PER_TOKEN
  const allChunks = []
  let globalIndex = 0

  for (const chapter of chapters) {
    const text = (chapter.content || '').trim()
    if (!text) continue
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())
    let currentChunk = ''
    let chunkStart = 0

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim()
      const wouldBe = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed
      if (wouldBe.length > maxChars && currentChunk) {
        allChunks.push({
          content: currentChunk,
          chapterTitle: chapter.title,
          chapterNumber: chapter.chapter_number,
          chunkIndex: globalIndex++,
          startChar: chunkStart,
          endChar: chunkStart + currentChunk.length,
        })
        const overlapStart = Math.max(0, currentChunk.length - overlapChars)
        const overlap = currentChunk.slice(overlapStart)
        chunkStart = chunkStart + overlapStart
        currentChunk = overlap + '\n\n' + trimmed
      } else {
        currentChunk = wouldBe
      }
    }
    if (currentChunk.trim()) {
      allChunks.push({
        content: currentChunk,
        chapterTitle: chapter.title,
        chapterNumber: chapter.chapter_number,
        chunkIndex: globalIndex++,
        startChar: chunkStart,
        endChar: chunkStart + currentChunk.length,
      })
    }
  }
  return allChunks
}

// ── Embedding via Vercel AI SDK ──
async function embedBatch(texts) {
  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: texts,
  })
  return embeddings
}

async function embedBook(bookId, title) {
  console.log(`\n📖 Embedding: ${title}`)

  const { data: chapters, error: chapErr } = await db
    .from('chapters')
    .select('id, title, content, chapter_number')
    .eq('book_id', bookId)
    .order('chapter_number')

  if (chapErr || !chapters?.length) {
    console.error(`  No chapters found:`, chapErr?.message)
    return
  }
  console.log(`  ${chapters.length} chapters`)

  // Delete existing chunks
  await db.from('book_chunks').delete().eq('book_id', bookId)

  // Chunk
  const chunks = chunkChapters(chapters)
  console.log(`  ${chunks.length} chunks to embed`)

  // Build chapter ID lookup
  const chapterIdMap = new Map(chapters.map(c => [c.chapter_number, c.id]))

  // Embed + insert in batches
  const EMBED_BATCH = 100
  const INSERT_BATCH = 50
  let done = 0

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH)
    const texts = batch.map(c => c.content)

    process.stdout.write(`  Batch ${Math.floor(i / EMBED_BATCH) + 1}/${Math.ceil(chunks.length / EMBED_BATCH)}...`)

    let embeddings
    try {
      embeddings = await embedBatch(texts)
    } catch (e) {
      console.error(` EMBED ERROR: ${e.message}`)
      // Retry once after a pause
      await new Promise(r => setTimeout(r, 5000))
      try {
        embeddings = await embedBatch(texts)
      } catch (e2) {
        console.error(` RETRY FAILED: ${e2.message}`)
        continue
      }
    }

    // Insert in sub-batches
    for (let j = 0; j < batch.length; j += INSERT_BATCH) {
      const sub = batch.slice(j, j + INSERT_BATCH)
      const rows = sub.map((chunk, k) => ({
        book_id: bookId,
        chapter_id: chapterIdMap.get(chunk.chapterNumber) || chapters[0].id,
        content: chunk.content,
        embedding: JSON.stringify(embeddings[j + k]),
        chunk_index: chunk.chunkIndex,
        metadata: {
          chapter_title: chunk.chapterTitle,
          chapter_number: chunk.chapterNumber,
          start_char: chunk.startChar,
          end_char: chunk.endChar,
        },
      }))

      const { error: insertErr } = await db.from('book_chunks').insert(rows)
      if (insertErr) {
        console.error(` INSERT ERROR: ${insertErr.message}`)
      }
      done += sub.length
    }
    console.log(` ✓ (${done}/${chunks.length})`)
  }

  console.log(`  ✅ ${title}: ${done} chunks embedded`)
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
    console.log(`${book.title}: ${count} chunks in vector store`)
  }

  console.log('\n═══ Done ═══')
}

main().catch(e => { console.error(e); process.exit(1) })
