// Cinematic Video Pipeline — Timeline Sync Engine
//
// Drives overlay state (HP bars, round indicator, commentary, betting)
// from a pre-built timeline of events synchronized to <video> timestamps.
//
// No polling. No websocket. The <video> element's timeupdate event
// (~4Hz) calls tick() which walks events in order.

// ─── Timeline Event Types ────────────────────────────────────────

export type TimelineEvent =
  | { t: number; type: 'round_start';       round: number }
  | { t: number; type: 'attack';            side: 'a' | 'b'; axiomId: string; damage: number }
  | { t: number; type: 'hp_update';         hpA: number; hpB: number; hpPercentA: number; hpPercentB: number }
  | { t: number; type: 'axiom_destroyed';   side: 'a' | 'b'; axiomId: string; label: string }
  | { t: number; type: 'commentary';        text: string }
  | { t: number; type: 'defense';           side: 'a' | 'b' }
  | { t: number; type: 'pool_lock' }
  | { t: number; type: 'verdict';           winner: 'a' | 'b' | 'draw' }
  | { t: number; type: 'pool_settle';       winningSide: 'a' | 'b' | null }

// ─── Syncer ──────────────────────────────────────────────────────

export interface TimelineSyncer {
  /** Call on every <video> timeupdate (~4Hz). Fires events up to currentTime. */
  tick(currentTime: number): void
  /** Reset cursor and replay all events up to `time` (for seek support). */
  seek(time: number): void
  /** Reset to beginning. */
  reset(): void
}

/**
 * Create a cursor-based timeline syncer.
 *
 * `onEvent` is called for every event whose timestamp `t` is ≤ the current
 * video time. Events fire once and in order. On seek, all events from the
 * start up to the seek point are replayed (with `onReset` called first to
 * clear overlay state).
 */
export function createTimelineSyncer(
  timeline: TimelineEvent[],
  onEvent: (event: TimelineEvent) => void,
  onReset: () => void,
): TimelineSyncer {
  const sorted = [...timeline].sort((a, b) => a.t - b.t)
  let cursor = 0

  return {
    tick(currentTime: number) {
      while (cursor < sorted.length && sorted[cursor].t <= currentTime) {
        onEvent(sorted[cursor])
        cursor++
      }
    },

    seek(time: number) {
      // Reset all overlay state to initial values
      onReset()
      // Replay events from start up to seek point
      for (const e of sorted) {
        if (e.t > time) break
        onEvent(e)
      }
      // Advance cursor past replayed events
      cursor = sorted.findIndex((e) => e.t > time)
      if (cursor === -1) cursor = sorted.length
    },

    reset() {
      onReset()
      cursor = 0
    },
  }
}

// ─── Scene Chunk → Timeline Builder ──────────────────────────────

export interface SceneChunk {
  index: number
  durationSeconds: number
  roundNumber: number
  sceneType: 'establishing' | 'intro' | 'attack' | 'defense' | 'commentary' | 'verdict'
  videoPrompt: string
  cameraMotion?: string

  // HP snapshot after this chunk's action
  hpA: number
  hpB: number
  hpPercentA: number
  hpPercentB: number

  // Damage metadata (attack scenes)
  targetSide?: 'a' | 'b'
  damagedAxiomId?: string
  damage?: number
  isDestroyed?: boolean
  destroyedLabel?: string

  // Overlay content
  commentary?: string
  winner?: 'a' | 'b' | 'draw'
}

/**
 * Convert an array of SceneChunks into timestamped timeline events.
 *
 * Each chunk is 10 seconds. Timestamps are cumulative from chunk durations.
 * Events within a chunk are placed at fixed offsets (all within 0-9s):
 *   +0s   round_start (attack/intro/establishing scenes)
 *   +2s   defense (defense scenes), commentary text (commentary scenes)
 *   +5s   attack damage lands, verdict announcement
 *   +6s   axiom_destroyed (if applicable)
 *   +7s   hp_update snapshot, pool_settle
 */
export function buildTimeline(chunks: SceneChunk[]): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // Calculate cumulative start times (supports variable-duration chunks)
  const startTimes: number[] = []
  let cumulative = 0
  for (const chunk of chunks) {
    startTimes.push(cumulative)
    cumulative += chunk.durationSeconds
  }

  // Track whether we've seen the first attack (for pool_lock)
  let firstAttackSeen = false

  for (const chunk of chunks) {
    const base = startTimes[chunk.index]

    // Round transition
    if (chunk.sceneType === 'attack' || chunk.sceneType === 'intro' || chunk.sceneType === 'establishing') {
      events.push({ t: base, type: 'round_start', round: chunk.roundNumber })
    }

    // Pool locks at first attack scene
    if (chunk.sceneType === 'attack' && !firstAttackSeen) {
      firstAttackSeen = true
      events.push({ t: base, type: 'pool_lock' })
    }

    // Defense scene
    if (chunk.sceneType === 'defense' && chunk.targetSide) {
      events.push({ t: base + 2, type: 'defense', side: chunk.targetSide })
    }

    // Attack damage mid-scene
    if (chunk.sceneType === 'attack' && chunk.damagedAxiomId && chunk.targetSide) {
      events.push({
        t: base + 5,
        type: 'attack',
        side: chunk.targetSide,
        axiomId: chunk.damagedAxiomId,
        damage: chunk.damage ?? 0,
      })
    }

    // Axiom destroyed
    if (chunk.isDestroyed && chunk.damagedAxiomId && chunk.targetSide) {
      events.push({
        t: base + 6,
        type: 'axiom_destroyed',
        side: chunk.targetSide,
        axiomId: chunk.damagedAxiomId,
        label: chunk.destroyedLabel ?? '',
      })
    }

    // HP snapshot (every scene gets one, near end)
    events.push({
      t: base + 7,
      type: 'hp_update',
      hpA: chunk.hpA,
      hpB: chunk.hpB,
      hpPercentA: chunk.hpPercentA,
      hpPercentB: chunk.hpPercentB,
    })

    // Commentary (on dedicated commentary scenes)
    if (chunk.commentary) {
      events.push({ t: base + 2, type: 'commentary', text: chunk.commentary })
    }

    // Verdict scene
    if (chunk.sceneType === 'verdict' && chunk.winner) {
      events.push({ t: base + 5, type: 'verdict', winner: chunk.winner })
      events.push({
        t: base + 7,
        type: 'pool_settle',
        winningSide: chunk.winner === 'draw' ? null : chunk.winner,
      })
    }
  }

  return events.sort((a, b) => a.t - b.t)
}
