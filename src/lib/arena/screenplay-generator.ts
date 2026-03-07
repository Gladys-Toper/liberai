// ═══════════════════════════════════════════════════════════════════════════
// Cinematic Video Pipeline — Screenplay Generator
// ═══════════════════════════════════════════════════════════════════════════
//
// Converts a completed debate transcript (rounds, axioms, arguments, commentary)
// into an array of SceneChunks, each with a rich video prompt for LTX 2.3.
//
// Target video length: 2-3 minutes depending on round count.
// Structure per round: attack+defense merged (18s via extend) + commentary (10s) = 28s/round
// Plus establishing (10s via generateFirst) + intro (10s via extend) + verdict (10s) = 30s
// Chunk count: 2 + 2*rounds + 1 → 5 rounds = 13 chunks (vs 17 at 10s each)
// 5 rounds → 178s (~3 min), 7 rounds → 234s (~4 min)
//
// NOTE: ltx-2-3-pro text-to-video (generateFirst) caps at 10s.
// ltx-2-3-pro extend supports up to 20s, but we use 18s (432 frames)
// to leave ~3s (73 frames) for context within the 505-frame limit.
//
// IMPORTANT: Because we use LTX's extend endpoint, each chunk (after the first)
// describes what happens NEXT — a continuation from the previous scene's last frame.
// The prompts must never re-describe the full setting, only the new action/camera move.
//
// ── AI CASTING (matches model-provider.ts) ─────────────────────────────
//
// SCREENPLAY MODEL: Gemini 3.1 Pro (minimum quality floor: gemini-3.1-pro
// or grok-4.2+). One single LLM call generates ALL dialogue — debaters,
// commentator, and referee — in one coherent screenplay pass.
//
// The model is sourced via ArenaModelProvider role 'screenplay' — never
// hardcode model IDs here.
//
// LTX 2.3 generates video + lip-synced speech + ambient audio natively.
// Dialogue in quotation marks → synthesized speech with accent and emotion.
// NO separate TTS needed. LTX IS the voice engine.
// ═══════════════════════════════════════════════════════════════════════════

import { generateText } from 'ai'
import { DefaultArenaModelProvider } from './model-provider'
import type {
  DebateSession,
  DebateRound,
  DebateAxiom,
  DebateArgument,
} from '@/lib/agents/debate-engine'
import type { SceneChunk } from './timeline-sync'

// ─── Oxford Union Visual Style (used ONLY for establishing shot) ─

const ESTABLISHING_SCENE = `A grand Oxford Union debating chamber, dark oak paneling, leather benches, warm amber spotlights, packed audience. Two podiums center stage. A commentator desk stage-right. Cinematic 35mm film, shallow depth of field, dramatic lighting.`

// ─── Types ───────────────────────────────────────────────────────

export interface DebateTranscript {
  session: DebateSession
  rounds: DebateRound[]
  arguments: DebateArgument[]
  axiomsA: DebateAxiom[]
  axiomsB: DebateAxiom[]
  bookATitle: string
  bookAAuthor: string
  bookBTitle: string
  bookBAuthor: string
}

// ─── Screenplay Generation ───────────────────────────────────────

/**
 * Convert a completed debate into SceneChunks for video generation.
 *
 * Scene structure:
 *   1. Establishing shot — pure visual, dolly into the chamber
 *   2. Commentator intro — commentator addresses camera
 *   3-N. Per round: attack → defense → commentator reaction
 *   N+1. Verdict — referee announces winner
 *
 * The FIRST chunk establishes the setting (used with generateFirst).
 * All subsequent chunks describe only the NEXT action (used with extendVideo).
 * This creates one seamless, continuous video.
 */
export async function generateScreenplay(
  transcript: DebateTranscript,
): Promise<SceneChunk[]> {
  const { session, rounds, arguments: args, axiomsA, axiomsB } = transcript

  // Build screenplay dialogue via LLM
  const dialogue = await generateDialogue(transcript)

  const chunks: SceneChunk[] = []
  let chunkIndex = 0

  const maxHpA = axiomsA.length * 100
  const maxHpB = axiomsB.length * 100

  // ── Scene 1: Establishing shot (10s, generateFirst — ltx-2-3-pro caps at 10s) ──
  chunks.push({
    index: chunkIndex++,
    durationSeconds: 10,
    roundNumber: 0,
    sceneType: 'establishing',
    videoPrompt: buildEstablishingPrompt(),
    cameraMotion: 'dolly_in',
    hpA: totalHp(axiomsA),
    hpB: totalHp(axiomsB),
    hpPercentA: 100,
    hpPercentB: 100,
  })

  // ── Scene 2: Commentator intro (10s, extend) ──
  chunks.push({
    index: chunkIndex++,
    durationSeconds: 10,
    roundNumber: 0,
    sceneType: 'intro',
    videoPrompt: buildIntroContinuation(transcript, dialogue.intro),
    cameraMotion: 'pan_right',
    hpA: totalHp(axiomsA),
    hpB: totalHp(axiomsB),
    hpPercentA: 100,
    hpPercentB: 100,
  })

  // ── Round Scenes (extend from previous) ──
  const runningAxiomsA = axiomsA.map((a) => ({ ...a }))
  const runningAxiomsB = axiomsB.map((a) => ({ ...a }))

  for (const round of rounds) {
    if (round.status !== 'completed') continue

    const roundArgs = args.filter((a) => a.round_id === round.id)
    const attack = roundArgs.find((a) => a.move_type === 'attack')
    const defense = roundArgs.find((a) => a.move_type === 'defense')
    const roundDialogue = dialogue.rounds[round.round_number] || {
      attack: '',
      defense: '',
      commentary: '',
    }

    // Apply HP deltas
    for (const delta of round.hp_deltas) {
      const axiomA = runningAxiomsA.find((a) => a.id === delta.axiom_id)
      const axiomB = runningAxiomsB.find((a) => a.id === delta.axiom_id)
      if (axiomA) {
        axiomA.hp_current = Math.max(0, axiomA.hp_current + delta.delta)
        if (axiomA.hp_current <= 0) axiomA.is_destroyed = true
      }
      if (axiomB) {
        axiomB.hp_current = Math.max(0, axiomB.hp_current + delta.delta)
        if (axiomB.hp_current <= 0) axiomB.is_destroyed = true
      }
    }

    const hpA = totalHp(runningAxiomsA)
    const hpB = totalHp(runningAxiomsB)

    const primaryDelta = round.hp_deltas[0]
    const targetSide = round.attacker_side === 'a' ? 'b' : 'a'
    const damagedAxiom = primaryDelta
      ? [...runningAxiomsA, ...runningAxiomsB].find(
          (a) => a.id === primaryDelta.axiom_id,
        )
      : undefined

    // Attack + Defense merged scene (20s max)
    const attackPrompt = buildAttackContinuation(
      transcript,
      round,
      attack,
      roundDialogue.attack,
    )
    const defensePrompt = defense && roundDialogue.defense
      ? '\n\n' + buildDefenseContinuation(
          transcript,
          round,
          defense,
          roundDialogue.defense,
        )
      : ''

    chunks.push({
      index: chunkIndex++,
      durationSeconds: defense && roundDialogue.defense ? 18 : 10,
      roundNumber: round.round_number,
      sceneType: 'attack',
      videoPrompt: attackPrompt + defensePrompt,
      cameraMotion: round.round_number % 2 === 1 ? 'dolly_left' : 'dolly_right',
      hpA,
      hpB,
      hpPercentA: Math.round((hpA / maxHpA) * 100),
      hpPercentB: Math.round((hpB / maxHpB) * 100),
      targetSide,
      damagedAxiomId: primaryDelta?.axiom_id,
      damage: primaryDelta ? Math.abs(primaryDelta.delta) : undefined,
      isDestroyed: damagedAxiom?.is_destroyed,
      destroyedLabel: damagedAxiom?.is_destroyed
        ? damagedAxiom.label
        : undefined,
    })

    // Commentary reaction scene
    if (roundDialogue.commentary) {
      chunks.push({
        index: chunkIndex++,
        durationSeconds: 10,
        roundNumber: round.round_number,
        sceneType: 'commentary',
        videoPrompt: buildCommentaryContinuation(roundDialogue.commentary),
        cameraMotion: round.round_number % 2 === 0 ? 'jib_up' : 'jib_down',
        hpA,
        hpB,
        hpPercentA: Math.round((hpA / maxHpA) * 100),
        hpPercentB: Math.round((hpB / maxHpB) * 100),
        commentary: round.commentary || undefined,
      })
    }
  }

  // ── Verdict scene ──
  const winner =
    session.winner === 'a'
      ? 'a'
      : session.winner === 'b'
        ? 'b'
        : ('draw' as const)

  chunks.push({
    index: chunkIndex++,
    durationSeconds: 10,
    roundNumber: rounds.length,
    sceneType: 'verdict',
    videoPrompt: buildVerdictContinuation(transcript, dialogue.verdict, winner),
    cameraMotion: 'dolly_out',
    hpA: totalHp(runningAxiomsA),
    hpB: totalHp(runningAxiomsB),
    hpPercentA: Math.round(
      (totalHp(runningAxiomsA) / maxHpA) * 100,
    ),
    hpPercentB: Math.round(
      (totalHp(runningAxiomsB) / maxHpB) * 100,
    ),
    winner,
  })

  return chunks
}

// ─── LLM Dialogue Generation ────────────────────────────────────

interface ScreenplayDialogue {
  intro: string
  rounds: Record<
    number,
    { attack: string; defense: string; commentary: string }
  >
  verdict: string
}

/**
 * Generate ALL spoken dialogue for the cinematic video.
 *
 * Uses Gemini 3.1 Pro (via ArenaModelProvider role 'screenplay') to write
 * ALL dialogue in one coherent pass. Minimum quality floor: gemini-3.1-pro
 * or grok-4.2+.
 *
 * The single prompt instructs the model to write dialogue for THREE distinct
 * character voices:
 *   • Debaters — formal, incisive, philosophical
 *   • Commentator — snarky, off-color, witty (boxing commentator meets philosopher)
 *   • Referee — authoritative, measured, definitive
 *
 * LTX 2.3 handles all voice synthesis — dialogue in quotation marks becomes
 * lip-synced speech with natural cadence, accent, and emotion. No separate TTS.
 *
 * The debate engine already generated the analytical content (claims, rebuttals,
 * HP damage, referee evaluations). This LLM call compresses that into short
 * performable theatrical lines (under 15 words each) for 10-second video scenes.
 */
async function generateDialogue(
  transcript: DebateTranscript,
): Promise<ScreenplayDialogue> {
  const { session, rounds, arguments: args } = transcript
  const provider = DefaultArenaModelProvider.create()

  const completedRounds = rounds.filter((r) => r.status === 'completed')

  const roundSummaries = completedRounds
    .map((r) => {
      const roundArgs = args.filter((a) => a.round_id === r.id)
      const attack = roundArgs.find((a) => a.move_type === 'attack')
      const defense = roundArgs.find((a) => a.move_type === 'defense')
      const deltas = r.hp_deltas
        .map((d) => `${d.axiom_label}: ${d.delta} HP (${d.reason})`)
        .join('; ')

      return `ROUND ${r.round_number} (${r.attacker_side === 'a' ? transcript.bookATitle : transcript.bookBTitle} attacks):
  Attack claim: ${attack?.claim || 'N/A'}
  Defense rebuttal: ${defense?.rebuttal || defense?.claim || 'N/A'}
  HP damage: ${deltas || 'None'}
  Commentary: ${r.commentary || 'N/A'}`
    })
    .join('\n\n')

  const debateContext = `DEBATE:
  Book A: "${transcript.bookATitle}" by ${transcript.bookAAuthor}
  Book B: "${transcript.bookBTitle}" by ${transcript.bookBAuthor}
  Topic: "${session.crucible_question}"
  Winner: ${session.winner === 'a' ? transcript.bookATitle : session.winner === 'b' ? transcript.bookBTitle : 'Draw'}

TRANSCRIPT:
${roundSummaries}`

  const screenplayPrompt = `You are writing the complete screenplay dialogue for a cinematic Oxford Union debate broadcast. You must write dialogue for THREE distinct character voices. Put ALL speech in quotation marks — the video engine lip-syncs quoted text.

CHARACTER VOICES:
1. DEBATERS — Formal, incisive, philosophical. Academic language. No profanity.
2. COMMENTATOR — Off-color, witty, irreverent. Like a boxing commentator who read too much philosophy. Snarky, edgy, entertaining.
3. REFEREE — Authoritative, measured, definitive. Academic robes, gravitas.

${debateContext}

Write the COMPLETE screenplay dialogue:

1. COMMENTATOR INTRO: 1-2 sentence opening to camera. Hype the matchup. UNDER 20 WORDS.

2. For EACH round number:
   - attack: 1-2 sentences the attacking debater says at their podium. Formal, incisive. UNDER 15 WORDS.
   - defense: 1 sentence rebuttal from the defending debater. Sharp, measured. UNDER 12 WORDS.
   - commentary: 1 sentence commentator reaction. Excited, witty, slightly irreverent. UNDER 12 WORDS.

3. REFEREE VERDICT: The referee announces the winner with one sentence of closing authority. UNDER 20 WORDS TOTAL.

CRITICAL: Each scene is only 10 seconds of video. Every line must be extremely short and punchy.

Respond with valid JSON:
{
  "intro": "\"commentator opening line\"",
  "rounds": {
    "1": {
      "attack": "\"debater attack dialogue\"",
      "defense": "\"debater defense dialogue\"",
      "commentary": "\"commentator reaction\""
    },
    "2": { ... }
  },
  "verdict": "\"referee verdict announcement\""
}`

  // Single Gemini 3.1 Pro call generates all dialogue coherently
  console.log('[Screenplay] Generating dialogue via Gemini 3.1 Pro (screenplay role)')

  const result = await generateText({
    model: provider.getModel('screenplay'),
    prompt: screenplayPrompt,
    temperature: 0.65,
  })

  const data = parseJsonResponse(result.text) as {
    intro: string
    rounds: Record<string, { attack: string; defense: string; commentary: string }>
    verdict: string
  }

  // Map string keys to number keys
  const mergedRounds: Record<number, { attack: string; defense: string; commentary: string }> = {}

  for (const r of completedRounds) {
    const rn = String(r.round_number)
    mergedRounds[r.round_number] = {
      attack: data.rounds?.[rn]?.attack || '',
      defense: data.rounds?.[rn]?.defense || '',
      commentary: data.rounds?.[rn]?.commentary || '',
    }
  }

  return {
    intro: data.intro || '',
    rounds: mergedRounds,
    verdict: data.verdict || '',
  }
}

/** Strip markdown code fences and parse JSON */
function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
  return JSON.parse(cleaned)
}

// ─── Prompt Builders ─────────────────────────────────────────────
// Scene 1 (establishing): Full visual setup — used with generateFirst()
// Scene 2 (intro): Commentator speaks — used with extendVideo()
// Scene 3+: Continuation prompts — used with extendVideo()
//   These describe ONLY what changes next (new speaker, camera move, reaction)
//   They NEVER re-describe the full setting.

function buildEstablishingPrompt(): string {
  return `${ESTABLISHING_SCENE}

The camera glides through grand oak doors into a packed debating chamber. Warm amber spotlights illuminate two podiums center-stage. The audience buzzes with anticipation. A large digital scoreboard above the stage shows two names with glowing health bars at 100%.
Ambient: crowd murmur building, orchestral score swelling, dramatic brass fanfare.`
}

function buildIntroContinuation(
  t: DebateTranscript,
  introDialogue: string,
): string {
  return `The camera pans right to a commentator desk. A charismatic commentator in a waistcoat sits behind the desk, papers arranged neatly. They look up at the camera with a knowing smile and speak:
${introDialogue}
The commentator gestures toward both podiums. The audience applauds.
Ambient: crowd applause fading to attentive silence, subtle dramatic music.`
}

function buildAttackContinuation(
  t: DebateTranscript,
  round: DebateRound,
  attack: DebateArgument | undefined,
  dialogue: string,
): string {
  const side = round.attacker_side === 'a' ? 'left' : 'right'
  const hasBigHit = round.hp_deltas.some((d) => Math.abs(d.delta) > 15)

  return `Continuing in the same debating chamber. The camera pans to the ${side} podium. A speaker in a tailored suit rises and addresses the chamber:
${dialogue}
${hasBigHit ? 'The audience reacts with audible gasps. Several members lean forward in their seats.' : 'The audience listens intently, some taking notes.'}
Ambient: ${hasBigHit ? 'dramatic tension, crowd murmur rising' : 'quiet attention, pen scratching'}.`
}

function buildDefenseContinuation(
  t: DebateTranscript,
  round: DebateRound,
  defense: DebateArgument,
  dialogue: string,
): string {
  const side = round.attacker_side === 'a' ? 'right' : 'left'

  return `The camera shifts focus to the ${side} podium. The opposing speaker stands calmly and delivers a measured response:
${dialogue}
The audience nods appreciatively. Both speakers are now visible in a wide two-shot.
Ambient: approving murmur, gentle applause.`
}

function buildCommentaryContinuation(commentary: string): string {
  return `The camera cuts to the commentator desk stage-right. The commentator leans forward excitedly, adjusts their microphone, and addresses the camera:
${commentary}
Quick audience reaction shots — some audience members nodding vigorously, others shaking their heads. The chamber buzzes with energy.
Ambient: excited crowd chatter, dramatic orchestral sting.`
}

function buildVerdictContinuation(
  t: DebateTranscript,
  verdictDialogue: string,
  winner: 'a' | 'b' | 'draw',
): string {
  return `The chamber falls quiet. A figure in academic robes steps to center stage between the podiums. They raise one hand and announce the verdict:
${verdictDialogue}
${winner !== 'draw' ? 'One speaker raises their hand in acknowledgment. The audience stands, applauding.' : 'Both speakers bow to each other. Standing ovation.'}
The camera slowly pulls back through the chamber doors. Ambient: thunderous applause, orchestral finale.`
}

// ─── Helpers ─────────────────────────────────────────────────────

function totalHp(axioms: DebateAxiom[]): number {
  return axioms.reduce((sum, a) => sum + a.hp_current, 0)
}
