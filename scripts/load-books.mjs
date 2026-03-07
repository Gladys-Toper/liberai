#!/usr/bin/env node
/**
 * Load Das Kapital and Wealth of Nations into the platform.
 * Fetches from Project Gutenberg / Marxists.org, splits into chapters, inserts into DB.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const MARX_BOOK_ID = '00000000-0000-4000-8000-000000000400'
const SMITH_BOOK_ID = '00000000-0000-4000-8000-000000000500'

// ─── Das Kapital ────────────────────────────────────────────────
// Fetch key chapters from marxists.org (HTML → strip tags → text)
const KAPITAL_CHAPTERS = [
  { num: 1, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch01.htm', title: 'Commodities' },
  { num: 2, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch02.htm', title: 'Exchange' },
  { num: 3, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch04.htm', title: 'The General Formula for Capital' },
  { num: 4, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch06.htm', title: 'The Buying and Selling of Labour-Power' },
  { num: 5, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch07.htm', title: 'The Labour-Process and the Process of Producing Surplus-Value' },
  { num: 6, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch08.htm', title: 'Constant Capital and Variable Capital' },
  { num: 7, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch09.htm', title: 'The Rate of Surplus-Value' },
  { num: 8, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch10.htm', title: 'The Working-Day' },
  { num: 9, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch14.htm', title: 'Division of Labour and Manufacture' },
  { num: 10, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch15.htm', title: 'Machinery and Modern Industry' },
  { num: 11, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch25.htm', title: 'The General Law of Capitalist Accumulation' },
  { num: 12, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch26.htm', title: 'The Secret of Primitive Accumulation' },
  { num: 13, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch27.htm', title: 'Expropriation of the Agricultural Population' },
  { num: 14, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch31.htm', title: 'Genesis of the Industrial Capitalist' },
  { num: 15, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch32.htm', title: 'Historical Tendency of Capitalist Accumulation' },
  { num: 16, url: 'https://www.marxists.org/archive/marx/works/1867-c1/ch33.htm', title: 'The Modern Theory of Colonisation' },
]

function stripHtml(html) {
  // Remove script/style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  // Remove footnote markers
  text = text.replace(/<sup>[\s\S]*?<\/sup>/gi, '')
  // Replace <br> and <p> with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<\/h[1-6]>/gi, '\n\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<\/tr>/gi, '\n')
  text = text.replace(/<\/td>/gi, ' | ')
  text = text.replace(/<\/li>/gi, '\n')
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&mdash;/g, '—')
  text = text.replace(/&ndash;/g, '–')
  text = text.replace(/&lsquo;/g, '\u2018')
  text = text.replace(/&rsquo;/g, '\u2019')
  text = text.replace(/&ldquo;/g, '\u201C')
  text = text.replace(/&rdquo;/g, '\u201D')
  text = text.replace(/&#\d+;/g, '')
  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()
  return text
}

async function fetchChapterText(url) {
  console.log(`  Fetching ${url}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const html = await res.text()
  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const body = bodyMatch ? bodyMatch[1] : html
  return stripHtml(body)
}

// ─── Wealth of Nations ─────────────────────────────────────────
async function fetchWealthOfNations() {
  console.log('Fetching Wealth of Nations from Gutenberg...')
  const res = await fetch('https://www.gutenberg.org/cache/epub/3300/pg3300.txt')
  const text = await res.text()

  // Find start and end markers
  const startIdx = text.indexOf('*** START OF THE PROJECT GUTENBERG EBOOK')
  const endIdx = text.indexOf('*** END OF THE PROJECT GUTENBERG EBOOK')
  const content = text.slice(
    text.indexOf('\n', startIdx) + 1,
    endIdx
  ).trim()

  // Split into chapters by "CHAPTER" markers
  const chapterRegex = /\n\s*CHAPTER\s+([IVXLC]+)\.\s*\n\s*([^\n]+)/g
  const splits = []
  let match
  while ((match = chapterRegex.exec(content)) !== null) {
    splits.push({
      index: match.index,
      roman: match[1],
      title: match[2].trim()
    })
  }

  const chapters = []
  for (let i = 0; i < splits.length; i++) {
    const start = splits[i].index
    const end = i < splits.length - 1 ? splits[i + 1].index : content.length
    const chapterContent = content.slice(start, end).trim()
    chapters.push({
      num: i + 1,
      title: `Chapter ${splits[i].roman}: ${splits[i].title}`,
      content: chapterContent
    })
  }

  return chapters
}

async function insertChapters(bookId, chapters) {
  // Delete existing chapters
  await db.from('chapters').delete().eq('book_id', bookId)

  const rows = chapters.map(ch => ({
    id: crypto.randomUUID(),
    book_id: bookId,
    chapter_number: ch.num,
    title: ch.title,
    content: ch.content,
    word_count: ch.content.split(/\s+/).filter(Boolean).length,
    reading_time_minutes: Math.ceil(ch.content.split(/\s+/).filter(Boolean).length / 250),
  }))

  // Insert in batches of 10 (some chapters are large)
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10)
    const { error } = await db.from('chapters').insert(batch)
    if (error) {
      console.error(`  Error inserting batch ${i}:`, error.message)
      // Try one by one
      for (const row of batch) {
        const { error: e2 } = await db.from('chapters').insert(row)
        if (e2) console.error(`  Error inserting chapter "${row.title}":`, e2.message)
        else console.log(`  ✓ ${row.title} (${row.word_count} words)`)
      }
    } else {
      for (const row of batch) {
        console.log(`  ✓ ${row.title} (${row.word_count} words)`)
      }
    }
  }

  // Update book word count
  const totalWords = rows.reduce((sum, r) => sum + r.word_count, 0)
  await db.from('books').update({ word_count: totalWords }).eq('id', bookId)
  console.log(`  Total: ${rows.length} chapters, ${totalWords} words`)
}

async function main() {
  console.log('═══ Loading Books into LiberAi ═══\n')

  // ── Das Kapital ──
  console.log('📕 DAS KAPITAL (Karl Marx)')
  const kapitalChapters = []
  for (const ch of KAPITAL_CHAPTERS) {
    try {
      const text = await fetchChapterText(ch.url)
      kapitalChapters.push({ num: ch.num, title: ch.title, content: text })
      console.log(`  ✓ Fetched: ${ch.title} (${text.split(/\s+/).length} words)`)
    } catch (e) {
      console.error(`  ✗ Failed: ${ch.title} — ${e.message}`)
    }
  }
  console.log(`\nInserting ${kapitalChapters.length} chapters...`)
  await insertChapters(MARX_BOOK_ID, kapitalChapters)

  // ── Wealth of Nations ──
  console.log('\n📗 THE WEALTH OF NATIONS (Adam Smith)')
  const smithChapters = await fetchWealthOfNations()
  console.log(`  Parsed ${smithChapters.length} chapters`)
  console.log(`\nInserting ${smithChapters.length} chapters...`)
  await insertChapters(SMITH_BOOK_ID, smithChapters)

  console.log('\n═══ Done loading books ═══')
}

main().catch(e => { console.error(e); process.exit(1) })
