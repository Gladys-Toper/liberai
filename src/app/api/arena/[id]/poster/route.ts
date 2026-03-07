// POST /api/arena/[id]/poster — Generate 1960s fight poster via Nano Banana 2
// GET  /api/arena/[id]/poster — Fetch existing poster URL

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from '@ai-sdk/google'
import { generateImage } from 'ai'

export const maxDuration = 60

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── GET: Fetch existing poster ─────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const db = getServiceClient()
    const { data: session, error } = await db
      .from('debate_sessions')
      .select('poster_url')
      .eq('id', id)
      .single()

    if (error || !session) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
    }

    return NextResponse.json({ posterUrl: session.poster_url || null })
  } catch (err) {
    console.error('[Poster] GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ─── POST: Generate fight poster ────────────────────────────────

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = getServiceClient()

  try {
    // 1. Fetch session + book/author data
    const { data: session, error: sessionError } = await db
      .from('debate_sessions')
      .select('id, book_a_id, book_b_id, crucible_question, poster_url')
      .eq('id', id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 })
    }

    // 2. Return cached poster if it exists
    if (session.poster_url) {
      return NextResponse.json({ posterUrl: session.poster_url })
    }

    // 3. Get book titles + author names
    const [{ data: bookA }, { data: bookB }] = await Promise.all([
      db.from('books').select('title, author_id').eq('id', session.book_a_id).single(),
      db.from('books').select('title, author_id').eq('id', session.book_b_id).single(),
    ])

    if (!bookA || !bookB) {
      return NextResponse.json({ error: 'Books not found' }, { status: 404 })
    }

    const authorIds = [bookA.author_id, bookB.author_id].filter(Boolean)
    const { data: authors } = await db
      .from('authors')
      .select('id, display_name')
      .in('id', authorIds)

    const authorMap = new Map(
      (authors || []).map((a: { id: string; display_name: string }) => [a.id, a.display_name])
    )

    const authorAName = authorMap.get(bookA.author_id) || 'Author A'
    const authorBName = authorMap.get(bookB.author_id) || 'Author B'
    const crucible = session.crucible_question || 'The Battle of Ideas'

    // 4. Build fight poster prompt
    const prompt = buildFightPosterPrompt(
      authorAName,
      authorBName,
      bookA.title,
      bookB.title,
      crucible,
    )

    // 5. Generate image via Nano Banana 2
    // ALLOWED: Nano Banana 2 for fight poster — not a debate pipeline model
    const { images } = await generateImage({
      model: google.image('gemini-3.1-flash-image-preview'),
      prompt,
      aspectRatio: '16:9',
      providerOptions: {
        google: { personGeneration: 'allow_adult' as const },
      },
    })

    if (!images || images.length === 0 || !images[0].uint8Array) {
      return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
    }

    // 6. Upload to Supabase Storage
    const buffer = Buffer.from(images[0].uint8Array)
    const fileName = `posters/${id}.png`

    const { error: uploadError } = await db.storage
      .from('debate-video')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      console.error('[Poster] Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // 7. Get public URL and save to DB
    const { data: publicData } = db.storage
      .from('debate-video')
      .getPublicUrl(fileName)

    const posterUrl = publicData?.publicUrl || null

    if (posterUrl) {
      await db
        .from('debate_sessions')
        .update({ poster_url: posterUrl })
        .eq('id', id)
    }

    return NextResponse.json({ posterUrl })
  } catch (err) {
    console.error('[Poster] Generation error:', err)
    return NextResponse.json({ error: 'Poster generation failed' }, { status: 500 })
  }
}

// ─── Prompt Builder ─────────────────────────────────────────────

function buildFightPosterPrompt(
  authorA: string,
  authorB: string,
  bookA: string,
  bookB: string,
  crucible: string,
): string {
  return `1960s vintage boxing fight poster in the style of Muhammad Ali vs Joe Frazier promotional art.

LEFT SIDE: ${authorA}, fierce intellectual warrior, wearing a scholarly robe with dramatic pose
RIGHT SIDE: ${authorB}, determined philosophical combatant, wearing a scholarly robe with fighting stance

CENTER: Large dramatic text "THE BATTLE OF IDEAS"
SUBTITLE: "${crucible}"

Bottom text: "${bookA}" vs "${bookB}"

Style: Aged paper texture, bold red and gold and black color scheme, dramatic spotlight lighting, hand-drawn illustration style, vintage typography with decorative borders, slight grain and wear marks, weathered edges. Classic boxing promotional poster composition. No photographs. Illustration only. Dramatic and cinematic.`
}
