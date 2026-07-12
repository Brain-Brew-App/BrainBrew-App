-- BrainBrew — Admin authoring drafts + review state machine (Phase 7H.2).
--
-- Drafts live in a DEDICATED private table so unapproved candidates NEVER pollute
-- canonical `puzzles`/`puzzle_seeds`. The canonical builder + independent validator
-- run server-side in the admin (reusing src/content/*, no duplication); this table
-- persists the seed, built payload, validation result, and review state. A draft
-- only becomes canonical content when PROMOTED to reserve — which inserts real
-- `puzzles` + `puzzle_answers` + `puzzle_validation_results` rows, passing the
-- existing approval trigger (validation + answer required). Service-role only; the
-- admin server calls these after an in-process capability check.

do $$ begin
  create type authoring_status as enum
    ('draft','built','validation_failed','awaiting_review','changes_requested','approved','rejected','promoted');
exception when duplicate_object then null; end $$;

create table if not exists authoring_drafts (
  id uuid primary key default gen_random_uuid(),
  engine_id text not null references puzzle_engines(engine_id),
  category text not null,
  difficulty int not null check (difficulty between 1 and 5),
  seed jsonb not null,
  built_payload jsonb,          -- canonical builder output (render-safe)
  answer_payload jsonb,         -- private; only revealed to authorized roles
  explanation text,
  content_hash text,            -- canonical hash of the built candidate
  proposed_puzzle_id text,      -- the stable id this draft will become on promote
  parent_puzzle_id text references puzzles(puzzle_id), -- set for a REVISION of immutable content
  status authoring_status not null default 'draft',
  validation jsonb not null default '{}'::jsonb, -- { passed, findings[] }
  draft_version int not null default 1,
  author uuid references auth.users(id),
  reviewer uuid references auth.users(id),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table authoring_drafts enable row level security; -- no policies → service-role only
create index if not exists authoring_drafts_status_idx on authoring_drafts (status, updated_at desc);
drop trigger if exists authoring_drafts_updated on authoring_drafts;
create trigger authoring_drafts_updated before update on authoring_drafts
  for each row execute function set_updated_at();

-- Persist a built + validated candidate (called after the server ran the canonical
-- builder + validator). Editing a draft's seed/build resets its review state.
create or replace function admin_save_draft(p_id uuid, p_fields jsonb, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := p_id; v_passed boolean := coalesce((p_fields->'validation'->>'passed')::boolean, false);
begin
  if v_id is null then
    insert into authoring_drafts (engine_id, category, difficulty, seed, built_payload, answer_payload,
      explanation, content_hash, proposed_puzzle_id, parent_puzzle_id, status, validation, author)
    values (p_fields->>'engine_id', p_fields->>'category', (p_fields->>'difficulty')::int,
      coalesce(p_fields->'seed','{}'::jsonb), p_fields->'built_payload', p_fields->'answer_payload',
      p_fields->>'explanation', p_fields->>'content_hash', p_fields->>'proposed_puzzle_id',
      p_fields->>'parent_puzzle_id',
      case when v_passed then 'built' else 'validation_failed' end::authoring_status,
      coalesce(p_fields->'validation','{}'::jsonb), p_by)
    returning id into v_id;
  else
    update authoring_drafts set
      seed = coalesce(p_fields->'seed', seed),
      built_payload = p_fields->'built_payload', answer_payload = p_fields->'answer_payload',
      explanation = p_fields->>'explanation', content_hash = p_fields->>'content_hash',
      difficulty = coalesce((p_fields->>'difficulty')::int, difficulty),
      validation = coalesce(p_fields->'validation', validation),
      -- a rebuild ALWAYS resets an in-review draft back to built/validation_failed
      status = case when v_passed then 'built' else 'validation_failed' end::authoring_status,
      draft_version = draft_version + 1, reviewer = null, review_notes = null
    where id = v_id and status in ('draft','built','validation_failed','changes_requested','awaiting_review');
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_editable'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
revoke all on function admin_save_draft(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function admin_save_draft(uuid, jsonb, uuid) to service_role;

-- Submit for review — requires a passing validation.
create or replace function admin_submit_draft_review(p_id uuid, p_notes text, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status authoring_status; v_passed boolean;
begin
  select status, (validation->>'passed')::boolean into v_status, v_passed from authoring_drafts where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_status not in ('built','changes_requested') then return jsonb_build_object('ok', false, 'reason', 'bad_state'); end if;
  if not coalesce(v_passed, false) then return jsonb_build_object('ok', false, 'reason', 'validation_not_passed'); end if;
  update authoring_drafts set status = 'awaiting_review', review_notes = p_notes where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function admin_submit_draft_review(uuid, text, uuid) from public, anon, authenticated;
grant execute on function admin_submit_draft_review(uuid, text, uuid) to service_role;

-- Review decision. Two-person control: the reviewer may NOT be the author unless
-- it is an explicit Founder emergency (recorded). A failed validation can never
-- be approved.
create or replace function admin_decide_draft_review(
  p_id uuid, p_decision text, p_by uuid, p_role text, p_reason text, p_emergency boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d authoring_drafts%rowtype;
begin
  select * into d from authoring_drafts where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if d.status <> 'awaiting_review' then return jsonb_build_object('ok', false, 'reason', 'not_in_review'); end if;
  if p_decision not in ('approve','reject','request_changes') then return jsonb_build_object('ok', false, 'reason', 'bad_decision'); end if;

  if p_decision = 'approve' then
    if not coalesce((d.validation->>'passed')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', 'validation_not_passed');
    end if;
    -- Two-person control: author cannot approve own candidate (Founder emergency excepted, audited).
    if d.author = p_by and not (p_role = 'founder' and p_emergency and p_reason is not null) then
      return jsonb_build_object('ok', false, 'reason', 'self_approval_blocked');
    end if;
    update authoring_drafts set status = 'approved', reviewer = p_by, review_notes = coalesce(p_reason, review_notes) where id = p_id;
  elsif p_decision = 'reject' then
    update authoring_drafts set status = 'rejected', reviewer = p_by, review_notes = p_reason where id = p_id;
  else
    update authoring_drafts set status = 'changes_requested', reviewer = p_by, review_notes = p_reason where id = p_id;
  end if;

  perform admin_log(p_by, p_role::admin_role, 'review_' || p_decision, 'authoring_draft', p_id::text,
    jsonb_build_object('emergency', p_emergency), p_reason, null, null, true, null);
  return jsonb_build_object('ok', true, 'decision', p_decision);
end; $$;
revoke all on function admin_decide_draft_review(uuid, text, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function admin_decide_draft_review(uuid, text, uuid, text, text, boolean) to service_role;

-- Promote an APPROVED draft into canonical RESERVE content: insert the puzzle,
-- its answer, and a passing validation result atomically (passing the approval
-- trigger), then mark the draft promoted. Reserve = approved & not scheduled.
create or replace function admin_promote_draft_to_reserve(p_id uuid, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d authoring_drafts%rowtype; v_pid text; v_seed_id text;
begin
  select * into d from authoring_drafts where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if d.status <> 'approved' then return jsonb_build_object('ok', false, 'reason', 'not_approved'); end if;
  if not coalesce((d.validation->>'passed')::boolean, false) then return jsonb_build_object('ok', false, 'reason', 'validation_not_passed'); end if;
  v_pid := coalesce(d.proposed_puzzle_id, 'auth_' || replace(d.id::text, '-', ''));
  if exists (select 1 from puzzles where puzzle_id = v_pid) then return jsonb_build_object('ok', false, 'reason', 'id_exists'); end if;

  -- Minimal authoring seed row (source_type human) so the puzzle FK is satisfied.
  v_seed_id := 'seed_' || replace(d.id::text, '-', '');
  insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash)
    values (v_seed_id, d.engine_id, d.seed, d.difficulty, 'human', d.content_hash)
    on conflict (seed_id) do nothing;

  insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload,
    builder_version, validator_version, content_hash, status)
  values (v_pid, d.engine_id, v_seed_id, d.category::category, d.difficulty,
    coalesce(d.built_payload->>'prompt',''), coalesce(d.built_payload,'{}'::jsonb),
    coalesce(d.built_payload->>'builder_version','admin'), coalesce(d.built_payload->>'validator_version','admin'),
    d.content_hash, 'draft'); -- start draft, then attach evidence, then approve

  insert into puzzle_answers (puzzle_id, answer_payload, explanation)
    values (v_pid, coalesce(d.answer_payload,'{}'::jsonb), d.explanation);
  insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source)
    values (v_pid, coalesce(d.built_payload->>'validator_version','admin'), true, '[]'::jsonb, d.content_hash, 'admin_authoring');

  update puzzles set status = 'approved', approved_at = now() where puzzle_id = v_pid; -- trigger checks evidence
  update authoring_drafts set status = 'promoted' where id = p_id;

  perform admin_log(p_by, p_role::admin_role, 'promote_to_reserve', 'puzzle', v_pid,
    jsonb_build_object('draft', p_id), 'promote approved draft', null, null, true, null);
  return jsonb_build_object('ok', true, 'puzzle_id', v_pid);
end; $$;
revoke all on function admin_promote_draft_to_reserve(uuid, uuid, text) from public, anon, authenticated;
grant execute on function admin_promote_draft_to_reserve(uuid, uuid, text) to service_role;

-- Paginated draft queue for the review UI.
create or replace function admin_authoring_queue(p_status text default null, p_limit int default 25, p_offset int default 0)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with lim as (select least(greatest(coalesce(p_limit,25),1),100) l, greatest(coalesce(p_offset,0),0) o)
  select jsonb_build_object(
    'total', (select count(*) from authoring_drafts where (p_status is null or status::text = p_status)),
    'rows', coalesce((select jsonb_agg(row_to_json(t)) from (
      select id, engine_id, category, difficulty, status::text status, draft_version,
        (validation->>'passed')::boolean validated, author, reviewer, updated_at
      from authoring_drafts where (p_status is null or status::text = p_status)
      order by updated_at desc limit (select l from lim) offset (select o from lim)) t), '[]'::jsonb));
$$;
revoke all on function admin_authoring_queue(text, int, int) from public, anon, authenticated;
grant execute on function admin_authoring_queue(text, int, int) to service_role;
