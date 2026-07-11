-- BrainBrew — server-authoritative attempts (Phase 4B, Task 7).
--
-- The minimum model for secure gameplay: an attempt at a pack, and one item per
-- opened slot. Only the Edge Functions (secret key) write here — anon has no
-- access via the Data API. All timing is server-set; the client-reported
-- elapsed time is never authoritative.
--
-- Ranked play does NOT exist yet: is_ranked is always false this phase. The
-- schema is shaped so ranked, void-and-rescale, and accounts can be added later
-- without replacement.

create type attempt_status as enum ('active', 'completed', 'expired', 'invalidated');
create type item_status    as enum ('opened', 'submitted', 'voided');
create type answer_verdict as enum ('correct', 'partial', 'incorrect');

-- --------------------------------------------------------------------------
-- attempts
-- --------------------------------------------------------------------------

create table attempts (
  id            uuid primary key default gen_random_uuid(),
  -- An opaque, server-issued session id groups a device's attempts before
  -- accounts exist. It is NOT proof of identity on its own — the signed attempt
  -- token is (Task 10). `user_id` is reserved for when Auth arrives.
  session_id    text not null constraint session_present check (length(session_id) >= 16),
  user_id       uuid,
  pack_id       text not null references daily_packs(pack_id),
  status        attempt_status not null default 'active',
  started_at    timestamptz not null default now(),   -- server-set
  completed_at  timestamptz,
  final_score   int constraint final_score_range check (final_score between 0 and 100),
  is_ranked     boolean not null default false,
  cheat_flags   jsonb not null default '[]'::jsonb,
  app_version   text,
  created_at    timestamptz not null default now(),

  -- A completed attempt has a score and a completion time; an active one has neither.
  constraint completed_has_score check (status <> 'completed' or (final_score is not null and completed_at is not null)),
  -- This phase never marks an attempt ranked.
  constraint not_ranked_yet check (is_ranked = false)
);

create index attempts_session_idx on attempts(session_id);
create index attempts_pack_idx on attempts(pack_id);

-- --------------------------------------------------------------------------
-- attempt_items — one per opened slot
-- --------------------------------------------------------------------------

create table attempt_items (
  id             uuid primary key default gen_random_uuid(),
  attempt_id     uuid not null references attempts(id) on delete cascade,
  slot_id        uuid not null references daily_pack_slots(id),
  position       int not null constraint item_position_range check (position between 1 and 5),
  opened_at      timestamptz not null default now(),   -- server-set
  submitted_at   timestamptz,                          -- server-set on submit
  answer_payload jsonb,                                -- the SUBMITTED answer (never the correct one)
  awarded_score  int constraint awarded_range check (awarded_score between 0 and 20),
  verdict        answer_verdict,
  result_payload jsonb,                                -- verdict + points + explanation, returned post-submit
  status         item_status not null default 'opened',
  created_at     timestamptz not null default now(),

  -- One item per slot per attempt — prevents a second submission for a slot.
  constraint one_item_per_slot unique (attempt_id, slot_id),
  -- A submitted item carries its full scoring record; an opened one does not.
  constraint submitted_is_scored check (
    status <> 'submitted' or (submitted_at is not null and answer_payload is not null
      and awarded_score is not null and verdict is not null)
  )
);

create index items_attempt_idx on attempt_items(attempt_id);

-- --------------------------------------------------------------------------
-- A voided slot can never be opened for an attempt (Core Spec §10).
-- --------------------------------------------------------------------------

create or replace function enforce_item_slot_not_void() returns trigger
language plpgsql as $$
declare slot_void boolean;
begin
  select void_status into slot_void from daily_pack_slots where id = new.slot_id;
  if slot_void then
    raise exception 'slot % is voided and cannot be opened for an attempt', new.slot_id;
  end if;
  return new;
end;
$$;

create trigger item_slot_not_void
  before insert on attempt_items
  for each row execute function enforce_item_slot_not_void();

-- --------------------------------------------------------------------------
-- A submitted item is terminal: its answer, score and verdict cannot change,
-- and it cannot revert to opened. Prevents duplicate/altered scoring.
-- --------------------------------------------------------------------------

create or replace function enforce_item_immutable_once_submitted() returns trigger
language plpgsql as $$
begin
  if old.status = 'submitted' and new.status = 'submitted' then
    if new.answer_payload is distinct from old.answer_payload
       or new.awarded_score is distinct from old.awarded_score
       or new.verdict is distinct from old.verdict
       or new.submitted_at is distinct from old.submitted_at then
      raise exception 'attempt item % is already submitted and is immutable', old.id;
    end if;
  end if;
  if old.status = 'submitted' and new.status = 'opened' then
    raise exception 'attempt item % cannot revert to opened', old.id;
  end if;
  return new;
end;
$$;

create trigger item_immutable_once_submitted
  before update on attempt_items
  for each row execute function enforce_item_immutable_once_submitted();

-- --------------------------------------------------------------------------
-- A completed attempt is terminal: no new items, no score change.
-- --------------------------------------------------------------------------

create or replace function enforce_attempt_terminal() returns trigger
language plpgsql as $$
declare att_status attempt_status;
begin
  if tg_table_name = 'attempt_items' and tg_op = 'INSERT' then
    select status into att_status from attempts where id = new.attempt_id;
    if att_status <> 'active' then
      raise exception 'attempt % is %; no further items may be opened', new.attempt_id, att_status;
    end if;
  elsif tg_table_name = 'attempts' and tg_op = 'UPDATE' then
    if old.status = 'completed' and new.status <> 'completed' then
      raise exception 'attempt % is completed and cannot be reopened', old.id;
    end if;
    if old.status = 'completed' and new.final_score is distinct from old.final_score then
      raise exception 'attempt % is completed; its score is final', old.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger attempt_no_items_when_terminal
  before insert on attempt_items
  for each row execute function enforce_attempt_terminal();

create trigger attempt_completion_terminal
  before update on attempts
  for each row execute function enforce_attempt_terminal();

-- --------------------------------------------------------------------------
-- RLS: attempts are function-only. The client never touches them directly.
-- --------------------------------------------------------------------------

alter table attempts      enable row level security;
alter table attempt_items enable row level security;

revoke all on attempts, attempt_items from anon, authenticated;
grant all on attempts, attempt_items to service_role;
