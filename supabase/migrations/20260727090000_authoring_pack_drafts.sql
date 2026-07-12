-- BrainBrew — Admin pack authoring drafts + publication (Phase 7I).
--
-- Future daily packs are assembled in a DEDICATED private staging model so no
-- canonical `daily_packs`/`daily_pack_slots` row exists until PUBLICATION. Publish
-- reuses the canonical machinery end to end: slot inserts are gated by
-- `enforce_slot_puzzle_agreement` (only approved puzzles), pack promotion by
-- `enforce_pack_completeness` (exactly five ordered slots), the date by the
-- canonical `publish_pack()` (idempotent, one-pack-per-UTC-date, live-immutable),
-- and the global no-reuse invariant by `daily_pack_slots.puzzle_scheduled_once`.
-- Nothing here re-implements those rules; it only stages + orchestrates them.
--
-- Service-role only (RLS, no policies). The admin server calls these after an
-- in-process capability + recent-auth check.

do $$ begin
  create type pack_draft_status as enum
    ('draft','validation_failed','awaiting_review','changes_requested','approved','scheduled','published','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists authoring_pack_drafts (
  id uuid primary key default gen_random_uuid(),
  intended_date date,                 -- nullable until assigned; UNIQUE among live drafts is enforced at publish
  status pack_draft_status not null default 'draft',
  author_id uuid references auth.users(id),
  reviewer_id uuid references auth.users(id),
  draft_version int not null default 1,
  pack_hash text,                     -- sha256 of the ordered slot puzzles (set at validate)
  constraint_report jsonb not null default '{}'::jsonb,
  difficulty_summary jsonb not null default '{}'::jsonb,
  rotation_summary jsonb not null default '{}'::jsonb,
  repetition_summary jsonb not null default '{}'::jsonb,
  author_notes text,
  reviewer_notes text,
  published_pack_id text references daily_packs(pack_id),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table authoring_pack_drafts enable row level security; -- no policies → service-role only

create table if not exists authoring_pack_draft_slots (
  pack_draft_id uuid not null references authoring_pack_drafts(id) on delete cascade,
  position int not null check (position between 1 and 5),
  category slot_category not null,
  puzzle_id text references puzzles(puzzle_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pack_draft_id, position),
  -- the fixed rhythm — position is welded to its category (mirror of daily_pack_slots)
  constraint pack_draft_position_category check (
    (position = 1 and category = 'observation') or
    (position = 2 and category = 'pattern') or
    (position = 3 and category = 'logic') or
    (position = 4 and category = 'language-logic') or
    (position = 5 and category = 'attention-speed')),
  -- no duplicate puzzle within a draft (NULLs allowed while incomplete)
  constraint pack_draft_unique_puzzle unique (pack_draft_id, puzzle_id)
);
alter table authoring_pack_draft_slots enable row level security;

create index if not exists pack_drafts_status_idx on authoring_pack_drafts (status, updated_at desc);
drop trigger if exists pack_drafts_updated on authoring_pack_drafts;
create trigger pack_drafts_updated before update on authoring_pack_drafts for each row execute function set_updated_at();
drop trigger if exists pack_draft_slots_updated on authoring_pack_draft_slots;
create trigger pack_draft_slots_updated before update on authoring_pack_draft_slots for each row execute function set_updated_at();

-- The fixed category for each slot position.
create or replace function pack_slot_category(p_position int) returns slot_category
language sql immutable set search_path = public, pg_temp as $$
  select (array['observation','pattern','logic','language-logic','attention-speed'])[p_position]::slot_category;
$$;

-- ---------------------------------------------------------------------------
-- Create a blank draft (optionally date-targeted) with five empty slots.
-- ---------------------------------------------------------------------------
create or replace function admin_create_pack_draft(p_intended_date date, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into authoring_pack_drafts (intended_date, author_id) values (p_intended_date, p_by) returning id into v_id;
  insert into authoring_pack_draft_slots (pack_draft_id, position, category)
    select v_id, gs, pack_slot_category(gs) from generate_series(1,5) gs;
  perform admin_log(p_by, p_role::admin_role, 'pack_draft_create', 'pack_draft', v_id::text,
    jsonb_build_object('intended_date', p_intended_date), null, null, null, true, null);
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ---------------------------------------------------------------------------
-- Set (or clear) one slot. Category is derived from the position, so a puzzle can
-- only land in its own category. A change resets any prior review + validation.
-- ---------------------------------------------------------------------------
create or replace function admin_set_pack_slot(p_draft_id uuid, p_position int, p_puzzle_id text, p_expected_version int, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status pack_draft_status; v_version int; v_cat slot_category; v_pcat category; v_pstatus puzzle_status;
begin
  select status, draft_version into v_status, v_version from authoring_pack_drafts where id = p_draft_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status not in ('draft','validation_failed','changes_requested') then
    return jsonb_build_object('ok', false, 'reason', 'not_editable');
  end if;
  if p_expected_version is not null and p_expected_version <> v_version then
    return jsonb_build_object('ok', false, 'reason', 'stale_version', 'current', v_version);
  end if;
  if p_position < 1 or p_position > 5 then return jsonb_build_object('ok', false, 'reason', 'bad_position'); end if;
  v_cat := pack_slot_category(p_position);

  if p_puzzle_id is not null then
    select category, status into v_pcat, v_pstatus from puzzles where puzzle_id = p_puzzle_id;
    if not found then return jsonb_build_object('ok', false, 'reason', 'puzzle_not_found'); end if;
    if v_pcat::text <> v_cat::text then return jsonb_build_object('ok', false, 'reason', 'wrong_category', 'expected', v_cat, 'got', v_pcat); end if;
    if v_pstatus <> 'approved' then return jsonb_build_object('ok', false, 'reason', 'not_approved', 'status', v_pstatus); end if;
    -- Already scheduled into a live/canonical pack? (global no-reuse — hard block.)
    if exists (select 1 from daily_pack_slots where puzzle_id = p_puzzle_id) then
      return jsonb_build_object('ok', false, 'reason', 'already_scheduled');
    end if;
    -- Selected in another position of THIS draft?
    if exists (select 1 from authoring_pack_draft_slots where pack_draft_id = p_draft_id and puzzle_id = p_puzzle_id and position <> p_position) then
      return jsonb_build_object('ok', false, 'reason', 'duplicate_in_pack');
    end if;
  end if;

  update authoring_pack_draft_slots set puzzle_id = p_puzzle_id where pack_draft_id = p_draft_id and position = p_position;
  -- a slot change invalidates any prior review/validation
  update authoring_pack_drafts
     set draft_version = draft_version + 1, status = 'draft', reviewer_id = null, reviewer_notes = null,
         constraint_report = '{}'::jsonb, pack_hash = null
   where id = p_draft_id;
  return jsonb_build_object('ok', true, 'version', v_version + 1);
end; $$;

-- ---------------------------------------------------------------------------
-- Validate a draft: blocking constraints + soft warnings + summaries. Stores the
-- report + pack_hash. Sets status validation_failed on blockers, else 'draft'
-- (ready to submit). Reused by publish for a final transactional recheck.
-- ---------------------------------------------------------------------------
create or replace function pack_draft_report(p_draft_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_blocking text[] := '{}'; v_warnings text[] := '{}';
  v_filled int; v_distinct int; v_intended date;
  v_min int; v_max int; v_avg numeric; v_engines text[]; v_scheduled int; v_hash text;
begin
  select intended_date into v_intended from authoring_pack_drafts where id = p_draft_id;

  select count(puzzle_id), count(distinct puzzle_id) into v_filled, v_distinct
    from authoring_pack_draft_slots where pack_draft_id = p_draft_id;

  if v_filled <> 5 then v_blocking := v_blocking || format('only %s of 5 slots filled', v_filled); end if;
  if v_distinct <> v_filled then v_blocking := v_blocking || 'a puzzle is used in more than one slot'; end if;

  -- Per-slot canonical checks (category / approved / not retired / not scheduled).
  if exists (
    select 1 from authoring_pack_draft_slots s join puzzles p on p.puzzle_id = s.puzzle_id
    where s.pack_draft_id = p_draft_id and p.category::text <> s.category::text) then
    v_blocking := v_blocking || 'a slot puzzle is in the wrong category';
  end if;
  if exists (
    select 1 from authoring_pack_draft_slots s join puzzles p on p.puzzle_id = s.puzzle_id
    where s.pack_draft_id = p_draft_id and p.status <> 'approved') then
    v_blocking := v_blocking || 'a slot puzzle is not approved (or is retired)';
  end if;
  select count(*) into v_scheduled from authoring_pack_draft_slots s
    where s.pack_draft_id = p_draft_id and exists (select 1 from daily_pack_slots d where d.puzzle_id = s.puzzle_id);
  if v_scheduled > 0 then v_blocking := v_blocking || format('%s slot puzzle(s) already scheduled in a live pack', v_scheduled); end if;

  if v_intended is not null then
    if v_intended <= current_date then v_blocking := v_blocking || 'intended date is not in the future'; end if;
    if exists (select 1 from daily_packs where pack_date = v_intended) then v_blocking := v_blocking || 'intended UTC date is already taken'; end if;
  end if;

  -- Summaries + soft warnings (only meaningful once full).
  if v_filled = 5 and v_distinct = 5 then
    select min(p.difficulty), max(p.difficulty), round(avg(p.difficulty),2), array_agg(p.engine_id order by s.position),
           encode(sha256(convert_to(string_agg(p.content_hash, ',' order by s.position), 'UTF8')), 'hex')
      into v_min, v_max, v_avg, v_engines, v_hash
      from authoring_pack_draft_slots s join puzzles p on p.puzzle_id = s.puzzle_id
     where s.pack_draft_id = p_draft_id;

    if v_max - v_min >= 3 then v_warnings := v_warnings || format('wide difficulty spread (%s–%s)', v_min, v_max); end if;
    if (select count(*) - count(distinct e) from unnest(v_engines) e) > 0 then v_warnings := v_warnings || 'an engine repeats within the pack'; end if;

    update authoring_pack_drafts set pack_hash = v_hash,
      difficulty_summary = jsonb_build_object('min', v_min, 'max', v_max, 'avg', v_avg),
      rotation_summary = jsonb_build_object('engines', to_jsonb(v_engines)),
      repetition_summary = jsonb_build_object('already_scheduled', v_scheduled)
     where id = p_draft_id;
  end if;

  return jsonb_build_object(
    'passed', array_length(v_blocking,1) is null,
    'blocking', to_jsonb(v_blocking), 'warnings', to_jsonb(v_warnings),
    'pack_hash', v_hash);
end; $$;

create or replace function admin_validate_pack_draft(p_draft_id uuid, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status pack_draft_status; v_report jsonb;
begin
  select status into v_status from authoring_pack_drafts where id = p_draft_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status not in ('draft','validation_failed','changes_requested') then
    return jsonb_build_object('ok', false, 'reason', 'not_editable');
  end if;
  v_report := pack_draft_report(p_draft_id);
  update authoring_pack_drafts
     set constraint_report = v_report,
         status = (case when (v_report->>'passed')::boolean then 'draft' else 'validation_failed' end)::pack_draft_status
   where id = p_draft_id;
  perform admin_log(p_by, p_role::admin_role, 'pack_validate', 'pack_draft', p_draft_id::text, v_report, null, null, null, true, null);
  return jsonb_build_object('ok', true, 'report', v_report);
end; $$;

-- ---------------------------------------------------------------------------
-- Submit for review — requires a passing validation.
-- ---------------------------------------------------------------------------
create or replace function admin_submit_pack_review(p_draft_id uuid, p_notes text, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status pack_draft_status; v_report jsonb;
begin
  select status into v_status from authoring_pack_drafts where id = p_draft_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status not in ('draft','changes_requested') then return jsonb_build_object('ok', false, 'reason', 'bad_state'); end if;
  v_report := pack_draft_report(p_draft_id);
  if not (v_report->>'passed')::boolean then
    update authoring_pack_drafts set status = 'validation_failed', constraint_report = v_report where id = p_draft_id;
    return jsonb_build_object('ok', false, 'reason', 'validation_failed', 'report', v_report);
  end if;
  update authoring_pack_drafts set status = 'awaiting_review', author_notes = p_notes, constraint_report = v_report where id = p_draft_id;
  perform admin_log(p_by, p_role::admin_role, 'pack_submit_review', 'pack_draft', p_draft_id::text, jsonb_build_object('notes', p_notes), null, null, null, true, null);
  return jsonb_build_object('ok', true);
end; $$;

-- ---------------------------------------------------------------------------
-- Review decision — two-person control (author cannot approve own, unless a
-- Founder emergency with reason + audit). Approve requires a fresh passing report.
-- ---------------------------------------------------------------------------
create or replace function admin_decide_pack_review(p_draft_id uuid, p_decision text, p_by uuid, p_role text, p_reason text, p_emergency boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status pack_draft_status; v_author uuid; v_report jsonb; v_ref text;
begin
  select status, author_id into v_status, v_author from authoring_pack_drafts where id = p_draft_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status <> 'awaiting_review' then return jsonb_build_object('ok', false, 'reason', 'bad_state'); end if;
  if p_decision not in ('approve','reject','request_changes') then return jsonb_build_object('ok', false, 'reason', 'bad_decision'); end if;

  if p_decision = 'approve' then
    if p_by = v_author then
      if not (p_emergency and p_role = 'founder' and coalesce(length(trim(p_reason)),0) > 0) then
        return jsonb_build_object('ok', false, 'reason', 'self_approval_blocked');
      end if;
      v_ref := 'emergency:' || p_by::text; -- single-person emergency approval marker
    end if;
    v_report := pack_draft_report(p_draft_id);
    if not (v_report->>'passed')::boolean then
      return jsonb_build_object('ok', false, 'reason', 'validation_failed', 'report', v_report);
    end if;
    update authoring_pack_drafts set status = 'approved', reviewer_id = p_by, reviewer_notes = p_reason, constraint_report = v_report where id = p_draft_id;
  elsif p_decision = 'reject' then
    update authoring_pack_drafts set status = 'cancelled', reviewer_id = p_by, reviewer_notes = p_reason where id = p_draft_id;
  else
    update authoring_pack_drafts set status = 'changes_requested', reviewer_id = p_by, reviewer_notes = p_reason where id = p_draft_id;
  end if;

  perform admin_log(p_by, p_role::admin_role, 'pack_review_' || p_decision, 'pack_draft', p_draft_id::text,
    jsonb_build_object('emergency', coalesce(p_emergency,false)), p_reason, null, null, true, v_ref);
  return jsonb_build_object('ok', true, 'emergency', coalesce(p_emergency,false) and v_ref is not null);
end; $$;

-- ---------------------------------------------------------------------------
-- Publish an approved draft to a future UTC date — ATOMIC + IDEMPOTENT.
-- Creates the canonical pack + slots (triggers enforce approved puzzles, category
-- order, completeness), then the canonical publish_pack() makes it live + immutable
-- on the date. A repeat call with the same idempotency key returns the same pack.
-- ---------------------------------------------------------------------------
create or replace function admin_publish_pack(p_draft_id uuid, p_intended_date date, p_expected_version int, p_by uuid, p_role text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status pack_draft_status; v_version int; v_prev_pack text; v_prev_key text;
  v_report jsonb; v_pack_id text; v_index int; v_hash text; v_avg numeric; v_label text;
begin
  select status, draft_version, published_pack_id, idempotency_key
    into v_status, v_version, v_prev_pack, v_prev_key
    from authoring_pack_drafts where id = p_draft_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- Idempotency: already published under this key → return the same pack.
  if v_status = 'published' and v_prev_pack is not null and v_prev_key is not distinct from p_idempotency_key then
    return jsonb_build_object('ok', true, 'pack_id', v_prev_pack, 'idempotent', true);
  end if;
  if v_status <> 'approved' then return jsonb_build_object('ok', false, 'reason', 'not_approved', 'status', v_status); end if;
  if p_expected_version is not null and p_expected_version <> v_version then
    return jsonb_build_object('ok', false, 'reason', 'stale_version', 'current', v_version);
  end if;
  if p_intended_date is null or p_intended_date <= current_date then return jsonb_build_object('ok', false, 'reason', 'date_not_future'); end if;
  if exists (select 1 from daily_packs where pack_date = p_intended_date) then return jsonb_build_object('ok', false, 'reason', 'date_taken'); end if;

  -- Final transactional recheck of every slot.
  v_report := pack_draft_report(p_draft_id);
  if not (v_report->>'passed')::boolean then return jsonb_build_object('ok', false, 'reason', 'validation_failed', 'report', v_report); end if;

  select round(avg(p.difficulty),2),
         encode(sha256(convert_to(string_agg(p.content_hash, ',' order by s.position), 'UTF8')), 'hex')
    into v_avg, v_hash
    from authoring_pack_draft_slots s join puzzles p on p.puzzle_id = s.puzzle_id where s.pack_draft_id = p_draft_id;
  v_label := case when v_avg < 2.5 then 'easier' when v_avg > 3.5 then 'harder' else 'standard' end;
  v_pack_id := 'apack-' || substring(p_draft_id::text from 1 for 8);
  select coalesce(max(pack_index),0) + 1 into v_index from daily_packs;

  -- Create the canonical pack as a draft, add slots (agreement trigger), then
  -- promote to approved (completeness trigger), then publish to the date.
  insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label)
    values (v_pack_id, v_index, 'draft', v_hash, v_label);
  insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id)
    select v_pack_id, s.position, s.category, s.puzzle_id, p.engine_id
      from authoring_pack_draft_slots s join puzzles p on p.puzzle_id = s.puzzle_id
     where s.pack_draft_id = p_draft_id order by s.position;
  update daily_packs set status = 'approved' where pack_id = v_pack_id;
  perform publish_pack(v_pack_id, p_intended_date);

  update authoring_pack_drafts
     set status = 'published', published_pack_id = v_pack_id, idempotency_key = p_idempotency_key, intended_date = p_intended_date
   where id = p_draft_id;

  perform admin_log(p_by, p_role::admin_role, 'pack_publish', 'daily_pack', v_pack_id,
    jsonb_build_object('draft_id', p_draft_id, 'date', p_intended_date, 'pack_hash', v_hash), null, p_idempotency_key, null, true, null);
  return jsonb_build_object('ok', true, 'pack_id', v_pack_id, 'pack_hash', v_hash);
end; $$;

-- ---------------------------------------------------------------------------
-- Cancel an unpublished draft (history preserved; no canonical rows touched).
-- ---------------------------------------------------------------------------
create or replace function admin_cancel_pack_draft(p_draft_id uuid, p_reason text, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status pack_draft_status;
begin
  select status into v_status from authoring_pack_drafts where id = p_draft_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status = 'published' then return jsonb_build_object('ok', false, 'reason', 'already_published'); end if;
  update authoring_pack_drafts set status = 'cancelled', reviewer_notes = coalesce(reviewer_notes, p_reason) where id = p_draft_id;
  perform admin_log(p_by, p_role::admin_role, 'pack_cancel', 'pack_draft', p_draft_id::text, jsonb_build_object('from', v_status), p_reason, null, null, true, null);
  return jsonb_build_object('ok', true);
end; $$;

-- ---------------------------------------------------------------------------
-- Read helpers — the queue + the eligible-puzzle selector (paginated, no answers).
-- ---------------------------------------------------------------------------
create or replace function admin_pack_queue(p_status text, p_limit int, p_offset int)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'total', (select count(*) from authoring_pack_drafts d where p_status is null or d.status::text = p_status),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'status', d.status, 'intended_date', d.intended_date, 'version', d.draft_version,
        'author', d.author_id, 'reviewer', d.reviewer_id, 'pack_hash', d.pack_hash,
        'filled', (select count(puzzle_id) from authoring_pack_draft_slots s where s.pack_draft_id = d.id),
        'updated_at', d.updated_at) order by d.updated_at desc)
      from (select * from authoring_pack_drafts d where p_status is null or d.status::text = p_status
            order by updated_at desc limit least(coalesce(p_limit,25), 100) offset greatest(coalesce(p_offset,0),0)) d
    ), '[]'::jsonb));
$$;

create or replace function admin_pack_eligible_puzzles(p_category text, p_limit int, p_offset int)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'total', (select count(*) from puzzles p where p.category::text = p_category and p.status = 'approved'
              and not exists (select 1 from daily_pack_slots d where d.puzzle_id = p.puzzle_id)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('puzzle_id', p.puzzle_id, 'engine_id', p.engine_id, 'difficulty', p.difficulty) order by p.puzzle_id)
      from (select * from puzzles p where p.category::text = p_category and p.status = 'approved'
            and not exists (select 1 from daily_pack_slots d where d.puzzle_id = p.puzzle_id)
            order by puzzle_id limit least(coalesce(p_limit,25), 100) offset greatest(coalesce(p_offset,0),0)) p
    ), '[]'::jsonb));
$$;

-- Service-role only — the admin server calls after an in-process capability check.
do $$ declare fn text; begin
  foreach fn in array array[
    'admin_create_pack_draft(date, uuid, text)',
    'admin_set_pack_slot(uuid, int, text, int, uuid)',
    'admin_validate_pack_draft(uuid, uuid, text)',
    'pack_draft_report(uuid)',
    'admin_submit_pack_review(uuid, text, uuid, text)',
    'admin_decide_pack_review(uuid, text, uuid, text, text, boolean)',
    'admin_publish_pack(uuid, date, int, uuid, text, text)',
    'admin_cancel_pack_draft(uuid, text, uuid, text)',
    'admin_pack_queue(text, int, int)',
    'admin_pack_eligible_puzzles(text, int, int)',
    'pack_slot_category(int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
