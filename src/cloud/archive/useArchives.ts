/**
 * Archives hook (Phase 7J.6) — cache-first, identity-keyed, non-blocking.
 *
 * Instantiates the cloud ArchiveService over the shared Supabase client and loads
 * the past-pack calendar for the CURRENT Auth user. All state is keyed by the Auth
 * UUID and cleared on identity change, so User B never sees User A's Archives.
 * Never touches the core Home/pack path — it loads only when the Archives screen
 * opens. Local/unsupported mode returns a locked calendar without a network call.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { isCloudMode } from '../env';
import { getSupabase } from '../../infrastructure/supabase/client';
import { analytics } from '../analytics';
import { createCloudArchiveService, createLocalArchiveService, type ArchiveService, type ArchiveStart } from './archiveService';
import type { ArchiveCalendar, ArchivePack } from './archiveValidate';

function makeService(): ArchiveService {
  if (!isCloudMode()) return createLocalArchiveService();
  const supa = getSupabase();
  return createCloudArchiveService({
    rpc: async (name, args) => { const r = await supa.rpc(name as never, args as never); return { data: r.data, error: r.error }; },
    invoke: async (fn, body) => { const r = await supa.functions.invoke(fn, { body }); return { data: r.data, error: r.error }; },
  });
}

export type ArchivesPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ArchivesView {
  phase: ArchivesPhase;
  locked: boolean;
  calendar: ArchiveCalendar | null;
  service: ArchiveService;
  refresh: () => void;
  getPack: (date: string) => Promise<ArchivePack>;
  start: (date: string, sessionId: string, appVersion?: string) => Promise<ArchiveStart>;
}

/** `authUserId` keys the cache: a change resets Archive state (account isolation). */
export function useArchives(enabled: boolean, authUserId: string | null): ArchivesView {
  const [phase, setPhase] = useState<ArchivesPhase>('idle');
  const [calendar, setCalendar] = useState<ArchiveCalendar | null>(null);
  const serviceRef = useRef<ArchiveService>(makeService());
  const inFlight = useRef(false);
  const owner = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setPhase((p) => (calendar ? p : 'loading'));
    try {
      const cal = await serviceRef.current.getCalendar();
      setCalendar(cal);
      setPhase('ready');
      analytics.track(cal.locked ? 'archive_locked_viewed' : 'archive_calendar_viewed', { properties: { outcome: cal.locked ? 'locked' : 'available' } });
    } catch {
      setPhase('error');
    } finally {
      inFlight.current = false;
    }
  }, [enabled, calendar]);

  // Reset + reload when the identity changes (no cross-account bleed).
  useEffect(() => {
    if (owner.current !== authUserId) {
      owner.current = authUserId;
      serviceRef.current = makeService();
      setCalendar(null);
      setPhase('idle');
    }
    if (enabled) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, authUserId]);

  return {
    phase,
    locked: calendar?.locked ?? true,
    calendar,
    service: serviceRef.current,
    refresh: () => { setCalendar(null); void load(); },
    getPack: (date) => serviceRef.current.getPack(date),
    start: (date, sessionId, appVersion) => serviceRef.current.startArchive(date, sessionId, appVersion),
  };
}
