// Sprint 7: Ontological Pugilism — System prompt builders for each debate role

export interface AxiomInfo {
  id: string
  label: string
  description: string | null
  hpCurrent: number
  isDestroyed: boolean
}

export interface ChunkContext {
  content: string
  chapterTitle?: string
  chunkId: string
}

export function buildAxiomExtractionPrompt(
  bookTitle: string,
  authorName: string,
  crucibleQuestion: string,
  chunks: ChunkContext[],
): string {
  const contextBlock = chunks
    .map((c, i) => `[Source ${i + 1} - ${c.chapterTitle || 'Unknown'}]\n${c.content}`)
    .join('\n\n---\n\n')

  return `You are a philosophical analyst extracting the foundational axioms of "${bookTitle}" by ${authorName}.

CRUCIBLE QUESTION: "${crucibleQuestion}"

Given the passages below, identify 3-5 foundational axioms — core premises the author relies on to build their argument. These axioms should be relevant to the crucible question.

Each axiom should be:
- A declarative statement the author assumes or argues as foundational truth
- Directly supported by the provided text passages
- Relevant to the crucible question

PASSAGES:
${contextBlock}

Respond with valid JSON matching this exact schema:
{
  "axioms": [
    {
      "label": "Short axiom statement (max 15 words)",
      "description": "2-3 sentence explanation of how the author establishes this axiom",
      "source_chunk_ids": ["chunk_id_1", "chunk_id_2"]
    }
  ]
}

Return between 3 and 5 axioms. Each must be grounded in the provided text.`
}

export function buildCombatantPrompt(
  role: 'attacker' | 'defender',
  bookTitle: string,
  authorName: string,
  crucibleQuestion: string,
  chunks: ChunkContext[],
  ownAxioms: AxiomInfo[],
  opponentAxioms: AxiomInfo[],
  targetAxiom: AxiomInfo | null,
  roundHistory: string,
): string {
  const contextBlock = chunks
    .map((c, i) => `[Source ${i + 1} - ${c.chapterTitle || 'Unknown'}]\n${c.content}`)
    .join('\n\n---\n\n')

  const ownAxiomList = ownAxioms
    .map((a) => `  - [${a.hpCurrent}HP${a.isDestroyed ? ' DESTROYED' : ''}] ${a.label}`)
    .join('\n')

  const oppAxiomList = opponentAxioms
    .map((a) => `  - [${a.hpCurrent}HP${a.isDestroyed ? ' DESTROYED' : ''}] ${a.label}`)
    .join('\n')

  if (role === 'attacker') {
    return `You are the philosophical champion of "${bookTitle}" by ${authorName}.

CRUCIBLE QUESTION: "${crucibleQuestion}"

YOUR AXIOMS:
${ownAxiomList}

OPPONENT'S AXIOMS (target for attack):
${oppAxiomList}

TARGET AXIOM: "${targetAxiom?.label}"

${roundHistory ? `PREVIOUS ROUNDS:\n${roundHistory}\n` : ''}
YOUR AVAILABLE EVIDENCE (you may ONLY cite from these passages):
${contextBlock}

INSTRUCTIONS:
You must construct a Toulmin-structured attack against the target axiom using ONLY evidence from YOUR book's passages above. Any claim not grounded in your passages is invalid.

Respond with valid JSON:
{
  "target_axiom_id": "${targetAxiom?.id}",
  "claim": "Your main attack claim against the target axiom",
  "grounds": "Specific evidence from your book passages supporting your claim",
  "warrant": "The logical principle connecting your grounds to your claim",
  "backing": "Additional support for why the warrant holds",
  "qualifier": "Any conditions or limits on your claim (e.g., 'in most cases')",
  "rebuttal": "Anticipated counter-argument and your preemptive response",
  "source_chunk_ids": ["ids of chunks you cited"],
  "source_quotes": ["exact short quotes from the passages you relied on"]
}

Be rigorous. Logical fallacies will be penalized. Source deviation (citing outside your passages) is severely penalized.`
  }

  // Defender
  return `You are the philosophical champion of "${bookTitle}" by ${authorName}.

CRUCIBLE QUESTION: "${crucibleQuestion}"

YOUR AXIOMS:
${ownAxiomList}

The opponent has attacked your axiom: "${targetAxiom?.label}"

${roundHistory ? `PREVIOUS ROUNDS:\n${roundHistory}\n` : ''}
YOUR AVAILABLE EVIDENCE (you may ONLY cite from these passages):
${contextBlock}

INSTRUCTIONS:
You must construct a Toulmin-structured defense of your axiom using ONLY evidence from YOUR book's passages above. Any claim not grounded in your passages is invalid.

You may:
1. DEFEND — rebut the attack with counter-evidence from your book
2. CONCEDE — if the attack is genuinely irrefutable, acknowledge it honestly

Respond with valid JSON:
{
  "move_type": "defense" or "concession",
  "target_axiom_id": "${targetAxiom?.id}",
  "claim": "Your defense claim or concession statement",
  "grounds": "Specific evidence from your book passages",
  "warrant": "The logical principle connecting your grounds to your claim",
  "backing": "Additional support for the warrant",
  "qualifier": "Conditions or limits on your defense",
  "rebuttal": "Why the attacker's argument fails (or what you concede if conceding)",
  "source_chunk_ids": ["ids of chunks you cited"],
  "source_quotes": ["exact short quotes from the passages you relied on"]
}

Be rigorous. Logical fallacies will be penalized. Conceding a weak position is more respectable than defending it with fallacies.`
}

export function buildRefereePrompt(
  crucibleQuestion: string,
  attackerBook: string,
  defenderBook: string,
  attackPayload: string,
  defensePayload: string,
  targetAxiomLabel: string,
): string {
  return `You are an impartial philosophical referee evaluating a structured debate exchange.

CRUCIBLE QUESTION: "${crucibleQuestion}"
ATTACKER (${attackerBook}) is attacking the axiom: "${targetAxiomLabel}"
DEFENDER (${defenderBook}) is defending it.

ATTACK ARGUMENT:
${attackPayload}

DEFENSE ARGUMENT:
${defensePayload}

Evaluate both arguments on these criteria (0-100 each):

1. LOGICAL SOUNDNESS — Is the reasoning valid? Are there fallacies?
2. EVIDENCE RELEVANCE — Does the evidence actually support the claim?
3. WARRANT STRENGTH — Does the warrant logically connect grounds to claim?

Also check for PENALTIES:
- logical_fallacy: Did either side commit a named logical fallacy? (ad hominem, straw man, false dichotomy, etc.)
- source_deviation: Did either side appear to make claims unsupported by their cited evidence?
- conceded_premise: Did the defender concede?
- weak_warrant: Is the warrant especially tenuous?

Respond with valid JSON:
{
  "attack_scores": {
    "logical_soundness": 0-100,
    "evidence_relevance": 0-100,
    "warrant_strength": 0-100
  },
  "defense_scores": {
    "logical_soundness": 0-100,
    "evidence_relevance": 0-100,
    "warrant_strength": 0-100,
    "rebuttal_strength": 0-100
  },
  "penalties": {
    "attacker": [{"type": "logical_fallacy"|"source_deviation"|"weak_warrant", "description": "..."}],
    "defender": [{"type": "logical_fallacy"|"source_deviation"|"conceded_premise"|"weak_warrant", "description": "..."}]
  },
  "verdict_summary": "2-3 sentence summary of who had the stronger argument and why"
}`
}

export function buildCommentatorPrompt(
  crucibleQuestion: string,
  bookATitle: string,
  bookBTitle: string,
  roundNumber: number,
  attackerSide: 'a' | 'b',
  attackClaim: string,
  defenseClaim: string,
  verdictSummary: string,
  hpDeltas: Array<{ axiomLabel: string; delta: number; reason: string }>,
  sponsorContext?: string,
): string {
  const attackerBook = attackerSide === 'a' ? bookATitle : bookBTitle
  const defenderBook = attackerSide === 'a' ? bookBTitle : bookATitle

  const deltaLines = hpDeltas
    .map((d) => `  ${d.axiomLabel}: ${d.delta > 0 ? '+' : ''}${d.delta} HP (${d.reason})`)
    .join('\n')

  return `You are an electrifying debate commentator — part sports announcer, part philosophy professor. Your job is to translate a dry logical exchange into riveting narrative.

ROUND ${roundNumber} of the Ontological Pugilism Arena!

CRUCIBLE: "${crucibleQuestion}"

${attackerBook} ATTACKS with: "${attackClaim}"
${defenderBook} DEFENDS with: "${defenseClaim}"

REFEREE SAYS: ${verdictSummary}

HP CHANGES:
${deltaLines}

Write a 2-4 sentence commentary in the style of a dramatic sports commentator who deeply understands philosophy. Use vivid metaphors. Reference the actual content of the arguments. Build tension. If an axiom was destroyed, make it EPIC.

Keep it under 100 words. No JSON — just pure narrative text.${
    sponsorContext
      ? `\n\nSPONSOR INTEGRATION: ${sponsorContext}\nNaturally weave in a brief, subtle mention of the sponsor into your commentary — make it feel organic, like a real sports broadcast. Do NOT make it the focus.`
      : ''
  }`
}

export function buildSynthesizerPrompt(
  crucibleQuestion: string,
  bookATitle: string,
  bookAAuthor: string,
  bookBTitle: string,
  bookBAuthor: string,
  survivingAxiomsA: AxiomInfo[],
  survivingAxiomsB: AxiomInfo[],
  destroyedAxiomsA: AxiomInfo[],
  destroyedAxiomsB: AxiomInfo[],
  winner: 'a' | 'b' | null,
): string {
  const survA = survivingAxiomsA.map((a) => `  - [${a.hpCurrent}HP] ${a.label}`).join('\n')
  const survB = survivingAxiomsB.map((a) => `  - [${a.hpCurrent}HP] ${a.label}`).join('\n')
  const destA = destroyedAxiomsA.map((a) => `  - ${a.label}`).join('\n')
  const destB = destroyedAxiomsB.map((a) => `  - ${a.label}`).join('\n')

  const winnerBook = winner === 'a' ? bookATitle : winner === 'b' ? bookBTitle : 'Neither (draw)'

  return `You are a Hegelian synthesizer. A philosophical debate has concluded between two books on the crucible question below. Your task: produce a novel synthesis that transcends both positions.

CRUCIBLE QUESTION: "${crucibleQuestion}"

WINNER: ${winnerBook}

THESIS ("${bookATitle}" by ${bookAAuthor}):
Surviving axioms:
${survA || '  (none)'}
Destroyed axioms:
${destA || '  (none)'}

ANTITHESIS ("${bookBTitle}" by ${bookBAuthor}):
Surviving axioms:
${survB || '  (none)'}
Destroyed axioms:
${destB || '  (none)'}

INSTRUCTIONS:
Produce a Hegelian synthesis — a novel framework that:
1. Preserves the strongest surviving insights from BOTH sides
2. Acknowledges what was debunked (destroyed axioms)
3. Transcends the original opposition with a new perspective

Respond with valid JSON:
{
  "framework_name": "A memorable 3-5 word name for the synthesis",
  "thesis_summary": "What ${bookATitle} got right (2-3 sentences)",
  "antithesis_summary": "What ${bookBTitle} got right (2-3 sentences)",
  "synthesis": "The novel framework that transcends both (3-5 sentences)",
  "principles": ["3-5 actionable principles derived from the synthesis"],
  "crucible_resolution": "How this framework addresses the original crucible question (2-3 sentences)"
}`
}
