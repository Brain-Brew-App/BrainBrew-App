/**
 * Archive client-side validation (Phase 7J.4) — pure, testable.
 *
 * Runtime-validates the calendar / pack / attempt shapes the Archive RPCs return
 * BEFORE they reach a screen, and — critically — enforces a recursive
 * FORBIDDEN-FIELD guard so an answer, private seed, receipt, or provider id can
 * never render even if the server ever regressed. Screens must call these, never
 * trust the raw payload. The server remains authoritative for entitlement.
 */

/** Fields that must NEVER appear in any archive payload the client renders. */
export const FORBIDDEN_FIELDS = [
  'correct_answer', 'answerKey', 'answer_key', 'private_answer', 'answer_payload',
  'seed', 'puzzle_seed', 'seed_payload', 'targetIds', 'correctOrder', 'correctOptionId',
  'oddTileId', 'wrongIndex', 'correctTerm', 'pairTileIds', 'bucket', 'classification',
  'explanation_before_submit', 'receipt', 'purchase_token', 'provider_customer_id',
  'revenuecat_customer_id', 'transaction_id',
] as const;

/** Recursively assert no forbidden field appears anywhere in `value`. Throws on leak. */
export function assertNoForbiddenFields(value: unknown, path = '$'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoForbiddenFields(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_FIELDS as readonly string[]).includes(k)) {
      throw new Error(`archive payload leaks forbidden field "${k}" at ${path}`);
    }
    assertNoForbiddenFields(v, `${path}.${k}`);
  }
}

export interface ArchiveCalendarDate { rankedDate: string; difficultyLabel: string; incident: boolean; available: boolean }
export interface ArchiveCalendar { locked: boolean; total: number; dates: ArchiveCalendarDate[] }
export interface ArchiveSlot { position: number; category: string; engineId: string; puzzleId: string; publicPayload: Record<string, unknown>; voided: boolean }
export interface ArchivePack { rankedDate: string; difficultyLabel: string; slots: ArchiveSlot[] }

const isPastUtcDate = (d: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return d < today;
};

const CATEGORY_ORDER = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];

/** Validate + normalize the archive calendar. Throws on a malformed/forbidden payload. */
export function validateCalendar(raw: unknown): ArchiveCalendar {
  assertNoForbiddenFields(raw);
  const r = raw as Record<string, unknown>;
  const dates = Array.isArray(r.dates) ? (r.dates as Record<string, unknown>[]) : [];
  for (const d of dates) {
    if (!isPastUtcDate(String(d.ranked_date))) throw new Error(`calendar contains a non-past date: ${d.ranked_date}`);
  }
  return {
    locked: !!r.locked,
    total: Number(r.total ?? dates.length),
    dates: dates.map((d) => ({ rankedDate: String(d.ranked_date), difficultyLabel: String(d.difficulty_label ?? 'standard'), incident: !!d.incident, available: d.available !== false })),
  };
}

/** Validate + normalize an archive pack (past, published, sanitized, void-aware). */
export function validatePack(raw: unknown): ArchivePack {
  assertNoForbiddenFields(raw);
  const r = raw as Record<string, unknown>;
  const date = String(r.ranked_date ?? '');
  if (!isPastUtcDate(date)) throw new Error(`archive pack is not a past date: ${date}`);
  const rawSlots = Array.isArray(r.slots) ? (r.slots as Record<string, unknown>[]) : [];
  const slots: ArchiveSlot[] = rawSlots.map((s) => ({
    position: Number(s.position),
    category: String(s.category),
    engineId: String(s.engine_id),
    puzzleId: String(s.puzzle_id),
    publicPayload: (s.public_payload as Record<string, unknown>) ?? {},
    voided: !!s.voided,
  }));
  // Active (non-void) slots must be in the fixed category order.
  const active = slots.filter((s) => !s.voided).sort((a, b) => a.position - b.position);
  active.forEach((s) => {
    if (CATEGORY_ORDER[s.position - 1] !== s.category) throw new Error(`archive slot ${s.position} has wrong category ${s.category}`);
  });
  return { rankedDate: date, difficultyLabel: String(r.difficulty_label ?? 'standard'), slots };
}

/** The active denominator for an archive pack = sum of max scores of non-void slots. */
export function activeDenominator(pack: ArchivePack, maxPerSlot = 20): number {
  return pack.slots.filter((s) => !s.voided).length * maxPerSlot;
}

/** Guard the start response: it must be unranked + archive-purposed, no client score. */
export function validateArchiveStart(raw: unknown): { attemptId: string; rankedDate: string; resumed: boolean } {
  assertNoForbiddenFields(raw);
  const r = raw as Record<string, unknown>;
  if (r.is_ranked === true) throw new Error('archive start returned is_ranked=true');
  if ('final_score' in r || 'score' in r) throw new Error('archive start must not carry a client score');
  if (!r.attempt_id) throw new Error('archive start missing attempt_id');
  return { attemptId: String(r.attempt_id), rankedDate: String(r.ranked_date ?? ''), resumed: !!r.resumed };
}
