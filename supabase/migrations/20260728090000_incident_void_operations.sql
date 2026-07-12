-- BrainBrew — Incident content-void orchestration (Phase 7I.2C).
--
-- A broken LIVE puzzle is resolved by VOIDING its slot (no substitution) and
-- recalculating every affected ranked result. This is the ONE denominator-
-- altering path for consumed content. It reuses the canonical, idempotent
-- `recalculate_ranked_result` (which already excludes void slots + renormalizes
-- to 100 + bumps recalc_version only on change); leaderboards, progress and
-- streaks derive from `attempts`, so they self-correct once results are recalced.
--
-- The operation is a durable, resumable, idempotent job row (not a fragile single
-- request): batches are bounded, safe to re-run, safe if a worker times out or two
-- workers race (recalc idempotency guarantees no score drift). Founder-only,
-- recent-auth (enforced in the calling server action), typed-confirmation gated.
-- Service-role only; no answers or submissions are ever stored in operation rows.

do $$ begin
  create type void_op_status as enum ('pending','running','completed','partially_failed','failed');
exception when duplicate_object then null; end $$;

create table if not exists admin_content_void_operations (
  id uuid primary key default gen_random_uuid(),
  incident_id bigint not null references admin_incidents(id),
  pack_id text not null references daily_packs(pack_id),
  slot_id uuid not null references daily_pack_slots(id),
  puzzle_id text not null,
  ranked_date date,
  requested_by uuid references auth.users(id),
  reason text not null,
  status void_op_status not null default 'pending',
  idempotency_key text not null unique,
  affected_attempt_count int not null default 0,
  processed_attempt_count int not null default 0,
  failed_attempt_count int not null default 0,
  original_denominator int,
  new_denominator int,
  cursor_attempt_id uuid,               -- resume point (progress only; recalc is idempotent)
  retry_count int not null default 0,
  last_error_code text,
  diagnostic_reference text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table admin_content_void_operations enable row level security; -- no policies → service-role only
-- At most ONE active (pending/running) operation per slot.
create unique index if not exists one_active_void_per_slot
  on admin_content_void_operations (slot_id) where status in ('pending','running');
drop trigger if exists void_ops_updated on admin_content_void_operations;
create trigger void_ops_updated before update on admin_content_void_operations for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Process one bounded batch of a running operation. Idempotent: recalc of an
-- already-corrected attempt is a no-op (no version bump). Advances the cursor;
-- flips to completed / partially_failed when the affected set is exhausted.
-- ---------------------------------------------------------------------------
create or replace function admin_process_void_batch(p_op_id uuid, p_batch int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  op admin_content_void_operations%rowtype;
  v_batch int := least(greatest(coalesce(p_batch, 200), 1), 1000);
  att record; v_last uuid; v_done int := 0; v_fail int := 0; v_rows int := 0; r jsonb;
begin
  select * into op from admin_content_void_operations where id = p_op_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if op.status not in ('running','partially_failed') then
    return jsonb_build_object('ok', true, 'status', op.status, 'note', 'nothing to process');
  end if;

  for att in
    select a.id from attempts a
    where a.pack_id = op.pack_id and a.is_ranked = true and a.status = 'completed'
      and a.id > coalesce(op.cursor_attempt_id, '00000000-0000-0000-0000-000000000000'::uuid)
    order by a.id limit v_batch
  loop
    v_rows := v_rows + 1; v_last := att.id;
    begin
      r := recalculate_ranked_result(att.id);
      if coalesce((r->>'ok')::boolean, false) then v_done := v_done + 1; else v_fail := v_fail + 1; end if;
    exception when others then
      v_fail := v_fail + 1;
      update admin_content_void_operations set last_error_code = sqlstate where id = p_op_id;
    end;
  end loop;

  update admin_content_void_operations
     set processed_attempt_count = processed_attempt_count + v_done,
         failed_attempt_count = failed_attempt_count + v_fail,
         cursor_attempt_id = coalesce(v_last, cursor_attempt_id)
   where id = p_op_id;

  -- Exhausted the affected set when this batch returned fewer than the cap.
  if v_rows < v_batch then
    update admin_content_void_operations
       set status = (case when failed_attempt_count > 0 then 'partially_failed' else 'completed' end)::void_op_status,
           completed_at = case when failed_attempt_count = 0 then now() else completed_at end
     where id = p_op_id;
  end if;

  select * into op from admin_content_void_operations where id = p_op_id;
  return jsonb_build_object('ok', true, 'status', op.status, 'processed', op.processed_attempt_count,
    'failed', op.failed_attempt_count, 'affected', op.affected_attempt_count, 'more', v_rows = v_batch);
end; $$;

-- ---------------------------------------------------------------------------
-- Start a void: guards → void the slot (no substitution) → create the op row →
-- process the first batch. Idempotent by key. Founder-only; typed confirmation
-- "VOID SLOT"; recent-auth enforced by the caller.
-- ---------------------------------------------------------------------------
create or replace function admin_start_content_void(
  p_incident_id bigint, p_slot_id uuid, p_reason text, p_idempotency_key text,
  p_confirmation text, p_by uuid, p_role text, p_batch int default 200
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  slot daily_pack_slots%rowtype; pk daily_packs%rowtype; inc admin_incidents%rowtype;
  v_existing admin_content_void_operations%rowtype; v_op_id uuid; v_affected int; v_orig int; v_new int;
begin
  if p_role <> 'founder' then return jsonb_build_object('ok', false, 'reason', 'founder_only'); end if;
  if p_confirmation is distinct from 'VOID SLOT' then return jsonb_build_object('ok', false, 'reason', 'bad_confirmation'); end if;
  if coalesce(length(trim(p_reason)),0) = 0 then return jsonb_build_object('ok', false, 'reason', 'reason_required'); end if;

  -- Idempotent replay.
  select * into v_existing from admin_content_void_operations where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('ok', true, 'operation_id', v_existing.id, 'status', v_existing.status, 'idempotent', true); end if;

  select * into inc from admin_incidents where id = p_incident_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'incident_not_found'); end if;
  if inc.status = 'resolved' then return jsonb_build_object('ok', false, 'reason', 'incident_resolved'); end if;

  select * into slot from daily_pack_slots where id = p_slot_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'slot_not_found'); end if;
  if slot.void_status then return jsonb_build_object('ok', false, 'reason', 'already_voided'); end if;
  select * into pk from daily_packs where pack_id = slot.pack_id for update;
  if pk.status not in ('live','archived') then return jsonb_build_object('ok', false, 'reason', 'pack_not_live'); end if;

  -- Denominators (before vs after) and affected count.
  select coalesce(sum(max_score),0) into v_orig from daily_pack_slots where pack_id = slot.pack_id;
  v_new := v_orig - slot.max_score;
  select count(*) into v_affected from attempts where pack_id = slot.pack_id and is_ranked and status = 'completed';

  -- Void the slot — no substitution (enforce_void_no_substitution allows this).
  update daily_pack_slots set void_status = true, void_reason = p_reason, voided_at = now() where id = p_slot_id;

  insert into admin_content_void_operations (incident_id, pack_id, slot_id, puzzle_id, ranked_date, requested_by,
    reason, status, idempotency_key, affected_attempt_count, original_denominator, new_denominator, started_at)
  values (p_incident_id, slot.pack_id, p_slot_id, slot.puzzle_id, pk.pack_date, p_by, p_reason, 'running',
    p_idempotency_key, v_affected, v_orig, v_new, now())
  returning id into v_op_id;

  insert into admin_incident_events (incident_id, admin_user_id, note)
    values (p_incident_id, p_by, format('Void started for slot %s (%s): %s affected attempts.', slot.position, slot.puzzle_id, v_affected));
  perform admin_log(p_by, p_role::admin_role, 'content_void_start', 'daily_pack_slot', p_slot_id::text,
    jsonb_build_object('pack', slot.pack_id, 'incident', p_incident_id, 'affected', v_affected, 'orig_denom', v_orig, 'new_denom', v_new),
    p_reason, p_idempotency_key, null, true, null);

  perform admin_process_void_batch(v_op_id, p_batch);
  select * into v_existing from admin_content_void_operations where id = v_op_id;
  return jsonb_build_object('ok', true, 'operation_id', v_op_id, 'status', v_existing.status,
    'affected', v_affected, 'processed', v_existing.processed_attempt_count, 'new_denominator', v_new);
end; $$;

-- ---------------------------------------------------------------------------
-- Retry / continue a partially_failed or in-progress operation (Founder-only).
-- Reprocesses from the cursor; recalc idempotency makes re-runs drift-free.
-- ---------------------------------------------------------------------------
create or replace function admin_retry_content_void(p_op_id uuid, p_by uuid, p_role text, p_batch int default 200)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare op admin_content_void_operations%rowtype;
begin
  if p_role <> 'founder' then return jsonb_build_object('ok', false, 'reason', 'founder_only'); end if;
  select * into op from admin_content_void_operations where id = p_op_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if op.status = 'completed' then return jsonb_build_object('ok', true, 'status', 'completed', 'note', 'already complete'); end if;

  -- Reprocess from the start (idempotent): reset the cursor + failure tally, keep history.
  update admin_content_void_operations
     set status = 'running', cursor_attempt_id = null, processed_attempt_count = 0, failed_attempt_count = 0,
         retry_count = retry_count + 1, diagnostic_reference = 'retry-' || (retry_count + 1)::text
   where id = p_op_id;
  perform admin_log(p_by, p_role::admin_role, 'content_void_retry', 'void_operation', p_op_id::text,
    jsonb_build_object('retry', op.retry_count + 1), null, null, null, true, null);
  return admin_process_void_batch(p_op_id, p_batch);
end; $$;

-- Continue processing (idempotent) without incrementing retry — for large sets/UI.
create or replace function admin_continue_content_void(p_op_id uuid, p_by uuid, p_role text, p_batch int default 200)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_role <> 'founder' then return jsonb_build_object('ok', false, 'reason', 'founder_only'); end if;
  return admin_process_void_batch(p_op_id, p_batch);
end; $$;

-- Read helper for the progress page (no answers).
create or replace function admin_void_operation(p_op_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(o) from (
    select id, incident_id, pack_id, slot_id, puzzle_id, ranked_date, status::text status, reason,
      affected_attempt_count, processed_attempt_count, failed_attempt_count,
      original_denominator, new_denominator, retry_count, last_error_code, diagnostic_reference,
      started_at, completed_at from admin_content_void_operations where id = p_op_id) o;
$$;

do $$ declare fn text; begin
  foreach fn in array array[
    'admin_process_void_batch(uuid, int)',
    'admin_start_content_void(bigint, uuid, text, text, text, uuid, text, int)',
    'admin_retry_content_void(uuid, uuid, text, int)',
    'admin_continue_content_void(uuid, uuid, text, int)',
    'admin_void_operation(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
