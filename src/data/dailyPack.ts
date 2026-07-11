/**
 * Deterministic date → pack selection (Core Spec §2, §5).
 *
 * The same calendar date always yields the same pack, for everyone, forever.
 * Never random: a random pack would break "everyone plays the identical daily
 * pack", and would also mean replaying a day showed different puzzles.
 *
 * The day boundary is 00:00 **UTC**, matching the single global reset in §4 —
 * not the device's local midnight, which would hand some timezones tomorrow's
 * pack early.
 */

import type { DailyPack } from '../types/puzzle';
import { PACKS } from './packs';

export const PACK_COUNT = PACKS.length;

const MS_PER_DAY = 86_400_000;

/** Whole days since the Unix epoch, in UTC. Time of day is discarded. */
export function utcDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY,
  );
}

/** Index into PACKS for a date. Pure, total, and stable across runs. */
export function selectPackIndexForDate(date: Date): number {
  // Modulo is sign-corrected so pre-1970 dates cannot produce a negative index.
  return ((utcDayNumber(date) % PACK_COUNT) + PACK_COUNT) % PACK_COUNT;
}

/** Wraps out-of-range indices rather than throwing — used by the dev switcher. */
export function getPackByIndex(index: number): DailyPack {
  return PACKS[((index % PACK_COUNT) + PACK_COUNT) % PACK_COUNT]!;
}

/** Today's pack. This is the only function the real app should ever call. */
export function getDailyPack(date: Date = new Date()): DailyPack {
  return PACKS[selectPackIndexForDate(date)]!;
}

/**
 * Applies the developer pack override, if and only if the app is running in a
 * development build AND an override is set. In a release build this is exactly
 * `getDailyPack(date)` — the override is inert, not merely hidden.
 */
export function resolveDailyPack(
  date: Date,
  devOverrideIndex: number | null,
  devEnabled: boolean,
): DailyPack {
  if (devEnabled && devOverrideIndex !== null) return getPackByIndex(devOverrideIndex);
  return getDailyPack(date);
}

/** `YYYY-MM-DD` in UTC, so the displayed date matches the pack that was chosen. */
export function utcDateIso(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Metro defines `__DEV__` as a global; plain Node (the test runner) does not.
 * Declared locally so this module compiles in both, and `typeof` on an
 * undeclared name is safe at runtime.
 */
declare const __DEV__: boolean | undefined;

/** True only in a development build. Safe to import from plain Node (tests). */
export const DEV_ENABLED: boolean = typeof __DEV__ !== 'undefined' && __DEV__ === true;
