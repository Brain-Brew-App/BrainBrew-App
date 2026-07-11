/**
 * Progress data access — fetch + validate + a tiny in-session cache.
 *
 * The personal summary is cached for the session so Home/Results/Progress paint
 * instantly on revisit; it is invalidated when a ranked result completes (or is
 * recalculated) so a stale streak/score is never shown as current.
 */

import { progress, ProgressError } from '../infrastructure/supabase/progressClient';
import {
  PayloadError,
  validateHistoryPage,
  validatePracticeHistoryPage,
  validatePracticeSummary,
  validateProgressDetail,
  validateProgressSummary,
  type ValidHistoryPage,
  type ValidPracticeHistoryPage,
  type ValidPracticeSummary,
  type ValidProgressDetail,
  type ValidProgressSummary,
} from './validate';

export function progressErrorCode(e: unknown): string {
  if (e instanceof ProgressError) return e.code;
  if (e instanceof PayloadError) return e.code === 'answer_leak' ? 'answer_leak' : 'invalid_response';
  return 'network_error';
}

let cachedSummary: ValidProgressSummary | null = null;

export function cachedProgressSummary(): ValidProgressSummary | null {
  return cachedSummary;
}

/** Drop the cached summary (after a ranked completion or recalculation). */
export function invalidateMyProgress(): void {
  cachedSummary = null;
}

export async function fetchProgressSummary(): Promise<ValidProgressSummary> {
  const value = validateProgressSummary(await progress.summary());
  cachedSummary = value;
  return value;
}

export async function fetchProgressDetail(days = 35): Promise<ValidProgressDetail> {
  return validateProgressDetail(await progress.detail(days));
}

export async function fetchRankedHistory(before: string | null = null, limit = 30): Promise<ValidHistoryPage> {
  return validateHistoryPage(await progress.history(before, limit));
}

let cachedPractice: ValidPracticeSummary | null = null;
export function cachedPracticeSummary(): ValidPracticeSummary | null { return cachedPractice; }
export function invalidateMyPractice(): void { cachedPractice = null; }

export async function fetchPracticeSummary(): Promise<ValidPracticeSummary> {
  const v = validatePracticeSummary(await progress.practiceSummary());
  cachedPractice = v;
  return v;
}

export async function fetchPracticeHistory(before: string | null = null, limit = 20): Promise<ValidPracticeHistoryPage> {
  return validatePracticeHistoryPage(await progress.practiceHistory(before, limit));
}
