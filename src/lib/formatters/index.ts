/**
 * Platform-specific formatters for chapter content.
 * Used by both the AI chat tools (server-side) and the reader share modal (client-side).
 */

export interface ChapterData {
  title: string
  content: string
  chapterNumber: number
  bookTitle: string
  authorName: string
}

export interface FormatResult {
  formatted: string
  platform: 'substack' | 'twitter' | 'newsletter'
  tweetCount?: number
}

// ─── Substack ────────────────────────────────────────────────

export function formatForSubstack(chapter: ChapterData): FormatResult {
  const paragraphs = chapter.content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const lines: string[] = [
    `# ${chapter.title}`,
    '',
    `*From "${chapter.bookTitle}" by ${chapter.authorName}*`,
    '',
    ...paragraphs,
    '',
    '---',
    '',
    `*This is Chapter ${chapter.chapterNumber} of "${chapter.bookTitle}" by ${chapter.authorName}. Read the full book and chat with the AI on [LiberAi](https://liberai.vercel.app).*`,
  ]

  return {
    formatted: lines.join('\n\n'),
    platform: 'substack',
  }
}

// ─── Twitter / X Thread ──────────────────────────────────────

const TWEET_LIMIT = 280
const THREAD_HOOK_LIMIT = 250 // leave room for "🧵👇"

function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by a space or newline
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildTweets(sentences: string[], maxTweets: number = 15): string[] {
  const tweets: string[] = []
  let current = ''

  for (const sentence of sentences) {
    // If adding this sentence would exceed the limit, push current and start new
    const candidate = current ? `${current} ${sentence}` : sentence

    if (candidate.length > TWEET_LIMIT - 10) {
      // -10 for " (X/N)" suffix
      if (current) {
        tweets.push(current)
        current = sentence.length > TWEET_LIMIT - 10 ? sentence.slice(0, TWEET_LIMIT - 13) + '...' : sentence
      } else {
        // Single sentence too long, truncate
        tweets.push(sentence.slice(0, TWEET_LIMIT - 13) + '...')
        current = ''
      }
    } else {
      current = candidate
    }

    if (tweets.length >= maxTweets - 1) break
  }

  if (current) tweets.push(current)

  return tweets.slice(0, maxTweets)
}

export function formatForTwitter(chapter: ChapterData): FormatResult {
  const sentences = splitIntoSentences(chapter.content)
  const contentTweets = buildTweets(sentences, 13)
  const totalTweets = contentTweets.length + 2 // hook + CTA

  // Build the thread
  const hook = `${chapter.title} — from "${chapter.bookTitle}" by ${chapter.authorName}`
  const hookTweet = hook.length > THREAD_HOOK_LIMIT
    ? hook.slice(0, THREAD_HOOK_LIMIT - 3) + '...'
    : hook

  const thread: string[] = [
    `${hookTweet} 🧵👇`,
    ...contentTweets,
    `That's Chapter ${chapter.chapterNumber} of "${chapter.bookTitle}". Chat with the book's AI and dive deeper at liberai.vercel.app 📚`,
  ]

  // Add numbering
  const numbered = thread.map((tweet, i) => `(${i + 1}/${thread.length}) ${tweet}`)

  return {
    formatted: numbered.join('\n\n---\n\n'),
    platform: 'twitter',
    tweetCount: thread.length,
  }
}

// ─── Newsletter (HTML) ───────────────────────────────────────

export function formatForNewsletter(chapter: ChapterData): FormatResult {
  const paragraphs = chapter.content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin: 0 0 16px 0; line-height: 1.7; color: #374151;">${escapeHtml(p)}</p>`)
    .join('\n')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Georgia, 'Times New Roman', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
    <!-- Header -->
    <div style="border-bottom: 2px solid #7c3aed; padding-bottom: 20px; margin-bottom: 32px;">
      <h1 style="margin: 0 0 8px 0; font-size: 28px; color: #111827;">${escapeHtml(chapter.title)}</h1>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        Chapter ${chapter.chapterNumber} of <em>${escapeHtml(chapter.bookTitle)}</em> by ${escapeHtml(chapter.authorName)}
      </p>
    </div>

    <!-- Content -->
    ${paragraphs}

    <!-- Footer -->
    <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px; text-align: center;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280;">
        Enjoyed this chapter? Read the full book and chat with the AI.
      </p>
      <a href="https://liberai.vercel.app" style="display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
        Explore on LiberAi
      </a>
    </div>
  </div>
</body>
</html>`

  return {
    formatted: html,
    platform: 'newsletter',
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ─── Dispatcher ──────────────────────────────────────────────

export function formatChapterForPlatform(
  chapter: ChapterData,
  platform: 'substack' | 'twitter' | 'newsletter',
): FormatResult {
  switch (platform) {
    case 'substack':
      return formatForSubstack(chapter)
    case 'twitter':
      return formatForTwitter(chapter)
    case 'newsletter':
      return formatForNewsletter(chapter)
  }
}
