-- BrainBrew — Reserve-based Practice packs (Phase 7B).
--
-- Fresh, unranked Practice Brews built from APPROVED RESERVE puzzles (the ~64
-- approved puzzles never scheduled into a daily pack). A Practice pack is its own
-- immutable, private snapshot — it is NOT a daily_packs row (daily slots carry a
-- GLOBAL unique(puzzle_id); reserve puzzles must be reusable across many practice
-- packs and users). Practice remains server-authoritative and fully isolated from
-- every ranked surface (is_ranked = false; attempt_purpose = 'practice').
--
-- Using a reserve puzzle in practice does NOT schedule it, publish it, retire it,
-- change its approval/validation, or consume a daily-scheduler slot — practice is
-- a separate, read-only selection over approved content.

-- --------------------------------------------------------------------------
-- 1. Practice pack snapshot (private; server-controlled).
-- --------------------------------------------------------------------------

create table practice_packs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  selection_version int not null default 1,
  selection_seed    text not null,        -- audits which selection produced these five
  exclusion_date    date not null          -- the ranked date excluded at selection time
);

create index practice_packs_user_idx on practice_packs (user_id, created_at desc);

create table practice_pack_slots (
  -- A globally-unique slot id so attempt_items.slot_id can reference a practice
  -- slot exactly as it references a daily slot (see the FK relaxation below).
  id               uuid primary key default gen_random_uuid(),
  practice_pack_id uuid not null references practice_packs(id) on delete cascade,
  position         int not null constraint practice_slot_position check (position between 1 and 5),
  category         slot_category not null,
  puzzle_id        text not null references puzzles(puzzle_id),
  engine_id        text not null references puzzle_engines(engine_id),
  max_score        int not null default 20 constraint practice_max_score_positive check (max_score > 0),
  constraint practice_one_slot_per_position unique (practice_pack_id, position),
  constraint practice_no_dup_puzzle unique (practice_pack_id, puzzle_id),
  -- Same fixed rhythm as the ranked daily pack.
  constraint practice_position_category check (
    (position = 1 and category = 'observation') or
    (position = 2 and category = 'pattern') or
    (position = 3 and category = 'logic') or
    (position = 4 and category = 'language-logic') or
    (position = 5 and category = 'attention-speed')
  )
);

create index practice_slots_pack_idx on practice_pack_slots (practice_pack_id);

-- Immutable slot membership once written (a practice pack is a frozen snapshot).
create or replace function practice_slots_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'practice pack slots are immutable';
end;
$$;
create trigger practice_slots_no_update before update or delete on practice_pack_slots
  for each row execute function practice_slots_immutable();

-- Private: RLS on, no policies → anon/authenticated cannot read or write. Access
-- is ONLY through the SECURITY DEFINER functions below (service_role bypasses).
alter table practice_packs enable row level security;
alter table practice_pack_slots enable row level security;
revoke all on practice_packs from anon, authenticated;
revoke all on practice_pack_slots from anon, authenticated;

-- --------------------------------------------------------------------------
-- 2. Bind a practice attempt to its pack. pack_id becomes nullable so a practice
--    attempt references practice_pack_id instead of a daily pack.
-- --------------------------------------------------------------------------

-- attempt_items.slot_id must be able to point at a daily slot OR a practice slot.
-- A FK can only target one table, so we drop the daily-only FK. Integrity is
-- preserved by construction: only the server-authoritative flow (service_role,
-- no client write grant on attempt_items) ever inserts items, and it always
-- resolves the slot id from a real daily_pack_slots or practice_pack_slots row.
alter table attempt_items drop constraint attempt_items_slot_id_fkey;

alter table attempts alter column pack_id drop not null;
alter table attempts add column practice_pack_id uuid references practice_packs(id);
alter table attempts add constraint attempt_has_a_pack check (pack_id is not null or practice_pack_id is not null);
alter table attempts add constraint practice_pack_never_ranked check (practice_pack_id is null or is_ranked = false);

-- One active practice attempt per user (resume, not a second pack).
create unique index attempts_one_active_practice on attempts (user_id)
  where attempt_purpose = 'practice' and status = 'active';
-- Fast active-practice lookup + recent-exposure scan.
create index attempts_practice_pack_idx on attempts (practice_pack_id) where practice_pack_id is not null;

-- --------------------------------------------------------------------------
-- 3. Sanitized public view of a practice pack (answer-free; the SAME render-safe
--    shape get_public_pack serves). puzzles.public_payload never holds answers.
-- --------------------------------------------------------------------------

create or replace function practice_pack_public(p_pack uuid) returns jsonb
language sql security definer set search_path = public, pg_temp stable as $$
  -- The SAME row shape get_public_pack serves, so the flow maps it through the
  -- same render-safe `toPublicPuzzle` (defensive answer-field stripping).
  select coalesce(jsonb_agg(jsonb_build_object(
      'pack_date', '',
      'pack_difficulty', 'standard',
      'position', s.position,
      'category', s.category::text,
      'engine_id', s.engine_id,
      'puzzle_id', s.puzzle_id,
      'difficulty', p.difficulty,
      'prompt', p.prompt,
      'public_payload', p.public_payload,
      'max_score', s.max_score
    ) order by s.position), '[]'::jsonb)
  from practice_pack_slots s
  join puzzles p on p.puzzle_id = s.puzzle_id
  where s.practice_pack_id = p_pack;
$$;

-- --------------------------------------------------------------------------
-- 4. Selection + start. Called by the Edge Function (service_role) which has
--    already verified the JWT and passes the user id. Resumes an active practice
--    attempt; otherwise selects five eligible reserve puzzles (one per category,
--    excluding today's ranked and recent exposure) and creates the pack + attempt.
--
--    Selection is deterministic/auditable via `selection_seed` — no ORDER BY
--    random(): a seeded hash tie-break varies the pick between sessions while the
--    stored seed + slots prove exactly which five were chosen.
-- --------------------------------------------------------------------------

create or replace function start_practice_pack(
  p_user_id uuid,
  p_session_id text,
  p_app_version text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'utc')::date;
  existing_att uuid; existing_pack uuid;
  new_pack uuid; new_att uuid;
  seed text;
  cnt int;
begin
  if p_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  -- Resume: one active practice attempt at a time.
  select id, practice_pack_id into existing_att, existing_pack
    from attempts
   where user_id = p_user_id and attempt_purpose = 'practice' and status = 'active' and practice_pack_id is not null
   order by created_at desc limit 1;
  if existing_att is not null then
    return jsonb_build_object('resumed', true, 'attempt_id', existing_att, 'practice_pack_id', existing_pack,
                              'slots', practice_pack_public(existing_pack));
  end if;

  seed := md5(p_user_id::text || clock_timestamp()::text || random()::text);

  -- Eligible reserve pool → one puzzle per category by the soft ordering.
  create temporary table _sel on commit drop as
  with excluded as (
    select ds.puzzle_id from daily_pack_slots ds
      join daily_packs dp on dp.pack_id = ds.pack_id
     where dp.status = 'live' and dp.pack_date = today
  ),
  recent_packs as (select id from practice_packs where user_id = p_user_id order by created_at desc limit 5),
  recent as (select puzzle_id, engine_id from practice_pack_slots where practice_pack_id in (select id from recent_packs)),
  eligible as (
    -- HARD constraints: approved, validator-passed, active engine, supported
    -- version, category-correct, and NEVER one of today's ranked puzzles. Reserve
    -- membership is a strong SOFT preference (below), not a hard filter — the
    -- current library's reserve has no Observation puzzles, so that one category
    -- falls back to broader approved content that is still never today's ranked.
    select p.puzzle_id, p.engine_id, p.category::text as cat, p.difficulty,
           (not exists (select 1 from daily_pack_slots ds where ds.puzzle_id = p.puzzle_id)) as is_reserve
      from puzzles p
      join puzzle_engines e on e.engine_id = p.engine_id
     where p.status = 'approved'
       and e.active
       and not exists (select 1 from excluded x where x.puzzle_id = p.puzzle_id)              -- never today's ranked
       and exists (select 1 from puzzle_validation_results v where v.puzzle_id = p.puzzle_id and v.passed)
       and (p_app_version is null
            or string_to_array(e.min_app_version, '.')::int[] <= string_to_array(p_app_version, '.')::int[])
  )
  select distinct on (cat) cat, puzzle_id, engine_id, difficulty
    from eligible
   order by cat,
     is_reserve desc,                                     -- soft 0: PREFER reserve content
     (puzzle_id in (select puzzle_id from recent)) asc,   -- soft 1: not recently shown to this user
     (engine_id in (select engine_id from recent)) asc,   -- soft 2: engine rotation
     ('x' || substr(md5(puzzle_id || seed), 1, 8))::bit(32)::int;  -- deterministic seeded tie-break (LRU-ish)

  select count(*) into cnt from _sel;
  if cnt < 5 then
    raise exception 'practice_pool_exhausted' using errcode = 'P0001';
  end if;

  insert into practice_packs (user_id, selection_seed, exclusion_date)
    values (p_user_id, seed, today) returning id into new_pack;

  insert into practice_pack_slots (practice_pack_id, position, category, puzzle_id, engine_id, max_score)
    select new_pack,
      case cat when 'observation' then 1 when 'pattern' then 2 when 'logic' then 3
               when 'language-logic' then 4 when 'attention-speed' then 5 end,
      cat::slot_category, puzzle_id, engine_id, 20
    from _sel;

  insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator)
    values (p_user_id, p_session_id, new_pack, false, 'active', 100) returning id into new_att;

  return jsonb_build_object('resumed', false, 'attempt_id', new_att, 'practice_pack_id', new_pack,
                            'slots', practice_pack_public(new_pack));
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Grants — server (service_role) only; the client goes through the Edge
--    Function, never these functions directly.
-- --------------------------------------------------------------------------

revoke all on function practice_pack_public(uuid) from public, anon, authenticated;
revoke all on function start_practice_pack(uuid, text, text) from public, anon, authenticated;
grant execute on function practice_pack_public(uuid) to service_role;
grant execute on function start_practice_pack(uuid, text, text) to service_role;
