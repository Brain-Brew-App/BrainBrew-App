/**
 * Repository boundary.
 *
 * Narrow interfaces over the three content concerns, so the *source* of content
 * can change (local library today, Supabase later) without touching gameplay.
 * This is a replaceable seam, not a dependency-injection framework.
 *
 * The **local adapter below is the active gameplay source in Phase 4A** and
 * stays authoritative. It simply delegates to the existing local functions, so
 * introducing it changes no behaviour. The Supabase adapter
 * (`src/infrastructure/supabase/supabaseRepositories.ts`) is verification-only:
 * it can read metadata and the sanitized public payload, but cannot reconstruct
 * a *scorable* puzzle, because the cloud never sends the answer. That stays true
 * until server-authoritative scoring exists (documented there and in the design
 * doc).
 */

import { ENGINE_REGISTRY, type EngineRegistryEntry } from '../content/engines';
import { ALL_PUZZLES } from '../content/library';
import {
  getDailyPack,
  getPackByIndex,
  PACK_COUNT,
  resolveDailyPack,
} from './dailyPack';
import type { DailyPack, Puzzle } from '../types/puzzle';

export interface EngineRepository {
  listEngines(): Promise<EngineRegistryEntry[]>;
}

export interface ContentRepository {
  /** A full, scorable puzzle when the source has answers (local); else null. */
  getScorablePuzzle(puzzleId: string): Promise<Puzzle | null>;
  countPuzzles(): Promise<number>;
}

export interface DailyPackRepository {
  getPackForDate(date: Date): Promise<DailyPack>;
  getPackByIndex(index: number): Promise<DailyPack>;
  resolvePack(date: Date, devOverrideIndex: number | null, devEnabled: boolean): Promise<DailyPack>;
  packCount(): Promise<number>;
}

// --- Local adapter (active) -------------------------------------------------

const byId = new Map(ALL_PUZZLES.map((p) => [p.id, p]));

export const localEngineRepository: EngineRepository = {
  async listEngines() {
    return ENGINE_REGISTRY;
  },
};

export const localContentRepository: ContentRepository = {
  async getScorablePuzzle(puzzleId) {
    return byId.get(puzzleId) ?? null;
  },
  async countPuzzles() {
    return ALL_PUZZLES.length;
  },
};

export const localDailyPackRepository: DailyPackRepository = {
  async getPackForDate(date) {
    return getDailyPack(date);
  },
  async getPackByIndex(index) {
    return getPackByIndex(index);
  },
  async resolvePack(date, devOverrideIndex, devEnabled) {
    return resolveDailyPack(date, devOverrideIndex, devEnabled);
  },
  async packCount() {
    return PACK_COUNT;
  },
};
