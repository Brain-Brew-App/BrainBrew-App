/**
 * Supabase repository adapter — VERIFICATION-ONLY in Phase 4A.
 *
 * This adapter reads engine metadata and the sanitized public pack surface with
 * the publishable (anon) key. It is deliberately **not** wired into gameplay,
 * and it *cannot* be: a scorable puzzle needs its answer, and the public surface
 * never carries one (that is the whole security model). So `getScorablePuzzle`
 * always returns null here.
 *
 * It exists to let tooling confirm the cloud content is present and sanitized.
 * It becomes a real gameplay source only after a later phase adds
 * server-authoritative attempt issuance and private scoring — at which point the
 * client submits an answer and the *server* scores it, and this adapter never
 * needs to hold the answer at all.
 */

import { engineRowToMeta, publicSlotToRenderSafe, type EngineMeta, type RenderSafePuzzle } from './mappers';
import { getSupabase } from './client';

export const supabaseEngineRepository = {
  /** Engine registry metadata (public-safe; no answers involved). */
  async listEngines(): Promise<EngineMeta[]> {
    const { data, error } = await getSupabase()
      .from('puzzle_engines')
      .select('*')
      .order('engine_id');
    if (error) throw error;
    return (data ?? []).map(engineRowToMeta);
  },
};

export const supabaseContentRepository = {
  /**
   * Always null: the cloud cannot hand a public client a scorable puzzle. This
   * is intentional, not a stub — reconstructing a scorable puzzle requires the
   * answer, which stays server-side until server-authoritative scoring exists.
   */
  async getScorablePuzzle(): Promise<null> {
    return null;
  },
};

export const supabasePublicPackRepository = {
  /**
   * The sanitized public slots for a UTC date — render-safe, never scorable.
   * Reads through the `get_public_pack` RPC, which is the ONLY surface anon may
   * touch (it cannot reach the base tables). The RPC already filters to a live,
   * non-future, non-voided pack and returns no answer column.
   */
  async getPublicPack(dateIso: string): Promise<RenderSafePuzzle[]> {
    const { data, error } = await getSupabase().rpc('get_public_pack', { p_date: dateIso });
    if (error) throw error;
    return (data ?? []).map(publicSlotToRenderSafe);
  },
};
