-- BrainBrew — Safe content mutations (Phase 7H.1). Service-role only. Enforces the
-- historical-integrity rules: live/used/historical content is never hard-deleted or
-- content-mutated; retire preserves history and only blocks FUTURE use; delete is
-- allowed ONLY for a never-used draft, with transactional reference checks + a row
-- lock. Audit is written in the SAME transaction. No answer/prompt mutation of
-- immutable content here (versioning is a future workflow).

-- Retire: exclude from future Practice/pack selection; history stays valid.
create or replace function admin_retire_puzzle(p_puzzle_id text, p_reason text, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status text;
begin
  select status::text into v_status from puzzles where puzzle_id = p_puzzle_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status = 'retired' then return jsonb_build_object('ok', false, 'reason', 'already_retired'); end if;
  -- Block if a FUTURE (or undated) non-archived pack still references it — the pack
  -- must be corrected first (never strand a scheduled/future-live pack).
  if exists (
    select 1 from daily_pack_slots ds join daily_packs dp on dp.pack_id = ds.pack_id
    where ds.puzzle_id = p_puzzle_id and dp.status <> 'archived'
      and (dp.pack_date is null or dp.pack_date >= (now() at time zone 'utc')::date)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'referenced_by_future_pack');
  end if;
  update puzzles set status = 'retired', retired_at = now() where puzzle_id = p_puzzle_id;
  perform admin_log(p_by, p_role::admin_role, 'retire_puzzle', 'puzzle', p_puzzle_id,
    jsonb_build_object('from', v_status), p_reason, null, null, true, null);
  return jsonb_build_object('ok', true, 'status', 'retired');
end; $$;
revoke all on function admin_retire_puzzle(text, text, uuid, text) from public, anon, authenticated;
grant execute on function admin_retire_puzzle(text, text, uuid, text) to service_role;

-- Hard-delete: ONLY a never-used, never-approved draft. Transactional reference
-- checks + row lock; audited before the delete (cascades answers + validation).
create or replace function admin_delete_unused_draft(p_puzzle_id text, p_reason text, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status text; v_approved timestamptz;
begin
  select status::text, approved_at into v_status, v_approved from puzzles where puzzle_id = p_puzzle_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status <> 'draft' or v_approved is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_deletable_not_draft');
  end if;
  if exists (select 1 from daily_pack_slots where puzzle_id = p_puzzle_id) then
    return jsonb_build_object('ok', false, 'reason', 'scheduled_or_historical');
  end if;
  if exists (select 1 from practice_pack_slots where puzzle_id = p_puzzle_id) then
    return jsonb_build_object('ok', false, 'reason', 'used_in_practice');
  end if;
  -- Audit first so the record persists regardless of the cascade.
  perform admin_log(p_by, p_role::admin_role, 'delete_unused_draft', 'puzzle', p_puzzle_id,
    jsonb_build_object('status', v_status), p_reason, null, null, true, null);
  delete from puzzles where puzzle_id = p_puzzle_id; -- FK cascade: puzzle_answers, puzzle_validation_results
  return jsonb_build_object('ok', true, 'deleted', true);
end; $$;
revoke all on function admin_delete_unused_draft(text, text, uuid, text) from public, anon, authenticated;
grant execute on function admin_delete_unused_draft(text, text, uuid, text) to service_role;
