/**
 * Reusable, server-validated dashboard filters (Phase 7G). Parsed from URL query
 * params with safe defaults and a hard maximum range — no arbitrary SQL, no
 * unbounded dimensions. All dates are UTC ISO (YYYY-MM-DD).
 */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface DateRange { from: string; to: string; days: number }

/** Parse `?from&to&range=` into a bounded UTC date range (default last 30 days). */
export function parseRange(sp: Record<string, string | string[] | undefined>): DateRange {
  const today = Date.now();
  const preset = typeof sp.range === 'string' ? sp.range : '';
  const presetDays: Record<string, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
  let from = typeof sp.from === 'string' ? sp.from : '';
  let to = typeof sp.to === 'string' ? sp.to : '';

  if (presetDays[preset]) {
    to = iso(today);
    from = iso(today - (presetDays[preset] - 1) * DAY);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    to = iso(today); from = iso(today - 29 * DAY); // default 30d
  }
  // Clamp to a max 400-day window and ensure from <= to.
  let fromMs = Date.parse(from), toMs = Date.parse(to);
  if (fromMs > toMs) [fromMs, toMs] = [toMs, fromMs];
  if (toMs - fromMs > 400 * DAY) fromMs = toMs - 400 * DAY;
  return { from: iso(fromMs), to: iso(toMs), days: Math.round((toMs - fromMs) / DAY) + 1 };
}

/** Parse a 1-based `?page=` into a bounded { limit, offset, page }. */
export function parsePage(sp: Record<string, string | string[] | undefined>, limit = 25): { limit: number; offset: number; page: number } {
  const raw = typeof sp.page === 'string' ? parseInt(sp.page, 10) : 1;
  const page = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10000) : 1;
  return { limit, offset: (page - 1) * limit, page };
}

/** A validated single-value filter (returns undefined if not in the allowlist). */
export function pick(sp: Record<string, string | string[] | undefined>, key: string, allow: readonly string[]): string | undefined {
  const v = typeof sp[key] === 'string' ? (sp[key] as string) : undefined;
  return v && allow.includes(v) ? v : undefined;
}
