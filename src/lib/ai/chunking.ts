interface ChunkOptions {
  maxTokens?: number
  overlapTokens?: number
}

interface Chunk {
  content: string
  chapterTitle: string
  chapterNumber: number
  chunkIndex: number
  metadata: {
    startChar: number
    endChar: number
  }
}

const CHARS_PER_TOKEN = 4

export function chunkChapters(
  chapters: Array<{ title: string; content: string; chapterNumber: number }>,
  options: ChunkOptions = {}
): Chunk[] {
  const maxTokens = options.maxTokens ?? 500
  const overlapTokens = options.overlapTokens ?? 100
  const maxChars = maxTokens * CHARS_PER_TOKEN
  const overlapChars = overlapTokens * CHARS_PER_TOKEN

  const allChunks: Chunk[] = []
  let globalIndex = 0

  for (const chapter of chapters) {
    const text = chapter.content.trim()
    if (!text) continue

    // Split on paragraph boundaries
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())

    let currentChunk = ''
    let chunkStart = 0
    let charOffset = 0

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim()
      const wouldBe = currentChunk
        ? currentChunk + '\n\n' + trimmed
        : trimmed

      if (wouldBe.length > maxChars && currentChunk) {
        // Emit current chunk
        allChunks.push({
          content: currentChunk,
          chapterTitle: chapter.title,
          chapterNumber: chapter.chapterNumber,
          chunkIndex: globalIndex++,
          metadata: {
            startChar: chunkStart,
            endChar: chunkStart + currentChunk.length,
          },
        })

        // Start new chunk with overlap from end of previous
        const overlapStart = Math.max(0, currentChunk.length - overlapChars)
        const overlap = currentChunk.slice(overlapStart)
        chunkStart = chunkStart + overlapStart
        currentChunk = overlap + '\n\n' + trimmed
      } else {
        currentChunk = wouldBe
      }

      charOffset += trimmed.length + 2
    }

    // Emit final chunk for this chapter
    if (currentChunk.trim()) {
      allChunks.push({
        content: currentChunk,
        chapterTitle: chapter.title,
        chapterNumber: chapter.chapterNumber,
        chunkIndex: globalIndex++,
        metadata: {
          startChar: chunkStart,
          endChar: chunkStart + currentChunk.length,
        },
      })
    }
  }

  return allChunks
}
