-- BrainBrew — Personal Practice Summary & history (Phase 7C).
--
-- A PRIVATE, per-player Practice summary + history, derived on demand from
-- practice attempts (no counter table) — mirroring the pure-derivation model of
-- ranked progress (6D). It is kept COMPLETELY separate from ranked stats: it reads
-- only attempts with attempt_purpose='practice' and never touches leaderboards,
-- streaks, ranked history, or ranked statistics. Solve time is computed straight
-- from attempt_items (the ranked solve-time trigger can't join practice slots, so
-- practice rows carry total_solve_ms=0 — irrelevant here).
--
-- Practice is available to any authenticated user (permanent OR anonymous), so
-- these are gated to `authenticated`, auth.uid()-scoped, with no user parameter.

-- Partial index for the per-user newest-first practice scan.
create index if not exists attempts_practice_completed_idx on attempts (user_id, completed_at desc)
  where attempt_purpose = 'practice' and status = 'completed';

-- --------------------------------------------------------------------------
-- get_my_practice_summary — brews/puzzles, avg/best/latest score, avg solve
-- time, and per-category practice performance. Never any ranked field.
-- --------------------------------------------------------------------------

create or replace function get_my_practice_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  brews int; total_puz int; avg_score numeric; best_score int; latest_score int;
  avg_solve numeric; cats jsonb; most_cat text;
begin
  if uid is null then return jsonb_build_object('locked', true); end if;

  with pa as (
    select a.id, a.final_score, a.completed_at,
      (select coalesce(sum(extract(epoch from (i.submitted_at - i.opened_at)) * 1000), 0)::bigint
         from attempt_items i where i.attempt_id = a.id and i.status = 'submitted') as solve_ms
    from attempts a
    where a.user_id = uid and a.attempt_purpose = 'practice' and a.status = 'completed'
  )
  select count(*)::int,
         (select round(avg(final_score), 1) from pa),
         (select max(final_score) from pa),
         (select final_score from pa order by completed_at desc limit 1),
         (select round(avg(solve_ms)) from pa)
    into brews, avg_score, best_score, latest_score, avg_solve
  from pa;

  select coalesce(sum(cnt), 0)::int into total_puz from (
    select count(*) cnt from attempt_items i
      join attempts a on a.id = i.attempt_id
     where a.user_id = uid and a.attempt_purpose = 'practice' and a.status = 'completed' and i.status = 'submitted'
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
      'category', category, 'average_points', avg_pts, 'best_points', best_pts, 'plays', plays
    ) order by category), '[]'::jsonb), (
      select s2.category::text from attempt_items i2
        join attempts a2 on a2.id = i2.attempt_id
        join practice_pack_slots s2 on s2.id = i2.slot_id
       where a2.user_id = uid and a2.attempt_purpose = 'practice' and a2.status = 'completed' and i2.status = 'submitted'
       group by s2.category order by count(*) desc, s2.category limit 1
    )
    into cats, most_cat
  from (
    select s.category::text as category, round(avg(i.awarded_score), 1) avg_pts, max(i.awarded_score) best_pts, count(*)::int plays
      from attempt_items i
      join attempts a on a.id = i.attempt_id
      join practice_pack_slots s on s.id = i.slot_id
     where a.user_id = uid and a.attempt_purpose = 'practice' and a.status = 'completed' and i.status = 'submitted'
     group by s.category
  ) c;

  return jsonb_build_object(
    'locked', false,
    'statistics_version', 1,
    'practice_brews_completed', coalesce(brews, 0),
    'total_practice_puzzles', coalesce(total_puz, 0),
    'average_score', avg_score,
    'best_score', best_score,
    'latest_score', latest_score,
    'average_solve_ms', avg_solve,
    'categories', cats,
    'most_practiced_category', most_cat
  );
end;
$$;

-- --------------------------------------------------------------------------
-- get_my_practice_history — newest-first, keyset-paginated on completed_at.
-- Safe fields only; no answers/ids/seeds/tokens/private content.
-- --------------------------------------------------------------------------

create or replace function get_my_practice_history(
  p_before timestamptz default null,
  p_limit int default 20
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  lim int;
  rows jsonb;
  more boolean;
  next_before timestamptz;
begin
  if uid is null then return jsonb_build_object('locked', true, 'rows', '[]'::jsonb); end if;
  lim := least(100, greatest(1, coalesce(p_limit, 20)));

  select coalesce(jsonb_agg(row_obj order by c desc), '[]'::jsonb), min(c) into rows, next_before
  from (
    select a.completed_at as c,
      jsonb_build_object(
        'completed_at', to_char(a.completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'score', a.final_score,
        'total_solve_ms', (select coalesce(sum(extract(epoch from (i.submitted_at - i.opened_at)) * 1000), 0)::bigint
                             from attempt_items i where i.attempt_id = a.id and i.status = 'submitted'),
        'selection_version', (select pp.selection_version from practice_packs pp where pp.id = a.practice_pack_id),
        'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', s.category, 'points', i.awarded_score) order by s.position), '[]'::jsonb)
                         from attempt_items i join practice_pack_slots s on s.id = i.slot_id
                        where i.attempt_id = a.id and i.status = 'submitted')
      ) as row_obj
    from attempts a
    where a.user_id = uid and a.attempt_purpose = 'practice' and a.status = 'completed'
      and (p_before is null or a.completed_at < p_before)
    order by a.completed_at desc
    limit lim
  ) page;

  select exists (
    select 1 from attempts a
     where a.user_id = uid and a.attempt_purpose = 'practice' and a.status = 'completed'
       and next_before is not null and a.completed_at < next_before
  ) into more;

  return jsonb_build_object('locked', false, 'rows', rows, 'page_size', lim,
    'next_before', case when more then to_char(next_before at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') else null end,
    'has_more', more);
end;
$$;

revoke all on function get_my_practice_summary() from public, anon;
revoke all on function get_my_practice_history(timestamptz, int) from public, anon;
grant execute on function get_my_practice_summary() to authenticated;
grant execute on function get_my_practice_history(timestamptz, int) to authenticated;
