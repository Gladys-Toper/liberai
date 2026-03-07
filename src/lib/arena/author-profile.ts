/**
 * Author Profile Resolver — scalable, automatic system for ANY author.
 *
 * When a debate is created, this module:
 *  1. Uses Grok/Grokipedia (xAI) as PRIMARY to extract structured author metadata
 *     (nationality, era, accent) — falls back to Gemini Flash when XAI key unavailable
 *  2. Fetches the author's Wikipedia portrait (secondary — photorealistic historical image)
 *  3. Caches results in the `authors` table so it's a one-time lookup
 *  4. Resolves accent-appropriate voice profiles for TTS/video generation
 *
 * Works for any historical or contemporary author — no hardcoded names.
 * Grokipedia (xAI Grok) = PRIMARY knowledge source, Wikipedia = secondary (portraits only).
 */
import { createClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { xai } from '@ai-sdk/xai'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Types ────────────────────────────────────────────────────────────────

export interface AuthorProfile {
  portraitUrl: string | null
  nationality: string | null
  era: string | null
  /** D-ID voice config: Microsoft Azure voice ID for accent-appropriate English TTS */
  didVoiceId: string | null
  /** Accent description for browser TTS fallback */
  accentHint: string | null
}

export interface VoiceProfile {
  pitch: number
  rate: number
  volume: number
  accentHint: string
  preferredVoices: string[]
  /** D-ID Microsoft Azure Neural voice ID */
  didVoiceId: string
}

// ── Grok AI Metadata Extraction ──────────────────────────────────────────

interface GrokAuthorMeta {
  nationality: string
  era: string
  accentHint: string
  didVoiceId: string
}

/**
 * Uses AI to extract structured author metadata.
 * PRIMARY: Grok (xAI) — Grokipedia-style AI encyclopedia knowledge.
 * FALLBACK: Gemini Flash when XAI_API_KEY is not configured.
 *
 * Returns nationality, historical era, accent description, and a
 * Microsoft Azure Neural voice ID for accent-appropriate English TTS.
 */
async function extractAuthorMetadataWithAI(authorName: string): Promise<GrokAuthorMeta | null> {
  try {
    // Grokipedia as PRIMARY source — xAI Grok has deep encyclopedic knowledge
    // Falls back to Gemini Flash only when XAI_API_KEY is not configured
    const isXAIConfigured = !!process.env.XAI_API_KEY
    const model = isXAIConfigured
      ? xai('grok-4.1-fast')
      : google('gemini-3.1-flash')

    const { text } = await generateText({
      model,
      prompt: `You are an encyclopedia. Given the author name "${authorName}", return ONLY a JSON object with these fields:
{
  "nationality": "<nationality, e.g. German, Scottish, American, French, Russian, etc.>",
  "era": "<historical era, e.g. 18th century, 19th century, modern, ancient, etc.>",
  "accentHint": "<what accent they would have speaking English, e.g. german, scottish, british-rp, american, french, russian, etc.>",
  "didVoiceId": "<Microsoft Azure Neural voice ID for accent-appropriate English, choose from: en-GB-RyanNeural (British male), en-GB-ThomasNeural (British older male), en-US-GuyNeural (American male), en-US-DavisNeural (American deeper male), en-AU-WilliamNeural (Australian male), en-IE-ConnorNeural (Irish male), en-IN-PrabhatNeural (Indian male), de-DE-ConradNeural (German male), fr-FR-HenriNeural (French male), es-ES-AlvaroNeural (Spanish male), it-IT-DiegoNeural (Italian male), pt-BR-AntonioNeural (Portuguese male), ru-RU-DmitryNeural (Russian male), ja-JP-KeitaNeural (Japanese male), zh-CN-YunxiNeural (Chinese male), ko-KR-InJoonNeural (Korean male), ar-SA-HamedNeural (Arabic male), hi-IN-MadhurNeural (Hindi male), pl-PL-MarekNeural (Polish male), tr-TR-AhmetNeural (Turkish male), nl-NL-MaartenNeural (Dutch male), sv-SE-MattiasNeural (Swedish male)>"
}
Return ONLY valid JSON, no markdown, no explanation.`,
    })

    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      nationality: parsed.nationality || null,
      era: parsed.era || null,
      accentHint: parsed.accentHint || 'neutral',
      didVoiceId: parsed.didVoiceId || 'en-GB-RyanNeural',
    }
  } catch (err) {
    console.error(`AI metadata extraction failed for "${authorName}":`, err)
    return null
  }
}

// ── Wikipedia Portrait Resolution ────────────────────────────────────────

/**
 * Fetches an author's portrait from Wikipedia REST API.
 * Returns the highest resolution image available.
 */
async function fetchWikipediaPortrait(authorName: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(authorName.replace(/\s+/g, '_'))
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      {
        headers: { 'User-Agent': 'LiberAI/1.0 (arena portrait resolver)' },
        next: { revalidate: 86400 },
      },
    )

    if (!res.ok) return null

    const data = await res.json()
    return data.originalimage?.source || data.thumbnail?.source || null
  } catch {
    return null
  }
}

/**
 * Fallback: extract nationality/era from Wikipedia text when AI extraction fails.
 */
function extractNationalityFromWikipedia(description: string, extract: string): {
  nationality: string | null
  era: string | null
} {
  const text = `${description} ${extract}`.toLowerCase()

  const patterns: Array<[RegExp, string]> = [
    [/\bgerman[-\s]born\b|\bgerman\b|\bprussian\b/, 'German'],
    [/\bscottish\b/, 'Scottish'],
    [/\benglish\b/, 'English'],
    [/\bbritish\b/, 'British'],
    [/\bamerican\b/, 'American'],
    [/\bfrench\b/, 'French'],
    [/\brussian\b/, 'Russian'],
    [/\bitalian\b/, 'Italian'],
    [/\bspanish\b/, 'Spanish'],
    [/\bportuguese\b/, 'Portuguese'],
    [/\bdutch\b/, 'Dutch'],
    [/\bswiss\b/, 'Swiss'],
    [/\baustrian\b/, 'Austrian'],
    [/\bswedish\b/, 'Swedish'],
    [/\bnorwegian\b/, 'Norwegian'],
    [/\bdanish\b/, 'Danish'],
    [/\bpolish\b/, 'Polish'],
    [/\bczech\b/, 'Czech'],
    [/\bhungarian\b/, 'Hungarian'],
    [/\bgreek\b/, 'Greek'],
    [/\bjapanese\b/, 'Japanese'],
    [/\bchinese\b/, 'Chinese'],
    [/\bkorean\b/, 'Korean'],
    [/\bindian\b/, 'Indian'],
    [/\barab\b/, 'Arab'],
    [/\bpersian\b|\biranian\b/, 'Persian'],
    [/\bturkish\b/, 'Turkish'],
    [/\bbrazilian\b/, 'Brazilian'],
    [/\bargentine\b|\bargentinian\b/, 'Argentine'],
    [/\bmexican\b/, 'Mexican'],
    [/\baustralian\b/, 'Australian'],
    [/\bcanadian\b/, 'Canadian'],
    [/\birish\b/, 'Irish'],
    [/\bwelsh\b/, 'Welsh'],
    [/\bnigerian\b/, 'Nigerian'],
    [/\bsouth african\b/, 'South African'],
    [/\begyptian\b/, 'Egyptian'],
    [/\bisraeli\b/, 'Israeli'],
  ]

  let nationality: string | null = null
  for (const [pattern, name] of patterns) {
    if (pattern.test(text)) {
      nationality = name
      break
    }
  }

  let era: string | null = null
  const yearMatch = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/)
  if (yearMatch) {
    const year = parseInt(yearMatch[1])
    if (year < 1500) era = 'medieval'
    else if (year < 1600) era = '16th century'
    else if (year < 1700) era = '17th century'
    else if (year < 1800) era = '18th century'
    else if (year < 1900) era = '19th century'
    else if (year < 2000) era = '20th century'
    else era = '21st century'
  }

  return { nationality, era }
}

// ── Cached Profile Resolution ────────────────────────────────────────────

/**
 * Resolves an author's arena profile (portrait + nationality + era + voice).
 * Pipeline:
 *   1. Check DB cache
 *   2. AI extraction (Grok/Gemini) for metadata
 *   3. Wikipedia for portrait image
 *   4. Cache in DB for subsequent loads
 */
export async function resolveAuthorProfile(
  authorId: string,
  authorName: string,
): Promise<AuthorProfile> {
  const db = getServiceClient()

  // Check DB cache first
  const { data: cached } = await db
    .from('authors')
    .select('portrait_url, nationality, era')
    .eq('id', authorId)
    .single()

  if (cached?.portrait_url && cached?.nationality) {
    // Resolve D-ID voice from cached nationality
    const voiceProfile = resolveVoiceProfile(cached.nationality)
    return {
      portraitUrl: cached.portrait_url,
      nationality: cached.nationality,
      era: cached.era,
      didVoiceId: voiceProfile.didVoiceId,
      accentHint: voiceProfile.accentHint,
    }
  }

  // Fetch portrait + metadata in parallel
  const [aiMeta, portraitUrl] = await Promise.all([
    extractAuthorMetadataWithAI(authorName),
    fetchWikipediaPortrait(authorName),
  ])

  // If AI extraction failed, try Wikipedia text fallback
  let nationality = aiMeta?.nationality || null
  let era = aiMeta?.era || null
  let didVoiceId = aiMeta?.didVoiceId || null
  let accentHint = aiMeta?.accentHint || null

  if (!nationality) {
    // Fallback: fetch Wikipedia summary for text-based extraction
    try {
      const encoded = encodeURIComponent(authorName.replace(/\s+/g, '_'))
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { 'User-Agent': 'LiberAI/1.0' } },
      )
      if (res.ok) {
        const data = await res.json()
        const fallback = extractNationalityFromWikipedia(
          data.description || '',
          data.extract || '',
        )
        nationality = fallback.nationality
        era = era || fallback.era
      }
    } catch { /* non-critical */ }
  }

  // Resolve voice profile from nationality
  const voiceProfile = resolveVoiceProfile(nationality)
  didVoiceId = didVoiceId || voiceProfile.didVoiceId
  accentHint = accentHint || voiceProfile.accentHint

  // Cache in DB (best-effort, non-blocking)
  if (portraitUrl || nationality || era) {
    void db.from('authors')
      .update({
        portrait_url: portraitUrl || cached?.portrait_url,
        nationality: nationality,
        era: era,
      })
      .eq('id', authorId)
      .then(null, () => {})
  }

  return {
    portraitUrl: portraitUrl || cached?.portrait_url || null,
    nationality,
    era,
    didVoiceId,
    accentHint,
  }
}

// ── Voice Profile Resolution ─────────────────────────────────────────────

/**
 * Accent-to-voice mapping for browser TTS + D-ID video.
 * Maps nationalities to Web Speech API voices (browser fallback)
 * and Microsoft Azure Neural voice IDs (D-ID video).
 */
const ACCENT_VOICE_MAP: Record<string, {
  accentHint: string
  preferredVoices: string[]
  pitch: number
  rate: number
  didVoiceId: string
}> = {
  German: {
    accentHint: 'german',
    preferredVoices: ['Google Deutsch', 'Anna', 'Markus', 'Daniel'],
    pitch: 0.7, rate: 0.82,
    didVoiceId: 'de-DE-ConradNeural',
  },
  Austrian: {
    accentHint: 'german',
    preferredVoices: ['Google Deutsch', 'Anna', 'Daniel'],
    pitch: 0.75, rate: 0.85,
    didVoiceId: 'de-DE-ConradNeural',
  },
  Swiss: {
    accentHint: 'german',
    preferredVoices: ['Google Deutsch', 'Daniel'],
    pitch: 0.8, rate: 0.85,
    didVoiceId: 'de-DE-ConradNeural',
  },
  Scottish: {
    accentHint: 'scottish',
    preferredVoices: ['Fiona', 'Google UK English Male', 'Daniel'],
    pitch: 0.9, rate: 0.88,
    didVoiceId: 'en-GB-RyanNeural',
  },
  English: {
    accentHint: 'british',
    preferredVoices: ['Daniel', 'Google UK English Male', 'Oliver'],
    pitch: 0.95, rate: 0.92,
    didVoiceId: 'en-GB-ThomasNeural',
  },
  British: {
    accentHint: 'british',
    preferredVoices: ['Daniel', 'Google UK English Male', 'Oliver'],
    pitch: 0.9, rate: 0.9,
    didVoiceId: 'en-GB-RyanNeural',
  },
  Irish: {
    accentHint: 'irish',
    preferredVoices: ['Moira', 'Google UK English Male', 'Daniel'],
    pitch: 0.95, rate: 0.9,
    didVoiceId: 'en-IE-ConnorNeural',
  },
  Welsh: {
    accentHint: 'welsh',
    preferredVoices: ['Google UK English Male', 'Daniel'],
    pitch: 0.9, rate: 0.88,
    didVoiceId: 'en-GB-RyanNeural',
  },
  French: {
    accentHint: 'french',
    preferredVoices: ['Thomas', 'Google français', 'Daniel'],
    pitch: 1.0, rate: 0.9,
    didVoiceId: 'fr-FR-HenriNeural',
  },
  Italian: {
    accentHint: 'italian',
    preferredVoices: ['Luca', 'Google italiano', 'Daniel'],
    pitch: 1.05, rate: 0.95,
    didVoiceId: 'it-IT-DiegoNeural',
  },
  Spanish: {
    accentHint: 'spanish',
    preferredVoices: ['Jorge', 'Google español', 'Daniel'],
    pitch: 1.0, rate: 0.95,
    didVoiceId: 'es-ES-AlvaroNeural',
  },
  Portuguese: {
    accentHint: 'portuguese',
    preferredVoices: ['Google português', 'Daniel'],
    pitch: 1.0, rate: 0.92,
    didVoiceId: 'pt-BR-AntonioNeural',
  },
  Russian: {
    accentHint: 'russian',
    preferredVoices: ['Milena', 'Google русский', 'Daniel'],
    pitch: 0.8, rate: 0.85,
    didVoiceId: 'ru-RU-DmitryNeural',
  },
  Polish: {
    accentHint: 'polish',
    preferredVoices: ['Zosia', 'Google polski', 'Daniel'],
    pitch: 0.9, rate: 0.88,
    didVoiceId: 'pl-PL-MarekNeural',
  },
  Czech: {
    accentHint: 'czech',
    preferredVoices: ['Zuzana', 'Daniel'],
    pitch: 0.9, rate: 0.88,
    didVoiceId: 'en-GB-RyanNeural',
  },
  Swedish: {
    accentHint: 'scandinavian',
    preferredVoices: ['Alva', 'Daniel'],
    pitch: 0.95, rate: 0.9,
    didVoiceId: 'sv-SE-MattiasNeural',
  },
  Norwegian: {
    accentHint: 'scandinavian',
    preferredVoices: ['Nora', 'Daniel'],
    pitch: 0.95, rate: 0.88,
    didVoiceId: 'en-GB-RyanNeural',
  },
  Danish: {
    accentHint: 'scandinavian',
    preferredVoices: ['Sara', 'Daniel'],
    pitch: 0.95, rate: 0.88,
    didVoiceId: 'en-GB-RyanNeural',
  },
  American: {
    accentHint: 'american',
    preferredVoices: ['Alex', 'Google US English', 'Samantha'],
    pitch: 1.0, rate: 0.95,
    didVoiceId: 'en-US-GuyNeural',
  },
  Chinese: {
    accentHint: 'chinese',
    preferredVoices: ['Google 普通话', 'Ting-Ting', 'Daniel'],
    pitch: 1.0, rate: 0.85,
    didVoiceId: 'zh-CN-YunxiNeural',
  },
  Japanese: {
    accentHint: 'japanese',
    preferredVoices: ['Google 日本語', 'Kyoko', 'Daniel'],
    pitch: 1.0, rate: 0.85,
    didVoiceId: 'ja-JP-KeitaNeural',
  },
  Korean: {
    accentHint: 'korean',
    preferredVoices: ['Google 한국의', 'Yuna', 'Daniel'],
    pitch: 1.0, rate: 0.85,
    didVoiceId: 'ko-KR-InJoonNeural',
  },
  Indian: {
    accentHint: 'indian',
    preferredVoices: ['Google हिन्दी', 'Rishi', 'Daniel'],
    pitch: 1.0, rate: 0.92,
    didVoiceId: 'en-IN-PrabhatNeural',
  },
  Arab: {
    accentHint: 'arabic',
    preferredVoices: ['Maged', 'Google العربية', 'Daniel'],
    pitch: 0.85, rate: 0.85,
    didVoiceId: 'ar-SA-HamedNeural',
  },
  Persian: {
    accentHint: 'persian',
    preferredVoices: ['Daniel', 'Google UK English Male'],
    pitch: 0.85, rate: 0.85,
    didVoiceId: 'en-GB-RyanNeural',
  },
  Turkish: {
    accentHint: 'turkish',
    preferredVoices: ['Yelda', 'Daniel'],
    pitch: 0.95, rate: 0.9,
    didVoiceId: 'tr-TR-AhmetNeural',
  },
  Greek: {
    accentHint: 'greek',
    preferredVoices: ['Google Ελληνικά', 'Daniel'],
    pitch: 0.9, rate: 0.85,
    didVoiceId: 'en-GB-ThomasNeural',
  },
  Dutch: {
    accentHint: 'dutch',
    preferredVoices: ['Google Nederlands', 'Daniel'],
    pitch: 0.9, rate: 0.9,
    didVoiceId: 'nl-NL-MaartenNeural',
  },
  Hungarian: {
    accentHint: 'hungarian',
    preferredVoices: ['Daniel'],
    pitch: 0.9, rate: 0.88,
    didVoiceId: 'en-GB-RyanNeural',
  },
  Brazilian: {
    accentHint: 'brazilian',
    preferredVoices: ['Google português', 'Daniel'],
    pitch: 1.0, rate: 0.95,
    didVoiceId: 'pt-BR-AntonioNeural',
  },
  Argentine: {
    accentHint: 'spanish',
    preferredVoices: ['Google español', 'Daniel'],
    pitch: 1.0, rate: 0.95,
    didVoiceId: 'es-ES-AlvaroNeural',
  },
  Mexican: {
    accentHint: 'spanish',
    preferredVoices: ['Google español', 'Daniel'],
    pitch: 1.0, rate: 0.95,
    didVoiceId: 'es-ES-AlvaroNeural',
  },
  Australian: {
    accentHint: 'australian',
    preferredVoices: ['Karen', 'Daniel'],
    pitch: 1.0, rate: 0.95,
    didVoiceId: 'en-AU-WilliamNeural',
  },
  Canadian: {
    accentHint: 'canadian',
    preferredVoices: ['Alex', 'Google US English', 'Daniel'],
    pitch: 1.0, rate: 0.95,
    didVoiceId: 'en-US-GuyNeural',
  },
  Nigerian: {
    accentHint: 'nigerian',
    preferredVoices: ['Daniel'],
    pitch: 0.9, rate: 0.9,
    didVoiceId: 'en-GB-RyanNeural',
  },
  'South African': {
    accentHint: 'south-african',
    preferredVoices: ['Daniel'],
    pitch: 0.9, rate: 0.9,
    didVoiceId: 'en-GB-RyanNeural',
  },
  Egyptian: {
    accentHint: 'arabic',
    preferredVoices: ['Maged', 'Daniel'],
    pitch: 0.85, rate: 0.85,
    didVoiceId: 'ar-SA-HamedNeural',
  },
  Israeli: {
    accentHint: 'israeli',
    preferredVoices: ['Daniel'],
    pitch: 0.95, rate: 0.9,
    didVoiceId: 'en-US-GuyNeural',
  },
}

const DEFAULT_VOICE: VoiceProfile = {
  pitch: 0.9,
  rate: 0.9,
  volume: 1.0,
  accentHint: 'neutral',
  preferredVoices: ['Daniel', 'Google UK English Male', 'Alex'],
  didVoiceId: 'en-GB-RyanNeural',
}

/**
 * Resolves a voice profile for an author based on their nationality.
 * Used by both browser TTS (fallback) and D-ID video (primary).
 */
export function resolveVoiceProfile(nationality: string | null): VoiceProfile {
  if (!nationality) return DEFAULT_VOICE

  const mapping = ACCENT_VOICE_MAP[nationality]
  if (!mapping) return DEFAULT_VOICE

  return {
    pitch: mapping.pitch,
    rate: mapping.rate,
    volume: 1.0,
    accentHint: mapping.accentHint,
    preferredVoices: mapping.preferredVoices,
    didVoiceId: mapping.didVoiceId,
  }
}

// ── Batch resolution for debate creation ──────────────────────────────────

/**
 * Resolves profiles for both authors in a debate.
 * Called automatically during debate creation or first load.
 */
export async function resolveDebateAuthorProfiles(
  bookAAuthorId: string,
  bookAAuthorName: string,
  bookBAuthorId: string,
  bookBAuthorName: string,
): Promise<{
  authorA: AuthorProfile & { voiceProfile: VoiceProfile }
  authorB: AuthorProfile & { voiceProfile: VoiceProfile }
}> {
  const [profileA, profileB] = await Promise.all([
    resolveAuthorProfile(bookAAuthorId, bookAAuthorName),
    resolveAuthorProfile(bookBAuthorId, bookBAuthorName),
  ])

  return {
    authorA: {
      ...profileA,
      voiceProfile: resolveVoiceProfile(profileA.nationality),
    },
    authorB: {
      ...profileB,
      voiceProfile: resolveVoiceProfile(profileB.nationality),
    },
  }
}
