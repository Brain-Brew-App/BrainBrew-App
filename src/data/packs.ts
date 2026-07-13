/**
 * The local pack pool — 50 packs, 250 puzzles, assembled by a deterministic
 * scheduler rather than typed by hand.
 *
 * Content lives in `src/content/library.ts`. This file only *schedules* it, and
 * the schedule is a pure function of the pack index: no randomness, no clock, no
 * mutation. Pack `n` contains the same five puzzles on every device, forever —
 * which is what lets a date map to a pack (Core Spec §2).
 *
 * Two constraints are satisfied at once:
 *
 *  • **Rotation (§5).** Within a category the engine cycles, so the same engine
 *    never appears on consecutive days, and every engine appears inside any
 *    14-pack window.
 *
 *  • **Difficulty composition (§7).** Each pack targets one easy, two medium and
 *    one hard non-speed puzzle, plus the speed-based Attention Speed slot. The
 *    *role* of easy/hard rotates between categories, so Logic is not forever the
 *    hard one.
 *
 * ⚠ Four of five categories currently hold only **two** engines, below the
 * catalog's own floor of three. Two engines still satisfy the no-consecutive-
 * repeat rule by alternating, but they force `weekly_cap: 4` — the intended cap
 * is 2. See docs/CONTENT_PIPELINE.md §8. `npm run audit` reports this.
 */

import type { DailyPack, Difficulty, EngineId, Puzzle } from '../types/puzzle';
import { LIBRARY } from '../content/library';

export const PACK_SIZE = 50;

/**
 * The engine each category cycles through. Index 0 is Observation.
 *
 * Every category now holds **three** engines — the catalog's floor (§8). With
 * three, a 7-day week is schedulable at `weekly_cap: 3` without repeating an
 * engine on consecutive days, which is why Phase 3 exists.
 */
const ROTATION: EngineId[][] = [
  ['OBS_001', 'OBS_003', 'OBS_004'],
  ['PAT_001', 'PAT_002', 'PAT_003'],
  ['LOG_002', 'LOG_001', 'LOG_003'],
  ['LNG_001', 'LNG_002', 'LNG_003'],
  ['ATT_003', 'ATT_001', 'ATT_002'],
];

/**
 * Each category advances its own 3-engine cycle. The full engine tuple repeats
 * every 3 packs (all five cycles share period 3), which is invisible to a
 * once-daily player: what they experience is a *different engine per category
 * each day*, never the same engine twice running. Phase-shifting the categories
 * cannot change this — five period-3 cycles have a combined period of 3 however
 * they are offset — so we keep the offsets at zero and let per-category variety,
 * content, and difficulty carry the day-to-day difference.
 */

/**
 * The difficulty each non-speed slot aims for. The row rotates every pack, so
 * the easy puzzle is sometimes Observation, sometimes Pattern, and so on — no
 * category is permanently the gentle one.
 */
const NON_SPEED_TARGETS: Difficulty[] = [2, 3, 4, 3];
/** Attention Speed is the speed-based slot; its difficulty walks independently. */
const SPEED_TARGETS: Difficulty[] = [2, 3, 4, 5, 3];

/** Closest match to `target`, ties broken by pool order. Never random. */
function takeClosest(pool: Puzzle[], target: Difficulty): Puzzle {
  let best = 0;
  for (let i = 1; i < pool.length; i++) {
    if (Math.abs(pool[i]!.difficulty - target) < Math.abs(pool[best]!.difficulty - target)) best = i;
  }
  return pool.splice(best, 1)[0]!;
}

function buildPacks(): DailyPack[] {
  // A mutable draw pile per engine. A puzzle is dealt at most once; the surplus
  // (the third engine of each category is now larger than 50 packs consume) is
  // a deliberate content reserve — never scheduled twice, never re-shown.
  const remaining: Record<string, Puzzle[]> = Object.fromEntries(
    Object.entries(LIBRARY).map(([engine, pool]) => [engine, [...(pool as Puzzle[])]]),
  );

  const packs: DailyPack[] = [];

  for (let i = 0; i < PACK_SIZE; i++) {
    const puzzles: Puzzle[] = [];

    for (let slot = 0; slot < 5; slot++) {
      const engines = ROTATION[slot]!;
      const engine = engines[i % engines.length]!;
      const pool = remaining[engine]!;

      if (!pool.length) {
        throw new Error(`pack ${i + 1}: engine ${engine} is exhausted — the pool is too small for the schedule`);
      }

      const target =
        slot === 4
          ? SPEED_TARGETS[i % SPEED_TARGETS.length]!
          : NON_SPEED_TARGETS[(slot + i) % NON_SPEED_TARGETS.length]!;

      puzzles.push(takeClosest(pool, target));
    }

    const mean = puzzles.reduce((t, p) => t + p.difficulty, 0) / puzzles.length;
    packs.push({
      id: `pack-${String(i + 1).padStart(2, '0')}`,
      difficulty: mean < 2.6 ? 'easier' : mean > 3.6 ? 'harder' : 'standard',
      puzzles,
    });
  }

  return packs;
}

/** The unscheduled surplus per engine — the content reserve (Core Spec §4). */
export function reserveCounts(): Record<string, number> {
  const scheduled = new Set(packs().flatMap((p) => p.puzzles.map((x) => x.id)));
  const counts: Record<string, number> = {};
  for (const [engine, pool] of Object.entries(LIBRARY)) {
    const reserve = (pool as Puzzle[]).filter((p) => !scheduled.has(p.id)).length;
    if (reserve) counts[engine] = reserve;
  }
  return counts;
}

/**
 * Fixed rhythm inside every pack: visual → analytical → logical → verbal → fast
 * (§1). Pack order is the rotation order; it must stay stable, or a given date
 * would start resolving to a different pack.
 *
 * LAZY ON PURPOSE (7K). This used to be `export const PACKS = buildPacks()`, which
 * ran at MODULE LOAD — so importing anything from this file built the entire local
 * puzzle library before first paint. Measured at 128–174 ms of blocking JS on
 * desktop V8 (Hermes on a mid-range Android is materially slower), and it retained
 * ~180 KB for the process lifetime.
 *
 * In CLOUD mode — which is what ships — the result was never read at all: packs come
 * from the server. The import chain (App → dailyPack → packs → content/library) made
 * every cold start pay for content it would never use. Building on first access means
 * local mode is unchanged and cloud mode never pays it.
 */
let built: DailyPack[] | null = null;
export function packs(): DailyPack[] {
  return (built ??= buildPacks());
}
