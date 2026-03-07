// Cinematic Video Pipeline — Screenplay Generator
//
// Converts a completed debate transcript (rounds, axioms, arguments, commentary)
// into an array of SceneChunks, each with a rich video prompt for LTX 2.3.
//
// LTX generates video + lip-synced speech natively. Dialogue in quotation marks
// → synthesized speech with accent and emotion.

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import type {
  DebateSession,
  DebateRound,
  DebateAxiom,
  DebateArgument,
} from '@/lib/agents/debate-engine'
import type { SceneChunk } from './timeline-sync'

// ─── Oxford Union Visual Style ───────────────────────────────────

const OXFORD_UNION_STYLE = `An Oxford Union-style debating chamber with dark wood paneling, leather benches, warm amber lighting, and a packed audience. Two podiums face each other at center stage. A commentator desk sits to the right. The atmosphere is electric — think BBC Parliament meets Fight Night. Cinematic 35mm film look, shallow depth of field, dramatic lighting.`

const CHARACTER_DESCRIPTIONS = {
  debaterA: `A commanding figure at the left podium, dressed in a dark tailored suit. Passionate, gestures emphatically. British-accented voice with intellectual gravitas.`,
  debaterB: `A sharp figure at the right podium, dressed in a contrasting charcoal suit. Measured, precise. Speaks with a clear, authoritative American accent.`,
  commentator: `A charismatic commentator at a desk stage-right, dressed in a waistcoat. Speaks with the energy of a boxing commentator who studied philosophy at Cambridge. Excited, witty.`,
  referee: `A stern-faced referee in academic robes, standing center-stage between the podiums. Speaks with impartial authority.`,
}

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
 * We use an LLM to write the screenplay dialogue, but the chunk structure
 * (timing, HP, damage metadata) is deterministic from debate data.
 */
export async function generateScreenplay(
  transcript: DebateTranscript,
): Promise<SceneChunk[]> {
  const { session, rounds, arguments: args, axiomsA, axiomsB } = transcript

  // Build screenplay dialogue via LLM
  const dialogue = await generateDialogue(transcript)

  const chunks: SceneChunk[] = []
  let chunkIndex = 0

  // ── Intro Scene ──
  chunks.push({
    index: chunkIndex++,
    durationSeconds: 20,
    roundNumber: 0,
    sceneType: 'intro',
    videoPrompt: buildIntroPrompt(transcript, dialogue.intro),
    cameraMotion: 'slow_dolly_in',
    hpA: totalHp(axiomsA),
    hpB: totalHp(axiomsB),
    hpPercentA: 100,
    hpPercentB: 100,
  })

  // ── Round Scenes (attack + defense per round) ──
  // Track running HP for timeline sync
  let runningAxiomsA = axiomsA.map((a) => ({ ...a }))
  let runningAxiomsB = axiomsB.map((a) => ({ ...a }))

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

    // Apply HP deltas to running state
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
    const maxHpA = axiomsA.length * 100
    const maxHpB = axiomsB.length * 100

    // Primary damage target
    const primaryDelta = round.hp_deltas[0]
    const targetSide = round.attacker_side === 'a' ? 'b' : 'a'
    const damagedAxiom = primaryDelta
      ? [...runningAxiomsA, ...runningAxiomsB].find(
          (a) => a.id === primaryDelta.axiom_id,
        )
      : undefined

    // Attack scene
    chunks.push({
      index: chunkIndex++,
      durationSeconds: 20,
      roundNumber: round.round_number,
      sceneType: 'attack',
      videoPrompt: buildAttackPrompt(
        transcript,
        round,
        attack,
        roundDialogue.attack,
      ),
      cameraMotion: 'tracking_shot',
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
      commentary: round.commentary || undefined,
    })

    // Defense scene (if there's a defense argument and we have room)
    if (defense && roundDialogue.defense) {
      chunks.push({
        index: chunkIndex++,
        durationSeconds: 20,
        roundNumber: round.round_number,
        sceneType: 'defense',
        videoPrompt: buildDefensePrompt(
          transcript,
          round,
          defense,
          roundDialogue.defense,
        ),
        cameraMotion: 'slow_pan_right',
        hpA,
        hpB,
        hpPercentA: Math.round((hpA / maxHpA) * 100),
        hpPercentB: Math.round((hpB / maxHpB) * 100),
        targetSide: round.attacker_side, // defender is the attacker's target side
      })
    }
  }

  // ── Verdict / Outro Scene ──
  const winner =
    session.winner === 'a'
      ? 'a'
      : session.winner === 'b'
        ? 'b'
        : ('draw' as const)

  chunks.push({
    index: chunkIndex++,
    durationSeconds: 20,
    roundNumber: rounds.length,
    sceneType: 'verdict',
    videoPrompt: buildVerdictPrompt(transcript, dialogue.verdict, winner),
    cameraMotion: 'slow_dolly_out',
    hpA: totalHp(runningAxiomsA),
    hpB: totalHp(runningAxiomsB),
    hpPercentA: Math.round(
      (totalHp(runningAxiomsA) / (axiomsA.length * 100)) * 100,
    ),
    hpPercentB: Math.round(
      (totalHp(runningAxiomsB) / (axiomsB.length * 100)) * 100,
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

async function generateDialogue(
  transcript: DebateTranscript,
): Promise<ScreenplayDialogue> {
  const { session, rounds, arguments: args } = transcript

  // Build a condensed transcript for the LLM
  const roundSummaries = rounds
    .filter((r) => r.status === 'completed')
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

  const prompt = `You are a theatrical screenwriter. Convert this philosophical debate transcript into dramatic spoken dialogue for a cinematic Oxford Union stage play.

DEBATE:
  Book A: "${transcript.bookATitle}" by ${transcript.bookAAuthor}
  Book B: "${transcript.bookBTitle}" by ${transcript.bookBAuthor}
  Crucible Question: "${session.crucible_question}"
  Winner: ${session.winner === 'a' ? transcript.bookATitle : session.winner === 'b' ? transcript.bookBTitle : 'Draw'}

TRANSCRIPT:
${roundSummaries}

INSTRUCTIONS:
Write dialogue for each scene. Each line of dialogue must be in quotation marks — the video model will lip-sync these.

For each round, write:
- attack: 2-3 sentences the attacker speaks at their podium (passionate, specific to their argument)
- defense: 1-2 sentences the defender speaks in rebuttal
- commentary: 1-2 sentences the commentator says from their desk (dramatic, witty)

Also write:
- intro: Commentator's opening 3-4 sentences introducing the debate
- verdict: Referee's announcement + commentator's closing 2-3 sentences

Keep dialogue concise (each speech under 30 words) — these are 20-second video scenes.
Use vivid philosophical language but keep it accessible.
Mark emotion/tone in parentheses before dialogue: (thundering), (quietly devastating), (with growing excitement).

Respond with valid JSON:
{
  "intro": "string — commentator's opening",
  "rounds": {
    "1": { "attack": "string", "defense": "string", "commentary": "string" },
    "2": { ... }
  },
  "verdict": "string — referee + commentator finale"
}`

  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    prompt,
    temperature: 0.7,
  })

  // Parse JSON response (strip markdown code fences if present)
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
  return JSON.parse(cleaned) as ScreenplayDialogue
}

// ─── Prompt Builders ─────────────────────────────────────────────

function buildIntroPrompt(
  t: DebateTranscript,
  introDialogue: string,
): string {
  return `${OXFORD_UNION_STYLE}

Scene: The camera slowly dollies into the debating chamber. The audience murmurs with anticipation. Two podiums are lit by amber spotlights. A commentator sits at a desk stage-right.

${CHARACTER_DESCRIPTIONS.commentator}

The commentator turns to camera and speaks:
${introDialogue}

On-screen text appears: "${t.bookATitle}" vs "${t.bookBTitle}"
The crucible question: "${t.session.crucible_question}"

Ambient sound: murmuring crowd, wooden benches creaking, dramatic orchestral score building.`
}

function buildAttackPrompt(
  t: DebateTranscript,
  round: DebateRound,
  attack: DebateArgument | undefined,
  dialogue: string,
): string {
  const attackerDesc =
    round.attacker_side === 'a'
      ? CHARACTER_DESCRIPTIONS.debaterA
      : CHARACTER_DESCRIPTIONS.debaterB
  const bookTitle =
    round.attacker_side === 'a' ? t.bookATitle : t.bookBTitle

  const hasBigDamage = round.hp_deltas.some((d) => Math.abs(d.delta) > 15)
  const axiomDestroyed = round.hp_deltas.some(
    (d) =>
      [...t.axiomsA, ...t.axiomsB].find((a) => a.id === d.axiom_id)
        ?.is_destroyed,
  )

  return `${OXFORD_UNION_STYLE}

Scene: Round ${round.round_number}. The champion of "${bookTitle}" rises from their bench and strides to the podium. Close-up on their face — determined, intense.

${attackerDesc}

The attacker grips the podium and speaks with conviction:
${dialogue}

${hasBigDamage ? 'The audience gasps. A devastating blow.' : 'The audience leans forward, absorbing every word.'}
${axiomDestroyed ? 'DRAMATIC MOMENT: An axiom has been destroyed! The crowd erupts. Camera pulls back to show the full chamber in shock.' : ''}

Camera: Tracking shot from the attacker's profile to a frontal close-up as they deliver their key point.
Ambient sound: ${axiomDestroyed ? 'Dramatic orchestral hit, crowd eruption' : 'tense silence, occasional murmur, pen scratching'}.`
}

function buildDefensePrompt(
  t: DebateTranscript,
  round: DebateRound,
  defense: DebateArgument,
  dialogue: string,
): string {
  const defenderSide = round.attacker_side === 'a' ? 'b' : 'a'
  const defenderDesc =
    defenderSide === 'a'
      ? CHARACTER_DESCRIPTIONS.debaterA
      : CHARACTER_DESCRIPTIONS.debaterB
  const bookTitle = defenderSide === 'a' ? t.bookATitle : t.bookBTitle

  return `${OXFORD_UNION_STYLE}

Scene: The defender for "${bookTitle}" stands, composed after absorbing the attack. They adjust their notes and approach the podium.

${defenderDesc}

The defender speaks with measured precision:
${dialogue}

The audience nods. A strong rebuttal. Camera slow-pans to show both debaters in frame — the tension between them palpable.

Camera: Slow pan from defender to attacker's reaction, then wide shot of the chamber.
Ambient sound: approving murmur, leather creaking, gentle applause.`
}

function buildVerdictPrompt(
  t: DebateTranscript,
  verdictDialogue: string,
  winner: 'a' | 'b' | 'draw',
): string {
  const winnerBook =
    winner === 'a'
      ? t.bookATitle
      : winner === 'b'
        ? t.bookBTitle
        : 'a draw'

  return `${OXFORD_UNION_STYLE}

Scene: Final verdict. The chamber falls silent. The referee in academic robes steps to center stage. Both debaters stand at their podiums, awaiting judgment.

${CHARACTER_DESCRIPTIONS.referee}

${verdictDialogue}

${winner !== 'draw' ? `The champion of "${winnerBook}" raises a fist in triumph. The crowd stands and applauds.` : 'Both debaters bow to each other. The crowd gives a standing ovation.'}

The commentator turns to camera for final words.
Camera: Wide establishing shot of the full chamber, then slow dolly out through the doors as applause echoes.
Ambient sound: thunderous applause, dramatic orchestral finale, chamber doors closing.`
}

// ─── Helpers ─────────────────────────────────────────────────────

function totalHp(axioms: DebateAxiom[]): number {
  return axioms.reduce((sum, a) => sum + a.hp_current, 0)
}
