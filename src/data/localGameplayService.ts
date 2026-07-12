/**
 * Local GameplayService — the bundled, offline, deterministic implementation.
 *
 * Preserves Phase 0 behaviour exactly: the deterministic date→pack mapping,
 * local scoring, local explanations, and the dev pack override. It satisfies the
 * same interface as the cloud service so the screens are mode-agnostic, but it
 * touches no network and needs no Supabase — a missing connection never blocks
 * local play.
 */

import { computeBrewScore, scorePuzzle } from '../scoring/brewScore';
import type { Answer, DailyPack } from '../types/puzzle';
import { DEV_ENABLED, resolveDailyPack, selectPackIndexForDate, utcDateIso } from './dailyPack';
import type { FinalOutcome, GameplayService, OpenedPuzzle, SlotOutcome, StartResult, TodayStatus } from './gameplayService';

export class LocalGameplayService implements GameplayService {
  readonly mode = 'local' as const;
  /** Local mode is offline and deterministic — it never produces a ranked result. */
  readonly supportsRanked = false as const;
  readonly ranked = false as const;

  private pack: DailyPack;
  private answers: Answer[] = [];

  /**
   * `devOverrideIndex` is honoured only in a dev build (the dev pack switcher);
   * it is inert in release, exactly as before.
   */
  constructor(
    private readonly today: Date = new Date(),
    private readonly devOverrideIndex: number | null = null,
  ) {
    this.pack = resolveDailyPack(today, devOverrideIndex, DEV_ENABLED);
  }

  async getTodayStatus(): Promise<TodayStatus> {
    return {
      date: utcDateIso(this.today),
      available: true,
      puzzleCount: this.pack.puzzles.length,
      difficultyLabel: this.pack.difficulty,
      packId: this.pack.id,
      packIndex: this.devOverrideIndex ?? selectPackIndexForDate(this.today),
    };
  }

  async startSession(): Promise<StartResult> {
    // Local play is always unranked practice; the `ranked` request is ignored.
    this.answers = [];
    return { puzzleCount: this.pack.puzzles.length, ranked: false, resumePosition: 1, completedPositions: [] };
  }

  async startPractice(): Promise<StartResult> {
    // Local mode is offline: "practice" is just the local pack (no reserve/cloud).
    return this.startSession();
  }

  /** Archives are a server-authoritative Premium feature — never available offline. */
  async startArchive(_date: string): Promise<StartResult> {
    throw new Error('archive_unsupported_local');
  }

  async openPuzzle(position: number): Promise<OpenedPuzzle> {
    const puzzle = this.pack.puzzles[position - 1];
    if (!puzzle) throw new Error(`local: no puzzle at position ${position}`);
    return { position, puzzle };
  }

  async submitAnswer(position: number, answer: Answer): Promise<SlotOutcome> {
    const puzzle = this.pack.puzzles[position - 1];
    if (!puzzle) throw new Error(`local: no puzzle at position ${position}`);
    // Keep answers aligned with slots for the final BrewScore.
    this.answers[position - 1] = answer;
    const result = scorePuzzle(puzzle, answer);
    return { result, explanation: puzzle.explanation };
  }

  async completeSession(): Promise<FinalOutcome> {
    return { score: computeBrewScore(this.pack.puzzles, this.answers), ranked: false, rankedDate: null };
  }

  async restartSession(): Promise<StartResult> {
    return this.startSession();
  }
}
