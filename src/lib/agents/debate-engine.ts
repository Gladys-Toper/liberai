// Sprint 7→8: Ontological Pugilism — Core debate engine (multi-model)
import { createClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { searchBookChunks } from '@/lib/ai/rag'
import { registerAgent } from '@/lib/db/queries/agents'
import { dispatchEvent } from '@/lib/agents/event-dispatcher'
import { recordInteraction } from '@/lib/agents/trust'
import {
  DefaultArenaModelProvider,
  type ArenaModelProvider,
} from '@/lib/arena/model-provider'
import { ElevenLabsAdapter, CartesiaAdapter, type IVoiceService } from '@/lib/arena/voice-service'
import { SimliAdapter } from '@/lib/arena/avatar-service'
import { AV_PROFILES, isAVConfigured } from '@/lib/arena/av-config'
import {
  buildAxiomExtractionPrompt,
  buildCombatantPrompt,
  buildRefereePrompt,
  buildCommentatorPrompt,
  buildSynthesizerPrompt,
  type AxiomInfo,
  type ChunkContext,
} from './debate-prompts'

// ============================================================================
// AV Pipeline — Text → TTS → Simli lip-sync (best-effort, non-blocking)
// ============================================================================

const elevenlabs = new ElevenLabsAdapter()
const cartesia = new CartesiaAdapter()
const simli = new SimliAdapter()

/**
 * Pipe spoken text through TTS → Simli avatar lip-sync.
 * This is best-effort: if AV is not configured or fails, we log and continue.
 * The debate text still gets stored in DB regardless.
 *
 * @param text - The spoken text to synthesize
 * @param role - 'debater_a' | 'debater_b' | 'commentator'
 * @param avSessionId - The active Simli WebRTC session ID for this role
 */
async function pipeAVForRole(
  text: string,
  role: 'debater_a' | 'debater_b' | 'commentator',
  avSessionId: string | null,
): Promise<void> {
  if (!avSessionId || !isAVConfigured()) return

  try {
    const profile = AV_PROFILES[role]
    if (!profile?.voiceId) return

    // Select TTS provider based on role config
    const tts: IVoiceService = profile.ttsProvider === 'cartesia' ? cartesia : elevenlabs

    // Step 1: Text → Audio (PCM 16-bit 16kHz)
    const audioBuffer = await tts.streamAudio(text, profile.voiceId)

    // Step 2: Audio → Simli lip-sync (piped to WebRTC session, auto-streams to browser)
    await simli.pipeAudioToAvatar(audioBuffer, avSessionId)
  } catch (err) {
    // AV is best-effort — log but don't crash the debate
    console.error(`[AV] Failed to pipe audio for ${role}:`, err)
  }
}

// ============================================================================
// Types
// ============================================================================

export interface DebateSession {
  id: string
  swarm_id: string | null
  book_a_id: string
  book_b_id: string
  agent_a_id: string | null
  agent_b_id: string | null
  referee_agent_id: string | null
  commentator_agent_id: string | null
  synthesizer_agent_id: string | null
  initiated_by: string | null
  crucible_question: string
  max_rounds: number
  current_round: number
  status: string
  winner: string | null
  win_condition: string | null
  synthesis: SynthesisResult | null
  model_a: string  // Sprint 8: 'claude' | 'openai'
  model_b: string  // Sprint 8: 'claude' | 'openai'
  created_at: string
  updated_at: string
}

export interface DebateAxiom {
  id: string
  session_id: string
  side: 'a' | 'b'
  axiom_index: number
  label: string
  description: string | null
  source_chunk_ids: string[]
  hp_current: number
  is_destroyed: boolean
  destroyed_at_round: number | null
}

export interface DebateRound {
  id: string
  session_id: string
  round_number: number
  attacker_side: 'a' | 'b'
  status: string
  hp_deltas: HpDelta[]
  commentary: string | null
  created_at: string
  completed_at: string | null
}

export interface DebateArgument {
  id: string
  round_id: string
  session_id: string
  side: 'a' | 'b'
  move_type: 'attack' | 'defense' | 'concession'
  target_axiom_id: string | null
  claim: string
  grounds: string | null
  warrant: string | null
  backing: string | null
  qualifier: string | null
  rebuttal: string | null
  source_chunk_ids: string[]
  source_quotes: string[]
  referee_verdict: RefereeVerdict | null
  raw_llm_response: unknown
}

export interface HpDelta {
  axiom_id: string
  axiom_label: string
  delta: number
  reason: string
}

export interface RefereeVerdict {
  attack_scores: {
    logical_soundness: number
    evidence_relevance: number
    warrant_strength: number
  }
  defense_scores: {
    logical_soundness: number
    evidence_relevance: number
    warrant_strength: number
    rebuttal_strength: number
  }
  penalties: {
    attacker: Array<{ type: string; description: string }>
    defender: Array<{ type: string; description: string }>
  }
  verdict_summary: string
}

export interface SynthesisResult {
  framework_name: string
  thesis_summary: string
  antithesis_summary: string
  synthesis: string
  principles: string[]
  crucible_resolution: string
}

interface BookInfo {
  id: string
  title: string
  author_name: string
}

// ============================================================================
// Helpers
// ============================================================================

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Reconstruct ArenaModelProvider from persisted session data.
 * Each debate has a deterministic model assignment stored in model_a/model_b.
 */
function getProviderFromSession(session: { model_a: string; model_b: string }): ArenaModelProvider {
  return DefaultArenaModelProvider.fromSession(session.model_a, session.model_b)
}

function parseJsonResponse<T>(text: string): T {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '')
  return JSON.parse(cleaned) as T
}

async function getBookInfo(bookId: string): Promise<BookInfo> {
  const db = getServiceClient()
  const { data } = await db
    .from('books')
    .select('id, title, author:authors!books_author_id_fkey(display_name)')
    .eq('id', bookId)
    .single()
  if (!data) throw new Error(`Book ${bookId} not found`)
  // Flatten author join (Supabase may return array or object)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authorData = data.author as any
  const authorName = Array.isArray(authorData)
    ? authorData[0]?.display_name
    : authorData?.display_name
  return { id: data.id, title: data.title, author_name: authorName || 'Unknown' }
}

// ============================================================================
// Create Debate Session
// ============================================================================

export async function createDebateSession(
  bookAId: string,
  bookBId: string,
  crucibleQuestion: string,
  maxRounds = 5,
  initiatedBy?: string,
): Promise<{ session: DebateSession; axioms: DebateAxiom[] }> {
  const db = getServiceClient()

  // Random model assignment: one side gets Claude, the other gets OpenAI
  const provider = DefaultArenaModelProvider.createWithRandomAssignment()

  // Validate books exist
  const [bookA, bookB] = await Promise.all([
    getBookInfo(bookAId),
    getBookInfo(bookBId),
  ])

  // Create swarm for this debate
  const { data: swarm } = await db
    .from('agent_swarms')
    .insert({
      name: `Debate: ${bookA.title} vs ${bookB.title}`,
      purpose: crucibleQuestion,
      initiator_id: null,
      task_type: 'debate',
      target_type: 'debate',
      max_members: 5,
      ttl_minutes: 120,
      status: 'active',
      formed_at: new Date().toISOString(),
    })
    .select()
    .single()

  // Register system agents (owner = initiatedBy or a system user placeholder)
  const ownerId = initiatedBy || '00000000-0000-0000-0000-000000000000'

  const [agentA, agentB, referee, commentator, synthesizer] = await Promise.all([
    registerAgent(ownerId, {
      name: `Debater: ${bookA.title}`,
      agentType: 'debater',
      capabilities: ['debate', 'argumentation', 'rag-retrieval'],
      metadata: { bookId: bookAId, side: 'a', debateSwarmId: swarm?.id },
    }),
    registerAgent(ownerId, {
      name: `Debater: ${bookB.title}`,
      agentType: 'debater',
      capabilities: ['debate', 'argumentation', 'rag-retrieval'],
      metadata: { bookId: bookBId, side: 'b', debateSwarmId: swarm?.id },
    }),
    registerAgent(ownerId, {
      name: 'Referee',
      agentType: 'referee',
      capabilities: ['logic-evaluation', 'scoring', 'fairness'],
      metadata: { debateSwarmId: swarm?.id },
    }),
    registerAgent(ownerId, {
      name: 'Commentator',
      agentType: 'commentator',
      capabilities: ['narration', 'commentary', 'entertainment'],
      metadata: { debateSwarmId: swarm?.id },
    }),
    registerAgent(ownerId, {
      name: 'Synthesizer',
      agentType: 'synthesizer',
      capabilities: ['synthesis', 'hegelian-dialectic', 'framework-generation'],
      metadata: { debateSwarmId: swarm?.id },
    }),
  ])

  // Create debate session
  const { data: session, error } = await db
    .from('debate_sessions')
    .insert({
      swarm_id: swarm?.id,
      book_a_id: bookAId,
      book_b_id: bookBId,
      agent_a_id: agentA.id,
      agent_b_id: agentB.id,
      referee_agent_id: referee.id,
      commentator_agent_id: commentator.id,
      synthesizer_agent_id: synthesizer.id,
      initiated_by: initiatedBy,
      crucible_question: crucibleQuestion,
      max_rounds: maxRounds,
      model_a: provider.modelA,
      model_b: provider.modelB,
      status: 'extracting',
    })
    .select()
    .single()

  if (error || !session) throw new Error(`Failed to create debate session: ${error?.message}`)

  // Extract axioms for both books (using each side's assigned model)
  const [axiomsA, axiomsB] = await Promise.all([
    extractAxioms(session.id, bookAId, 'a', crucibleQuestion, bookA, provider),
    extractAxioms(session.id, bookBId, 'b', crucibleQuestion, bookB, provider),
  ])

  // Update session status to active
  await db
    .from('debate_sessions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', session.id)

  // Dispatch event
  await dispatchEvent({
    eventType: 'debate.started',
    payload: {
      sessionId: session.id,
      bookA: bookA.title,
      bookB: bookB.title,
      crucibleQuestion,
      axiomCountA: axiomsA.length,
      axiomCountB: axiomsB.length,
      modelA: provider.modelA,
      modelB: provider.modelB,
    },
    sourceType: 'system',
  })

  // Insert activity feed entry
  if (initiatedBy) {
    await db.from('activity_feed').insert({
      actor_id: initiatedBy,
      event_type: 'debate_started',
      target_type: 'debate',
      target_id: session.id,
      metadata: {
        book_a_title: bookA.title,
        book_b_title: bookB.title,
        crucible_question: crucibleQuestion,
      },
      source_type: 'system',
    })
  }

  const updatedSession = { ...session, status: 'active' } as DebateSession
  return { session: updatedSession, axioms: [...axiomsA, ...axiomsB] }
}

// ============================================================================
// Extract Axioms
// ============================================================================

async function extractAxioms(
  sessionId: string,
  bookId: string,
  side: 'a' | 'b',
  crucibleQuestion: string,
  bookInfo: BookInfo,
  provider: ArenaModelProvider,
): Promise<DebateAxiom[]> {
  const db = getServiceClient()

  // RAG search for relevant passages
  const chunks = await searchBookChunks(bookId, crucibleQuestion, 15)

  const chunkContexts: ChunkContext[] = chunks.map((c) => ({
    content: c.content,
    chapterTitle: c.chapterTitle,
    chunkId: c.id,
  }))

  const prompt = buildAxiomExtractionPrompt(
    bookInfo.title,
    bookInfo.author_name,
    crucibleQuestion,
    chunkContexts,
  )

  const { text } = await generateText({
    model: provider.getModel('axiom_extractor', side),
    prompt,
    temperature: 0.3,
  })

  const parsed = parseJsonResponse<{ axioms: Array<{
    label: string
    description: string
    source_chunk_ids?: string[]
  }> }>(text)

  // Insert axioms (max 5)
  const axiomRows = parsed.axioms.slice(0, 5).map((a, i) => ({
    session_id: sessionId,
    side,
    axiom_index: i,
    label: a.label,
    description: a.description,
    source_chunk_ids: a.source_chunk_ids || [],
    hp_current: 100,
  }))

  const { data: inserted, error } = await db
    .from('debate_axioms')
    .insert(axiomRows)
    .select()

  if (error) throw new Error(`Failed to insert axioms: ${error.message}`)
  return (inserted || []) as DebateAxiom[]
}

// ============================================================================
// Execute Round
// ============================================================================

/**
 * AV session IDs for live avatar streaming.
 * Pass from the frontend when WebRTC sessions are active.
 * If null/undefined, debate runs text-only (no TTS/lip-sync).
 */
export interface AVSessionIds {
  debaterA: string | null
  debaterB: string | null
  commentator: string | null
}

export async function executeRound(
  sessionId: string,
  avSessions?: AVSessionIds | null,
): Promise<DebateRound> {
  const db = getServiceClient()

  // Fetch session
  const { data: session } = await db
    .from('debate_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) throw new Error('Session not found')
  if (session.status !== 'active') throw new Error(`Session is ${session.status}, not active`)

  // Reconstruct model provider from persisted assignment
  const provider = getProviderFromSession(session)

  const roundNumber = session.current_round + 1
  if (roundNumber > session.max_rounds) throw new Error('Max rounds reached')

  // Alternating attacker: odd rounds = 'a', even rounds = 'b'
  const attackerSide: 'a' | 'b' = roundNumber % 2 === 1 ? 'a' : 'b'
  const defenderSide: 'a' | 'b' = attackerSide === 'a' ? 'b' : 'a'

  const [bookA, bookB] = await Promise.all([
    getBookInfo(session.book_a_id),
    getBookInfo(session.book_b_id),
  ])

  const attackerBook = attackerSide === 'a' ? bookA : bookB
  const defenderBook = attackerSide === 'a' ? bookB : bookA

  // Fetch all axioms
  const { data: allAxioms } = await db
    .from('debate_axioms')
    .select('*')
    .eq('session_id', sessionId)
    .order('axiom_index')

  const axioms = (allAxioms || []) as DebateAxiom[]
  const attackerAxioms = axioms.filter((a) => a.side === attackerSide)
  const defenderAxioms = axioms.filter((a) => a.side === defenderSide)

  // Pick target: highest HP non-destroyed defender axiom
  const targetAxiom = defenderAxioms
    .filter((a) => !a.is_destroyed)
    .sort((a, b) => b.hp_current - a.hp_current)[0]

  if (!targetAxiom) {
    // All axioms destroyed — should have been caught by win condition check
    throw new Error('No valid target axioms remain')
  }

  // Create round record
  const { data: round, error: roundErr } = await db
    .from('debate_rounds')
    .insert({
      session_id: sessionId,
      round_number: roundNumber,
      attacker_side: attackerSide,
      status: 'attacking',
    })
    .select()
    .single()

  if (roundErr || !round) throw new Error(`Failed to create round: ${roundErr?.message}`)

  // Build round history for context
  const { data: prevRounds } = await db
    .from('debate_rounds')
    .select('round_number, attacker_side, commentary')
    .eq('session_id', sessionId)
    .eq('status', 'completed')
    .order('round_number')

  const roundHistory = (prevRounds || [])
    .map((r: { round_number: number; attacker_side: string; commentary: string | null }) =>
      `Round ${r.round_number} (${r.attacker_side === 'a' ? bookA.title : bookB.title} attacks): ${r.commentary || 'No commentary'}`)
    .join('\n')

  const toAxiomInfo = (a: DebateAxiom): AxiomInfo => ({
    id: a.id,
    label: a.label,
    description: a.description,
    hpCurrent: a.hp_current,
    isDestroyed: a.is_destroyed,
  })

  // ---- STEP 1: ATTACKER generates argument ----
  const attackerBookId = attackerSide === 'a' ? session.book_a_id : session.book_b_id
  const attackChunks = await searchBookChunks(attackerBookId, targetAxiom.label + ' ' + session.crucible_question, 10)

  const attackPrompt = buildCombatantPrompt(
    'attacker',
    attackerBook.title,
    attackerBook.author_name,
    session.crucible_question,
    attackChunks.map((c) => ({ content: c.content, chapterTitle: c.chapterTitle, chunkId: c.id })),
    attackerAxioms.map(toAxiomInfo),
    defenderAxioms.map(toAxiomInfo),
    toAxiomInfo(targetAxiom),
    roundHistory,
  )

  const { text: attackText } = await generateText({
    model: provider.getModel('debater', attackerSide),
    prompt: attackPrompt,
    temperature: 0.5,
  })

  const attackPayload = parseJsonResponse<{
    target_axiom_id: string
    claim: string
    grounds: string
    warrant: string
    backing: string
    qualifier: string
    rebuttal: string
    source_chunk_ids: string[]
    source_quotes: string[]
  }>(attackText)

  // AV Pipeline: Pipe attack speech to avatar (non-blocking best-effort)
  const attackAvRole = attackerSide === 'a' ? 'debater_a' : 'debater_b' as const
  const attackAvSession = avSessions?.[attackerSide === 'a' ? 'debaterA' : 'debaterB'] ?? null
  // Use claim as the spoken text — it's the distilled argument
  pipeAVForRole(attackPayload.claim, attackAvRole, attackAvSession).catch(() => {})

  // Insert attack argument
  await db.from('debate_arguments').insert({
    round_id: round.id,
    session_id: sessionId,
    side: attackerSide,
    move_type: 'attack',
    target_axiom_id: targetAxiom.id,
    claim: attackPayload.claim,
    grounds: attackPayload.grounds,
    warrant: attackPayload.warrant,
    backing: attackPayload.backing,
    qualifier: attackPayload.qualifier,
    rebuttal: attackPayload.rebuttal,
    source_chunk_ids: attackPayload.source_chunk_ids || [],
    source_quotes: attackPayload.source_quotes || [],
    raw_llm_response: attackPayload,
  })

  // Update round status
  await db.from('debate_rounds').update({ status: 'defending' }).eq('id', round.id)

  // ---- STEP 2: DEFENDER generates response ----
  const defenderBookId = defenderSide === 'a' ? session.book_a_id : session.book_b_id
  const defenseChunks = await searchBookChunks(defenderBookId, targetAxiom.label + ' ' + attackPayload.claim, 10)

  const defensePrompt = buildCombatantPrompt(
    'defender',
    defenderBook.title,
    defenderBook.author_name,
    session.crucible_question,
    defenseChunks.map((c) => ({ content: c.content, chapterTitle: c.chapterTitle, chunkId: c.id })),
    defenderAxioms.map(toAxiomInfo),
    attackerAxioms.map(toAxiomInfo),
    toAxiomInfo(targetAxiom),
    roundHistory,
  )

  const { text: defenseText } = await generateText({
    model: provider.getModel('debater', defenderSide),
    prompt: defensePrompt,
    temperature: 0.5,
  })

  const defensePayload = parseJsonResponse<{
    move_type: 'defense' | 'concession'
    target_axiom_id: string
    claim: string
    grounds: string
    warrant: string
    backing: string
    qualifier: string
    rebuttal: string
    source_chunk_ids: string[]
    source_quotes: string[]
  }>(defenseText)

  // AV Pipeline: Pipe defense speech to avatar (non-blocking best-effort)
  const defenseAvRole = defenderSide === 'a' ? 'debater_a' : 'debater_b' as const
  const defenseAvSession = avSessions?.[defenderSide === 'a' ? 'debaterA' : 'debaterB'] ?? null
  pipeAVForRole(defensePayload.claim, defenseAvRole, defenseAvSession).catch(() => {})

  // Insert defense argument
  await db.from('debate_arguments').insert({
    round_id: round.id,
    session_id: sessionId,
    side: defenderSide,
    move_type: defensePayload.move_type || 'defense',
    target_axiom_id: targetAxiom.id,
    claim: defensePayload.claim,
    grounds: defensePayload.grounds,
    warrant: defensePayload.warrant,
    backing: defensePayload.backing,
    qualifier: defensePayload.qualifier,
    rebuttal: defensePayload.rebuttal,
    source_chunk_ids: defensePayload.source_chunk_ids || [],
    source_quotes: defensePayload.source_quotes || [],
    raw_llm_response: defensePayload,
  })

  // Update round status
  await db.from('debate_rounds').update({ status: 'judging' }).eq('id', round.id)

  // ---- STEP 3: REFEREE evaluates ----
  const refereePrompt = buildRefereePrompt(
    session.crucible_question,
    attackerBook.title,
    defenderBook.title,
    JSON.stringify(attackPayload, null, 2),
    JSON.stringify(defensePayload, null, 2),
    targetAxiom.label,
  )

  const { text: refereeText } = await generateText({
    model: provider.getModel('referee'),
    prompt: refereePrompt,
    temperature: 0.2,
  })

  const verdict = parseJsonResponse<RefereeVerdict>(refereeText)

  // Store verdict on the defense argument
  await db
    .from('debate_arguments')
    .update({ referee_verdict: verdict })
    .eq('round_id', round.id)
    .eq('side', defenderSide)

  // ---- STEP 4: Calculate HP deltas ----
  const hpDeltas = calculateDamage(verdict, targetAxiom, defensePayload.move_type || 'defense')

  // Apply HP deltas
  for (const delta of hpDeltas) {
    const axiom = axioms.find((a) => a.id === delta.axiom_id)
    if (!axiom) continue

    const newHp = Math.max(0, Math.min(100, axiom.hp_current + delta.delta))
    const isDestroyed = newHp === 0

    await db
      .from('debate_axioms')
      .update({
        hp_current: newHp,
        is_destroyed: isDestroyed,
        ...(isDestroyed ? { destroyed_at_round: roundNumber } : {}),
      })
      .eq('id', delta.axiom_id)

    if (isDestroyed) {
      await dispatchEvent({
        eventType: 'debate.axiom_destroyed',
        payload: {
          sessionId,
          roundNumber,
          axiomId: delta.axiom_id,
          axiomLabel: delta.axiom_label,
          side: axiom.side,
        },
        sourceType: 'system',
      })

      if (session.initiated_by) {
        await db.from('activity_feed').insert({
          actor_id: session.initiated_by,
          event_type: 'debate_axiom_destroyed',
          target_type: 'debate',
          target_id: sessionId,
          metadata: { axiom_label: delta.axiom_label, round: roundNumber, side: axiom.side },
          source_type: 'system',
        })
      }
    }
  }

  // Update round status
  await db.from('debate_rounds').update({ status: 'commenting' }).eq('id', round.id)

  // ---- STEP 5: COMMENTATOR narrates ----
  // Sprint 8: Fetch sponsor context for commentator integration
  const { data: sponsorAssignments } = await db
    .from('debate_sponsor_assignments')
    .select('chyron_text, inserted_at_round, sponsor:arena_sponsors!debate_sponsor_assignments_sponsor_id_fkey(name, tagline, context_prompt)')
    .eq('session_id', sessionId)

  // Build sponsor context string from active sponsors for this round
  const activeSponsorContexts = (sponsorAssignments || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => s.inserted_at_round === null || s.inserted_at_round === roundNumber)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => {
      const sponsor = Array.isArray(s.sponsor) ? s.sponsor[0] : s.sponsor
      return sponsor?.context_prompt || `${sponsor?.name}: ${sponsor?.tagline}`
    })
    .filter(Boolean)

  const sponsorContext = activeSponsorContexts.length > 0
    ? activeSponsorContexts.join(' | ')
    : undefined

  const commentaryPrompt = buildCommentatorPrompt(
    session.crucible_question,
    bookA.title,
    bookB.title,
    roundNumber,
    attackerSide,
    attackPayload.claim,
    defensePayload.claim,
    verdict.verdict_summary,
    hpDeltas.map((d) => ({ axiomLabel: d.axiom_label, delta: d.delta, reason: d.reason })),
    sponsorContext,
  )

  const { text: commentary } = await generateText({
    model: provider.getModel('commentator'),
    prompt: commentaryPrompt,
    temperature: 0.8,
  })

  // AV Pipeline: Pipe commentary to commentator avatar (non-blocking best-effort)
  pipeAVForRole(commentary.trim(), 'commentator', avSessions?.commentator ?? null).catch(() => {})

  // ---- STEP 6: Finalize round ----
  await db
    .from('debate_rounds')
    .update({
      status: 'completed',
      hp_deltas: hpDeltas,
      commentary: commentary.trim(),
      completed_at: new Date().toISOString(),
    })
    .eq('id', round.id)

  // Update session current_round
  await db
    .from('debate_sessions')
    .update({ current_round: roundNumber, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  // Record trust interactions for combatant agents
  const attackerAgentId = attackerSide === 'a' ? session.agent_a_id : session.agent_b_id
  const defenderAgentId = defenderSide === 'a' ? session.agent_a_id : session.agent_b_id
  const attackerPenalties = verdict.penalties.attacker?.length || 0
  const defenderPenalties = verdict.penalties.defender?.length || 0

  if (attackerAgentId) {
    await recordInteraction({
      agentId: attackerAgentId,
      interactionType: 'a2a_task',
      counterpartyType: 'agent',
      counterpartyId: defenderAgentId || undefined,
      outcome: attackerPenalties === 0 ? 'success' : attackerPenalties <= 1 ? 'partial' : 'failure',
      context: { role: 'attacker', round: roundNumber, penalties: attackerPenalties },
    })
  }

  if (defenderAgentId) {
    await recordInteraction({
      agentId: defenderAgentId,
      interactionType: 'a2a_task',
      counterpartyType: 'agent',
      counterpartyId: attackerAgentId || undefined,
      outcome: defenderPenalties === 0 ? 'success' : defenderPenalties <= 1 ? 'partial' : 'failure',
      context: { role: 'defender', round: roundNumber, penalties: defenderPenalties },
    })
  }

  // Dispatch round completion event
  await dispatchEvent({
    eventType: 'debate.round_completed',
    payload: {
      sessionId,
      roundNumber,
      attackerSide,
      hpDeltas,
      commentary: commentary.trim(),
    },
    sourceType: 'system',
  })

  if (session.initiated_by) {
    await db.from('activity_feed').insert({
      actor_id: session.initiated_by,
      event_type: 'debate_round_completed',
      target_type: 'debate',
      target_id: sessionId,
      metadata: { round: roundNumber, attacker_side: attackerSide },
      source_type: 'system',
    })
  }

  // ---- STEP 7: Check win condition ----
  const winResult = await checkWinCondition(sessionId, roundNumber, session.max_rounds)

  if (winResult.over) {
    await db
      .from('debate_sessions')
      .update({
        status: 'completed',
        winner: winResult.winner,
        win_condition: winResult.condition,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    // Sprint 8: Settle prediction market pool
    if (winResult.winner) {
      const { data: pool } = await db
        .from('pug_pools')
        .select('id')
        .eq('session_id', sessionId)
        .in('status', ['open', 'locked'])
        .single()

      if (pool) {
        await db.rpc('settle_pug_pool', {
          p_pool_id: pool.id,
          p_winning_side: winResult.winner,
        })
      }
    }

    await dispatchEvent({
      eventType: 'debate.completed',
      payload: {
        sessionId,
        winner: winResult.winner,
        condition: winResult.condition,
      },
      sourceType: 'system',
    })

    if (session.initiated_by) {
      await db.from('activity_feed').insert({
        actor_id: session.initiated_by,
        event_type: 'debate_completed',
        target_type: 'debate',
        target_id: sessionId,
        metadata: { winner: winResult.winner, condition: winResult.condition },
        source_type: 'system',
      })
    }
  }

  // Fetch final round state
  const { data: finalRound } = await db
    .from('debate_rounds')
    .select('*')
    .eq('id', round.id)
    .single()

  return finalRound as DebateRound
}

// ============================================================================
// HP Damage Calculation
// ============================================================================

export function calculateDamage(
  verdict: RefereeVerdict,
  targetAxiom: DebateAxiom,
  defenseMove: 'defense' | 'concession',
): HpDelta[] {
  const deltas: HpDelta[] = []

  // --- Attacker penalties (applied to attacker's own side — but for simplicity,
  // penalties just reduce effectiveness, not HP of own axioms) ---
  let attackPenalty = 0
  for (const p of verdict.penalties.attacker || []) {
    if (p.type === 'logical_fallacy') attackPenalty += 15
    if (p.type === 'source_deviation') attackPenalty += 30
    if (p.type === 'weak_warrant') attackPenalty += 5
  }

  // --- Base attack damage ---
  const { logical_soundness, evidence_relevance, warrant_strength } = verdict.attack_scores
  const attackQuality = (logical_soundness + evidence_relevance + warrant_strength) / 300
  // Scale: 10-25 damage based on quality, minus penalties that reduce effectiveness
  let baseDamage = Math.round(10 + attackQuality * 15)
  baseDamage = Math.max(0, baseDamage - Math.floor(attackPenalty / 3))

  // --- Defense mitigation ---
  const rebuttalStrength = verdict.defense_scores.rebuttal_strength || 0
  if (rebuttalStrength > 70) {
    baseDamage = Math.round(baseDamage * (1 - (rebuttalStrength - 70) / 100))
  }

  // --- Defender penalties ---
  for (const p of verdict.penalties.defender || []) {
    if (p.type === 'conceded_premise') baseDamage += 20
    if (p.type === 'logical_fallacy') baseDamage += 10
    if (p.type === 'source_deviation') baseDamage += 15
    if (p.type === 'weak_warrant') baseDamage += 5
  }

  // Concession = heavy damage
  if (defenseMove === 'concession') {
    baseDamage = Math.max(baseDamage, 30)
  }

  // Cap damage at remaining HP
  const finalDamage = Math.min(baseDamage, targetAxiom.hp_current)

  if (finalDamage > 0) {
    deltas.push({
      axiom_id: targetAxiom.id,
      axiom_label: targetAxiom.label,
      delta: -finalDamage,
      reason: verdict.verdict_summary,
    })
  }

  return deltas
}

// ============================================================================
// Win Condition Check
// ============================================================================

async function checkWinCondition(
  sessionId: string,
  currentRound: number,
  maxRounds: number,
): Promise<{ over: boolean; winner?: 'a' | 'b' | null; condition?: string }> {
  const db = getServiceClient()

  const { data: axioms } = await db
    .from('debate_axioms')
    .select('*')
    .eq('session_id', sessionId)

  const allAxioms = (axioms || []) as DebateAxiom[]
  const sideA = allAxioms.filter((a) => a.side === 'a')
  const sideB = allAxioms.filter((a) => a.side === 'b')

  const allADestroyed = sideA.every((a) => a.is_destroyed)
  const allBDestroyed = sideB.every((a) => a.is_destroyed)

  // Knockout: all axioms on one side destroyed
  if (allADestroyed && !allBDestroyed) return { over: true, winner: 'b', condition: 'knockout' }
  if (allBDestroyed && !allADestroyed) return { over: true, winner: 'a', condition: 'knockout' }
  if (allADestroyed && allBDestroyed) return { over: true, winner: null, condition: 'draw' }

  // Max rounds reached
  if (currentRound >= maxRounds) {
    const totalHpA = sideA.reduce((sum, a) => sum + a.hp_current, 0)
    const totalHpB = sideB.reduce((sum, a) => sum + a.hp_current, 0)

    if (totalHpA > totalHpB) return { over: true, winner: 'a', condition: 'hp_advantage' }
    if (totalHpB > totalHpA) return { over: true, winner: 'b', condition: 'hp_advantage' }
    return { over: true, winner: null, condition: 'draw' }
  }

  return { over: false }
}

// ============================================================================
// Generate Synthesis
// ============================================================================

export async function generateSynthesis(
  sessionId: string,
): Promise<SynthesisResult> {
  const db = getServiceClient()

  const { data: session } = await db
    .from('debate_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) throw new Error('Session not found')
  if (session.status !== 'completed') throw new Error('Debate not yet completed')
  if (session.synthesis) return session.synthesis as SynthesisResult

  // Reconstruct model provider for synthesis
  const provider = getProviderFromSession(session)

  const [bookA, bookB] = await Promise.all([
    getBookInfo(session.book_a_id),
    getBookInfo(session.book_b_id),
  ])

  const { data: axioms } = await db
    .from('debate_axioms')
    .select('*')
    .eq('session_id', sessionId)

  const allAxioms = (axioms || []) as DebateAxiom[]
  const toInfo = (a: DebateAxiom): AxiomInfo => ({
    id: a.id,
    label: a.label,
    description: a.description,
    hpCurrent: a.hp_current,
    isDestroyed: a.is_destroyed,
  })

  const survivingA = allAxioms.filter((a) => a.side === 'a' && !a.is_destroyed).map(toInfo)
  const survivingB = allAxioms.filter((a) => a.side === 'b' && !a.is_destroyed).map(toInfo)
  const destroyedA = allAxioms.filter((a) => a.side === 'a' && a.is_destroyed).map(toInfo)
  const destroyedB = allAxioms.filter((a) => a.side === 'b' && a.is_destroyed).map(toInfo)

  const prompt = buildSynthesizerPrompt(
    session.crucible_question,
    bookA.title,
    bookA.author_name,
    bookB.title,
    bookB.author_name,
    survivingA,
    survivingB,
    destroyedA,
    destroyedB,
    session.winner as 'a' | 'b' | null,
  )

  const { text } = await generateText({
    model: provider.getModel('synthesizer'),
    prompt,
    temperature: 0.6,
  })

  const synthesis = parseJsonResponse<SynthesisResult>(text)

  // Store synthesis
  await db
    .from('debate_sessions')
    .update({ synthesis, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  // Dispatch event
  await dispatchEvent({
    eventType: 'debate.synthesis_generated',
    payload: { sessionId, frameworkName: synthesis.framework_name },
    sourceType: 'system',
  })

  if (session.initiated_by) {
    await db.from('activity_feed').insert({
      actor_id: session.initiated_by,
      event_type: 'debate_synthesis_generated',
      target_type: 'debate',
      target_id: sessionId,
      metadata: { framework_name: synthesis.framework_name },
      source_type: 'system',
    })
  }

  return synthesis
}

// ============================================================================
// Query Helpers (for API routes)
// ============================================================================

export async function getDebateSession(sessionId: string): Promise<DebateSession | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('debate_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  return data as DebateSession | null
}

export async function getDebateAxioms(sessionId: string): Promise<DebateAxiom[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('debate_axioms')
    .select('*')
    .eq('session_id', sessionId)
    .order('side')
    .order('axiom_index')
  return (data || []) as DebateAxiom[]
}

export async function getDebateRounds(sessionId: string): Promise<DebateRound[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('debate_rounds')
    .select('*')
    .eq('session_id', sessionId)
    .order('round_number')
  return (data || []) as DebateRound[]
}

export async function getDebateArguments(sessionId: string): Promise<DebateArgument[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('debate_arguments')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at')
  return (data || []) as DebateArgument[]
}

export async function listDebates(
  status?: string,
  limit = 20,
): Promise<Array<DebateSession & { book_a: BookInfo; book_b: BookInfo }>> {
  const db = getServiceClient()
  let query = db
    .from('debate_sessions')
    .select(`
      *,
      book_a:books!debate_sessions_book_a_id_fkey(id, title, author:authors!books_author_id_fkey(display_name)),
      book_b:books!debate_sessions_book_b_id_fkey(id, title, author:authors!books_author_id_fkey(display_name))
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data } = await query
  // Flatten author joins
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((d: any) => ({
    ...d,
    book_a: d.book_a ? {
      id: d.book_a.id,
      title: d.book_a.title,
      author_name: (Array.isArray(d.book_a.author) ? d.book_a.author[0]?.display_name : d.book_a.author?.display_name) || 'Unknown',
    } : null,
    book_b: d.book_b ? {
      id: d.book_b.id,
      title: d.book_b.title,
      author_name: (Array.isArray(d.book_b.author) ? d.book_b.author[0]?.display_name : d.book_b.author?.display_name) || 'Unknown',
    } : null,
  })) as Array<DebateSession & { book_a: BookInfo; book_b: BookInfo }>
}
