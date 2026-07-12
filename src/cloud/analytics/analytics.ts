/**
 * AnalyticsService core (Phase 7G) — pure, platform-free, unit-tested.
 *
 * A tiny, never-blocking client-event queue: `track` enqueues, batches flush to an
 * injected transport, failures are bounded-retried then dropped. Analytics must
 * NEVER block or break gameplay — every method swallows errors. The user id is
 * NOT set here; the server derives it from the JWT at ingest. Dedup keys make a
 * retry idempotent (the server dedups on them).
 *
 * Event names are the fixed allowlist mirrored from ANALYTICS_EVENT_MODEL.md; an
 * unknown name is dropped client-side too (defence in depth).
 */

export const ANALYTICS_EVENTS = [
  'app_opened', 'app_foregrounded', 'app_backgrounded', 'app_version_seen', 'screen_viewed',
  'anonymous_session_created', 'profile_setup_started', 'profile_completed',
  'secure_progress_started', 'account_secured_email', 'account_secured_google',
  'home_ranked_cta_viewed', 'ranked_start_requested', 'ranked_attempt_resumed', 'puzzle_rendered',
  'answer_submit_requested', 'reveal_viewed', 'ranked_results_viewed', 'leaderboard_opened',
  'practice_cta_viewed', 'practice_started', 'practice_completed', 'practice_results_viewed', 'practice_summary_viewed',
  'share_requested', 'share_completed', 'share_cancelled', 'share_failed',
  'premium_preview_viewed', 'offering_requested', 'offering_loaded', 'purchase_requested',
  'purchase_cancelled', 'purchase_client_failed', 'restore_requested', 'restore_completed',
  // 7J Premium purchase + Archives (safe, non-identifying — no receipts/tokens/ids).
  'premium_screen_viewed', 'offering_unavailable', 'purchase_started', 'purchase_sdk_succeeded',
  'purchase_server_confirmed', 'purchase_sync_delayed', 'restore_started', 'restore_nothing_found',
  'restore_conflict', 'premium_feature_opened',
  'archive_calendar_viewed', 'archive_locked_viewed', 'archive_date_selected', 'archive_start_requested',
  'archive_started', 'archive_resumed', 'archive_completed', 'archive_replayed',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
const ALLOWED = new Set<string>(ANALYTICS_EVENTS);

/** Property keys never allowed client-side (mirrors the server guard). */
const FORBIDDEN_PROPS = new Set([
  'email', 'password', 'token', 'auth_token', 'access_token', 'jwt', 'secret',
  'receipt', 'purchase_token', 'transaction_id', 'customer_id', 'app_user_id',
  'correct_answer', 'answer', 'answer_payload', 'submitted_answer', 'seed', 'ip',
  'latitude', 'longitude', 'ad_id', 'idfa', 'gaid',
]);

export interface AnalyticsContext {
  platform: 'ios' | 'android' | 'web' | 'unknown';
  appVersion?: string;
  buildNumber?: string;
  environment?: string;
  countryCode?: string;
}

export interface QueuedEvent {
  event_name: AnalyticsEventName;
  occurred_at: string;
  dedup_key: string;
  platform: string;
  app_version?: string;
  build_number?: string;
  environment?: string;
  country_code?: string;
  screen?: string;
  category?: string;
  engine_id?: string;
  attempt_purpose?: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsTransport {
  send(events: QueuedEvent[]): Promise<{ accepted: number; rejected: number }>;
}

export interface AnalyticsDeps {
  transport: AnalyticsTransport;
  context: () => AnalyticsContext;
  now: () => number;
  batchSize?: number;   // flush when the queue reaches this
  maxQueue?: number;    // hard cap — oldest dropped beyond this
  maxRetries?: number;  // per-batch retry budget before dropping
}

export interface TrackOptions {
  screen?: string; category?: string; engineId?: string; attemptPurpose?: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsService {
  track(event: AnalyticsEventName, opts?: TrackOptions): void;
  trackScreen(screen: string): void;
  setSessionContext(sessionId: string): void;
  clearIdentityContext(): void;
  flush(): Promise<void>;
  /** Test/inspection: current queue length. */
  _queued(): number;
}

const scrub = (props?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN_PROPS.has(k.toLowerCase())) continue;   // never send a forbidden key
    if (typeof v === 'object' && v !== null) continue;    // keep properties flat + small
    out[k] = v;
  }
  return out;
};

export function createAnalytics(deps: AnalyticsDeps): AnalyticsService {
  const batchSize = deps.batchSize ?? 10;
  const maxQueue = deps.maxQueue ?? 200;
  const maxRetries = deps.maxRetries ?? 3;
  let queue: QueuedEvent[] = [];
  let session = 'nosession';
  let counter = 0;
  let retries = 0;
  let flushing = false;

  const enqueue = (event: AnalyticsEventName, opts?: TrackOptions) => {
    if (!ALLOWED.has(event)) return;
    const ctx = deps.context();
    queue.push({
      event_name: event,
      occurred_at: new Date(deps.now()).toISOString(),
      dedup_key: `${session}:${counter++}`,
      platform: ctx.platform,
      app_version: ctx.appVersion,
      build_number: ctx.buildNumber,
      environment: ctx.environment ?? 'production',
      country_code: ctx.countryCode,
      screen: opts?.screen,
      category: opts?.category,
      engine_id: opts?.engineId,
      attempt_purpose: opts?.attemptPurpose,
      properties: scrub(opts?.properties),
    });
    if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue); // drop oldest
  };

  const service: AnalyticsService = {
    track(event, opts) {
      try {
        enqueue(event, opts);
        if (queue.length >= batchSize) void service.flush();
      } catch { /* analytics never throws to the caller */ }
    },
    trackScreen(screen) { service.track('screen_viewed', { screen }); },
    setSessionContext(sessionId) { session = sessionId || 'nosession'; counter = 0; },
    clearIdentityContext() { queue = []; session = 'nosession'; counter = 0; retries = 0; },
    async flush() {
      if (flushing || queue.length === 0) return;
      flushing = true;
      const batch = queue.slice(0, batchSize);
      try {
        await deps.transport.send(batch);
        queue = queue.slice(batch.length); // sent (server dedups if it arrives twice)
        retries = 0;
      } catch {
        retries += 1;
        if (retries > maxRetries) { queue = queue.slice(batch.length); retries = 0; } // give up on this batch
      } finally {
        flushing = false;
      }
    },
    _queued: () => queue.length,
  };
  return service;
}
