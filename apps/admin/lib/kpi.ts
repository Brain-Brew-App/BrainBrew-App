/**
 * KPI definitions registry (Phase 7F) — the SAME definitions the UI tooltips use
 * and docs/KPI_DICTIONARY.md documents. One source of truth: never a different
 * formula in SQL vs UI. Every number on the dashboard maps to an entry here.
 */

export interface KpiDef {
  key: string;
  name: string;
  formula: string;
  source: string;
  timezone: 'UTC';
  freshness: 'live' | 'hourly' | 'daily';
  caveats?: string;
}

export const KPI: Record<string, KpiDef> = {
  total_users: { key: 'total_users', name: 'Total users', formula: 'count(profiles)', source: 'profiles', timezone: 'UTC', freshness: 'live' },
  anonymous_users: { key: 'anonymous_users', name: 'Anonymous users', formula: "count(profiles where account_type='anonymous')", source: 'profiles', timezone: 'UTC', freshness: 'live' },
  permanent_users: { key: 'permanent_users', name: 'Permanent users', formula: "count(profiles where account_type='permanent')", source: 'profiles', timezone: 'UTC', freshness: 'live' },
  new_users_7d: { key: 'new_users_7d', name: 'New users (7d)', formula: 'count(auth.users where created_at >= now()-7d)', source: 'auth.users', timezone: 'UTC', freshness: 'live' },
  dau: { key: 'dau', name: 'DAU', formula: 'distinct users with an attempt on the UTC day', source: 'attempts', timezone: 'UTC', freshness: 'live', caveats: 'Activity = started/completed a Brew, not a page open.' },
  wau: { key: 'wau', name: 'WAU', formula: 'distinct users with an attempt in the trailing 7 UTC days', source: 'attempts', timezone: 'UTC', freshness: 'live' },
  mau: { key: 'mau', name: 'MAU', formula: 'distinct users with an attempt in the trailing 30 UTC days', source: 'attempts', timezone: 'UTC', freshness: 'live' },
  stickiness: { key: 'stickiness', name: 'Stickiness', formula: 'DAU / MAU', source: 'attempts', timezone: 'UTC', freshness: 'live' },
  ranked_completed_total: { key: 'ranked_completed_total', name: 'Ranked Brews completed', formula: "count(attempts where is_ranked and status='completed')", source: 'attempts', timezone: 'UTC', freshness: 'live' },
  practice_completed_total: { key: 'practice_completed_total', name: 'Practice Brews completed', formula: "count(attempts where attempt_purpose='practice' and status='completed')", source: 'attempts', timezone: 'UTC', freshness: 'live' },
  avg_brewscore: { key: 'avg_brewscore', name: 'Average BrewScore', formula: 'avg(final_score) over completed ranked attempts', source: 'attempts', timezone: 'UTC', freshness: 'live' },
  median_brewscore: { key: 'median_brewscore', name: 'Median BrewScore', formula: 'percentile_cont(0.5) of final_score over completed ranked attempts', source: 'attempts', timezone: 'UTC', freshness: 'live' },
  ranked_completion_rate: { key: 'ranked_completion_rate', name: 'Ranked completion rate', formula: 'completed / started ranked attempts (by created_at, UTC range)', source: 'attempts', timezone: 'UTC', freshness: 'live' },
  active_subscriptions: { key: 'active_subscriptions', name: 'Active subscriptions', formula: "count(player_entitlements where state in (premium, grace_period, billing_issue))", source: 'player_entitlements', timezone: 'UTC', freshness: 'live', caveats: 'Sandbox only until public billing launches.' },
  mrr: { key: 'mrr', name: 'MRR', formula: 'sum of active subscription monthly-normalized price', source: 'RevenueCat + store prices', timezone: 'UTC', freshness: 'daily', caveats: 'PENDING: requires store price data — not yet available. Shown as “pending”.' },
};

/** Tooltip text for a KPI. */
export function tip(key: string): string {
  const d = KPI[key];
  if (!d) return '';
  return `${d.name}\nFormula: ${d.formula}\nSource: ${d.source} (${d.timezone})\nFreshness: ${d.freshness}${d.caveats ? `\nNote: ${d.caveats}` : ''}`;
}
