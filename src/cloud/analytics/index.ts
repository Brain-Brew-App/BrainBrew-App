/**
 * Default AnalyticsService wiring (Phase 7G).
 *
 * Cloud mode → posts batches to the `analytics-ingest` Edge Function (user derived
 * server-side from the JWT). Local mode → a no-op transport (never networks). All
 * fire-and-forget: an analytics failure never blocks gameplay. Screens import
 * `analytics` and call `track`/`trackScreen`; they never touch the transport.
 */

import { Platform } from 'react-native';

import { getSupabase } from '../../infrastructure/supabase/client';
import { isCloudMode } from '../env';
import { createAnalytics, type AnalyticsContext, type AnalyticsService, type AnalyticsTransport, type QueuedEvent } from './analytics';

const APP_VERSION = '1.0.0'; // keep in sync with app.config.js version

function platform(): AnalyticsContext['platform'] {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

const cloudTransport: AnalyticsTransport = {
  async send(events: QueuedEvent[]) {
    const fns = getSupabase().functions;
    // .bind(fns): `invoke` is a prototype method and needs `this` (FunctionsClient).
    const invoke = fns.invoke.bind(fns) as unknown as (
      name: string, opts: { body: unknown },
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await invoke('analytics-ingest', { body: { events } });
    if (error) throw new Error('ingest_error'); // triggers bounded retry in the core
    return (data ?? { accepted: 0, rejected: 0 }) as { accepted: number; rejected: number };
  },
};

const noopTransport: AnalyticsTransport = { async send() { return { accepted: 0, rejected: 0 }; } };

/**
 * Dev builds were tagging every event `environment: 'production'`, so all local and
 * QA play was indistinguishable from real player behaviour in the KPI tables. The
 * environment is now derived, not asserted.
 */
const ENVIRONMENT: 'development' | 'production' =
  typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';

export const analytics: AnalyticsService = createAnalytics({
  transport: isCloudMode() ? cloudTransport : noopTransport,
  context: () => ({ platform: platform(), appVersion: APP_VERSION, environment: ENVIRONMENT }),
  now: () => Date.now(),
  batchSize: 10,
  maxQueue: 200,
});

export type { AnalyticsEventName } from './analytics';
