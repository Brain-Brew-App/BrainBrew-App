-- BrainBrew — Player progress: streaks, daily history & basic statistics (6D).
--
-- Personal habit + progress foundation. DERIVED ENTIRELY from canonical ranked
-- attempts (Phase 6A) via read-only SECURITY DEFINER RPCs — NO duplicated mutable
-- counter table. This is the simplest reliable model at current scale and is:
--   • idempotent / rebuildable by construction (recomputing yields identical results),
--   • always canonical after any event (void recalculation or integrity
--     invalidation change the attempt row; every stat re-derives automatically),
--   • impossible to drift (there is no cached counter to fall out of sync).
-- Migration threshold to a derived player_statistics table: only if per-request
-- derivation over a single user's ranked history becomes too slow (very large
-- per-user history) — the client contract can stay identical.
--
-- STREAK RULE (all UTC): a day counts iff the user has a VALID ranked result for
-- that canonical UTC date — is_ranked, status='completed', integrity_status='clean'
-- (one-per-day already enforced). Practice never counts; anonymous users get no
-- streak. A content-side void (score recalc) STILL counts; an integrity
-- invalidation removes the day. Current streak stays "current" while the last
-- valid day is today OR yesterday (it only breaks once a full UTC day is missed),
-- so it never drops to 0 at 00:00 UTC merely because today is not done yet.
-- `statistics_version` versions the formulas.

-- --------------------------------------------------------------------------
-- Index: the user's valid ranked days, newest first — serves streak, history,
-- and lifetime stats. Partial (valid rows only) + composite.
-- --------------------------------------------------------------------------

create index if not exists attempts_user_valid_ranked_idx on attempts
  (user_id, ranked_date desc)
  where is_ranked and status = 'completed' and integrity_status = 'clean';

-- --------------------------------------------------------------------------
-- get_my_progress_summary — the compact summary (Home / Results / Progress
-- header). Streak + today status + lifetime score stats. Locked for anonymous.
-- --------------------------------------------------------------------------

create or replace function get_my_progress_summary(
  p_today date default (now() at time zone 'utc')::date
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  v_acct account_type;
  total int; best int; last_d date; cur int; today_done boolean; first_d date;
  latest_score int; best_score int; avg_score numeric; avg_solve numeric;
  perfect int; sum_score bigint; sum_solve bigint;
begin
  if uid is null then return jsonb_build_object('locked', true); end if;
  select account_type into v_acct from profiles where id = uid;
  if v_acct is distinct from 'permanent' then return jsonb_build_object('locked', true); end if;

  with days as (
    select ranked_date d, final_score fs, total_solve_ms ts
      from attempts
     where user_id = uid and is_ranked and status = 'completed' and integrity_status = 'clean'
  ),
  dd as (select distinct d from days),
  islands as (select d, d - (row_number() over (order by d))::int as grp from dd),
  runs as (select count(*)::int len, max(d) run_end from islands group by grp)
  select
    (select count(*)::int from dd),
    (select coalesce(max(len), 0) from runs),
    (select max(d) from dd),
    (select min(d) from dd),
    coalesce((select len from runs where run_end = (select max(d) from dd)), 0),
    exists (select 1 from dd where d = p_today),
    (select fs from days order by d desc limit 1),
    (select max(fs) from days),
    (select round(avg(fs), 1) from days),
    (select round(avg(ts)) from days),
    (select count(*)::int from days where fs = 100),
    (select coalesce(sum(fs), 0) from days),
    (select coalesce(sum(ts), 0) from days)
  into total, best, last_d, first_d, cur, today_done, latest_score, best_score,
       avg_score, avg_solve, perfect, sum_score, sum_solve;

  -- Current streak only holds while the last valid day is today or yesterday.
  if last_d is null or last_d < p_today - 1 then cur := 0; end if;

  return jsonb_build_object(
    'locked', false,
    'statistics_version', 1,
    'today', p_today,
    'today_completed', coalesce(today_done, false),
    'current_streak', cur,
    'best_streak', best,
    'last_ranked_date', last_d,
    'first_ranked_date', first_d,
    'ranked_days_completed', coalesce(total, 0),
    'latest_score', latest_score,
    'best_score', best_score,
    'average_score', avg_score,
    'average_solve_ms', avg_solve,
    'perfect_scores', coalesce(perfect, 0),
    'lifetime_score_sum', coalesce(sum_score, 0),
    'total_solve_ms', coalesce(sum_solve, 0)
  );
end;
$$;

-- --------------------------------------------------------------------------
-- get_my_progress_detail — category performance + a rolling completion calendar.
-- Category V1 = average points earned out of 20 (no fabricated cross-engine
-- precision, no cognitive claims).
-- --------------------------------------------------------------------------

create or replace function get_my_progress_detail(
  p_days int default 35,
  p_today date default (now() at time zone 'utc')::date
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  v_acct account_type;
  win int;
  from_d date;
  cats jsonb;
  cal jsonb;
  first_d date;
begin
  if uid is null then return jsonb_build_object('locked', true); end if;
  select account_type into v_acct from profiles where id = uid;
  if v_acct is distinct from 'permanent' then return jsonb_build_object('locked', true); end if;

  win := least(92, greatest(7, coalesce(p_days, 35)));
  from_d := p_today - (win - 1);

  -- Category performance from per-slot ranked results (non-void, submitted).
  select coalesce(jsonb_agg(jsonb_build_object(
      'category', category,
      'average_points', avg_pts,
      'best_points', best_pts,
      'plays', plays,
      'perfect', perfect
    ) order by category), '[]'::jsonb) into cats
  from (
    select s.category::text as category,
           round(avg(i.awarded_score), 1) as avg_pts,
           max(i.awarded_score) as best_pts,
           count(*)::int as plays,
           count(*) filter (where i.awarded_score >= s.max_score)::int as perfect
      from attempt_items i
      join attempts a on a.id = i.attempt_id
      join daily_pack_slots s on s.id = i.slot_id
     where a.user_id = uid and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean'
       and i.status = 'submitted' and s.void_status = false
     group by s.category
  ) c;

  select min(ranked_date) into first_d from attempts
   where user_id = uid and is_ranked and status = 'completed' and integrity_status = 'clean';

  -- Completed days inside the rolling window (the client renders missed/today/
  -- neutral by comparing to today + first_ranked_date; days before the first
  -- ranked date are neutral, not "missed").
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', ranked_date, 'updated_after_validation', recalc_version > 0
    ) order by ranked_date), '[]'::jsonb) into cal
  from attempts
   where user_id = uid and is_ranked and status = 'completed' and integrity_status = 'clean'
     and ranked_date >= from_d and ranked_date <= p_today;

  return jsonb_build_object(
    'locked', false,
    'statistics_version', 1,
    'categories', cats,
    'calendar', jsonb_build_object(
      'today', p_today,
      'from_date', from_d,
      'first_ranked_date', first_d,
      'completed', cal
    )
  );
end;
$$;

-- --------------------------------------------------------------------------
-- get_my_ranked_history — the caller's ranked daily history, newest first,
-- keyset-paginated on ranked_date (unique per user, so no attempt id is exposed
-- and pages never dup/skip). Invalidated days are EXCLUDED (documented rule).
-- --------------------------------------------------------------------------

create or replace function get_my_ranked_history(
  p_before date default null,
  p_limit int default 30
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  v_acct account_type;
  lim int;
  rows jsonb;
  more boolean;
  next_before date;
begin
  if uid is null then return jsonb_build_object('locked', true); end if;
  select account_type into v_acct from profiles where id = uid;
  if v_acct is distinct from 'permanent' then return jsonb_build_object('locked', true, 'rows', '[]'::jsonb); end if;

  lim := least(100, greatest(1, coalesce(p_limit, 30)));

  select coalesce(jsonb_agg(row_obj order by d desc), '[]'::jsonb), min(d) into rows, next_before
  from (
    select ranked_date as d,
      jsonb_build_object(
        'ranked_date', ranked_date,
        'score', final_score,
        'total_solve_ms', total_solve_ms,
        'country_code', country_code_snapshot,
        'completed_at', to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'updated_after_validation', recalc_version > 0,
        'result_version', recalc_version,
        'status', 'counted'
      ) as row_obj
    from attempts
     where user_id = uid and is_ranked and status = 'completed' and integrity_status = 'clean'
       and (p_before is null or ranked_date < p_before)
     order by ranked_date desc
     limit lim
  ) page;

  -- More below this page?
  select exists (
    select 1 from attempts
     where user_id = uid and is_ranked and status = 'completed' and integrity_status = 'clean'
       and next_before is not null and ranked_date < next_before
  ) into more;

  return jsonb_build_object(
    'locked', false,
    'rows', rows,
    'page_size', lim,
    'next_before', case when more then next_before else null end,
    'has_more', more
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Grants — authenticated only; anonymous callers are gated to a locked view
-- inside each function. No direct table access, no cross-user parameter.
-- --------------------------------------------------------------------------

revoke all on function get_my_progress_summary(date) from public, anon;
revoke all on function get_my_progress_detail(int, date) from public, anon;
revoke all on function get_my_ranked_history(date, int) from public, anon;
grant execute on function get_my_progress_summary(date) to authenticated;
grant execute on function get_my_progress_detail(int, date) to authenticated;
grant execute on function get_my_ranked_history(date, int) to authenticated;
