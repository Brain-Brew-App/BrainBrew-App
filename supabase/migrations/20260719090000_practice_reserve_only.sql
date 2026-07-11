-- BrainBrew — Practice selection is now RESERVE-ONLY (Phase 7C).
--
-- Phase 7B allowed a soft fallback to broader approved content because the
-- library's reserve had no Observation puzzles. Phase 7C added approved
-- Observation reserve, so every category now has enough reserve — selection
-- becomes reserve-only (a HARD `not in any daily_pack_slot` filter). A category
-- without enough eligible reserve now fails with `practice_pool_exhausted` (never
-- a silent fall-through to scheduled/daily content). The soft ordering
-- (recent-exposure avoidance → engine rotation → seeded tie-break) is unchanged.

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

  select id, practice_pack_id into existing_att, existing_pack
    from attempts
   where user_id = p_user_id and attempt_purpose = 'practice' and status = 'active' and practice_pack_id is not null
   order by created_at desc limit 1;
  if existing_att is not null then
    return jsonb_build_object('resumed', true, 'attempt_id', existing_att, 'practice_pack_id', existing_pack,
                              'slots', practice_pack_public(existing_pack));
  end if;

  seed := md5(p_user_id::text || clock_timestamp()::text || random()::text);

  insert into practice_packs (user_id, selection_seed, exclusion_date)
    values (p_user_id, seed, today) returning id into new_pack;

  with excluded as (
    select ds.puzzle_id from daily_pack_slots ds
      join daily_packs dp on dp.pack_id = ds.pack_id
     where dp.status = 'live' and dp.pack_date = today
  ),
  recent_packs as (select id from practice_packs where user_id = p_user_id and id <> new_pack order by created_at desc limit 5),
  recent as (select puzzle_id, engine_id from practice_pack_slots where practice_pack_id in (select id from recent_packs)),
  eligible as (
    -- Hard constraints: approved, validator-passed, active engine, supported
    -- version, category-correct, RESERVE (never scheduled into any daily pack),
    -- and never today's ranked pack (redundant with reserve, kept as defence).
    select p.puzzle_id, p.engine_id, p.category::text as cat
      from puzzles p
      join puzzle_engines e on e.engine_id = p.engine_id
     where p.status = 'approved'
       and e.active
       and not exists (select 1 from daily_pack_slots ds where ds.puzzle_id = p.puzzle_id)   -- RESERVE only
       and not exists (select 1 from excluded x where x.puzzle_id = p.puzzle_id)
       and exists (select 1 from puzzle_validation_results v where v.puzzle_id = p.puzzle_id and v.passed)
       and (p_app_version is null
            or string_to_array(e.min_app_version, '.')::int[] <= string_to_array(p_app_version, '.')::int[])
  ),
  picked as (
    select distinct on (cat) cat, puzzle_id, engine_id
      from eligible
     order by cat,
       (puzzle_id in (select puzzle_id from recent)) asc,   -- not recently shown to this user
       (engine_id in (select engine_id from recent)) asc,   -- engine rotation
       ('x' || substr(md5(puzzle_id || seed), 1, 8))::bit(32)::int
  )
  insert into practice_pack_slots (practice_pack_id, position, category, puzzle_id, engine_id, max_score)
  select new_pack,
    case cat when 'observation' then 1 when 'pattern' then 2 when 'logic' then 3
             when 'language-logic' then 4 when 'attention-speed' then 5 end,
    cat::slot_category, puzzle_id, engine_id, 20
  from picked;

  get diagnostics cnt = row_count;
  if cnt < 5 then
    raise exception 'practice_pool_exhausted' using errcode = 'P0001';
  end if;

  insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator)
    values (p_user_id, p_session_id, new_pack, false, 'active', 100) returning id into new_att;

  return jsonb_build_object('resumed', false, 'attempt_id', new_att, 'practice_pack_id', new_pack,
                            'slots', practice_pack_public(new_pack));
end;
$$;

revoke all on function start_practice_pack(uuid, text, text) from public, anon, authenticated;
grant execute on function start_practice_pack(uuid, text, text) to service_role;
