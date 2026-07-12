/**
 * Mode-aware Archive service (Phase 7J.5) — the ONLY boundary screens use to reach
 * Archives. Every response is run through archiveValidate (shape + recursive
 * forbidden-field guard) before a screen sees it, so an answer/seed/receipt/provider
 * id can never render. The transport is injected (a thin { rpc, invoke } client) so
 * this is pure + testable without Supabase.
 *
 * Reads (get_archive_calendar / get_archive_pack) are authenticated RPCs. Start goes
 * through the service-role `start-archive-attempt` Edge Function (JWT-verified there),
 * never a direct client write. Puzzle open/submit/complete reuse the existing
 * server-authoritative gameplay path (unchanged) — the attempt is just is_ranked=false.
 */

import {
  validateCalendar, validatePack, validateArchiveStart, activeDenominator,
  type ArchiveCalendar, type ArchivePack,
} from './archiveValidate';

export interface ArchiveTransport {
  /** Call an authenticated RPC; returns { data, error }. */
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  /** Invoke a JWT-verified Edge Function; returns { data, error }. */
  invoke(fn: string, body: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export interface ArchiveStart { attemptId: string; rankedDate: string; resumed: boolean }

export interface ArchiveService {
  supported: boolean;
  getCalendar(limit?: number, offset?: number): Promise<ArchiveCalendar>;
  getPack(date: string): Promise<ArchivePack>;
  /** Server-authorized unranked archive attempt (entitlement re-checked server-side). */
  startArchive(date: string, sessionId: string, appVersion?: string): Promise<ArchiveStart>;
  /** Resume = start again (the RPC returns the existing active attempt). */
  resumeArchive(date: string, sessionId: string, appVersion?: string): Promise<ArchiveStart>;
  denominator(pack: ArchivePack): number;
}

/** Normalize an unknown thrown/returned error to a safe code (never raw provider text). */
function safeError(error: unknown): string {
  const msg = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error ?? '');
  if (/archive_locked|42501|not.?authenticated/i.test(msg)) return 'archive_locked';
  if (/not_a_past_date|22023/i.test(msg)) return 'not_a_past_date';
  if (/unavailable|P0001|fully_voided/i.test(msg)) return 'archive_unavailable';
  if (/network|fetch|timeout/i.test(msg)) return 'network_error';
  return 'archive_error';
}

export function createCloudArchiveService(t: ArchiveTransport): ArchiveService {
  return {
    supported: true,
    async getCalendar(limit = 30, offset = 0) {
      const { data, error } = await t.rpc('get_archive_calendar', { p_limit: limit, p_offset: offset });
      if (error) throw new Error(safeError(error));
      return validateCalendar(data);
    },
    async getPack(date) {
      const { data, error } = await t.rpc('get_archive_pack', { p_date: date });
      if (error) throw new Error(safeError(error));
      return validatePack(data);
    },
    async startArchive(date, sessionId, appVersion) {
      const { data, error } = await t.invoke('start-archive-attempt', { date, sessionId, appVersion });
      if (error) throw new Error(safeError(error));
      return validateArchiveStart(data);
    },
    resumeArchive(date, sessionId, appVersion) {
      return this.startArchive(date, sessionId, appVersion); // start returns the active attempt (resumed=true)
    },
    denominator(pack) { return activeDenominator(pack); },
  };
}

/** Local/dev mode: explicitly unsupported. Never claims Premium, never calls the network. */
export function createLocalArchiveService(): ArchiveService {
  const nope = async (): Promise<never> => { throw new Error('archive_unsupported_local'); };
  return {
    supported: false,
    getCalendar: async () => ({ locked: true, total: 0, dates: [] }),
    getPack: nope,
    startArchive: nope,
    resumeArchive: nope,
    denominator: (pack) => activeDenominator(pack),
  };
}
