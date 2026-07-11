-- BrainBrew — Daily Global & Country leaderboards (Phase 6C).
--
-- Trustworthy daily rankings derived ENTIRELY from valid, completed, clean
-- ranked attempts (Phase 6A). No new gameplay, scoring, or anti-cheat: this is a
-- read surface over the server-authoritative ranked records, plus a stored
-- solve-time so the ranking order can be indexed.
--
-- Ranking order (one deterministic total order, used everywhere):
--   1. higher final_score
--   2. lower total_solve_ms (active solve time)
--   3. earlier completed_at
--   4. lower attempt id  (stable, deterministic final tie-break — NEVER exposed)
--
-- Displayed position is UNIQUE per player (row_number over that total order), so
-- two players are never shown tied when a tie-break separated them.

-- --------------------------------------------------------------------------
-- 1. Stored active solve time — the projection computed this per-row with a
--    correlated subquery; the leaderboard ORDER BY needs it as an indexable
--    column. Populated by a trigger at completion and by void recalculation, so
--    the Edge Functions are unchanged.
-- --------------------------------------------------------------------------

alter table attempts add column if not exists total_solve_ms bigint;

comment on column attempts.total_solve_ms is
  'Server-measured active solve time (sum of submit−open over non-void submitted slots), in ms. '
  'Maintained by trigger at completion and by recalculate_ranked_result. Ranking tie-break #2.';

-- Backfill existing completed attempts (idempotent).
update attempts a
   set total_solve_ms = coalesce((
     select sum(extract(epoch from (i.submitted_at - i.opened_at)) * 1000)::bigint
       from attempt_items i join daily_pack_slots s on s.id = i.slot_id
      where i.attempt_id = a.id and i.status = 'submitted' and s.void_status = false), 0)
 where a.status = 'completed' and a.total_solve_ms is null;

create or replace function set_ranked_solve_time() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Only when an attempt first becomes completed. Runs AFTER the terminal
  -- trigger (alphabetical: attempt_completion_terminal < set_solve_time), so a
  -- rejected completion never reaches here.
  if new.status = 'completed' and new.status is distinct from old.status then
    select coalesce(sum(extract(epoch from (i.submitted_at - i.opened_at)) * 1000), 0)::bigint
      into new.total_solve_ms
      from attempt_items i join daily_pack_slots s on s.id = i.slot_id
     where i.attempt_id = new.id and i.status = 'submitted' and s.void_status = false;
  end if;
  return new;
end;
$$;

create trigger set_solve_time
  before update on attempts
  for each row execute function set_ranked_solve_time();

-- --------------------------------------------------------------------------
-- 2. Void recalculation must also re-derive solve time over the surviving
--    (non-void) slots, so leaderboard ordering stays correct after a void.
-- --------------------------------------------------------------------------

create or replace function recalculate_ranked_result(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  att attempts%rowtype;
  new_denom int;
  new_sum int;
  new_score int;
  new_solve bigint;
begin
  select * into att from attempts where id = p_attempt_id;
  if att.id is null or not att.is_ranked or att.status <> 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_completed_ranked_attempt');
  end if;

  select coalesce(sum(s.max_score), 0) into new_denom
    from daily_pack_slots s where s.pack_id = att.pack_id and s.void_status = false;
  select coalesce(sum(i.awarded_score), 0) into new_sum
    from attempt_items i join daily_pack_slots s on s.id = i.slot_id
    where i.attempt_id = att.id and i.status = 'submitted' and s.void_status = false;
  select coalesce(sum(extract(epoch from (i.submitted_at - i.opened_at)) * 1000), 0)::bigint into new_solve
    from attempt_items i join daily_pack_slots s on s.id = i.slot_id
    where i.attempt_id = att.id and i.status = 'submitted' and s.void_status = false;

  if new_denom <= 0 then
    new_score := 0; new_denom := 100;   -- all slots voided: define as 0, no divide-by-zero
  else
    new_score := round(100.0 * new_sum / new_denom);
  end if;

  -- Idempotent: write (and bump version) only when something actually changes.
  if new_score is distinct from att.final_score
     or new_denom is distinct from att.active_denominator
     or new_solve is distinct from att.total_solve_ms then
    update attempts
       set final_score = new_score, active_denominator = new_denom,
           total_solve_ms = new_solve, recalc_version = recalc_version + 1
     where id = p_attempt_id;
  end if;

  return jsonb_build_object('ok', true, 'final_score', new_score, 'active_denominator', new_denom, 'recalc_version',
    (select recalc_version from attempts where id = p_attempt_id));
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Indexes aligned to the ranking queries. Partial (valid rows only) +
--    composite in the exact filter/order shape — global and country.
-- --------------------------------------------------------------------------

create index if not exists attempts_leaderboard_global_idx on attempts
  (ranked_date, final_score desc, total_solve_ms asc, completed_at asc, id asc)
  where is_ranked and status = 'completed' and integrity_status = 'clean';

create index if not exists attempts_leaderboard_country_idx on attempts
  (ranked_date, country_code_snapshot, final_score desc, total_solve_ms asc, completed_at asc, id asc)
  where is_ranked and status = 'completed' and integrity_status = 'clean';

-- --------------------------------------------------------------------------
-- 4. get_my_daily_rank — the ONE personal summary (Results + Home + leaderboard
--    header). Server derives the user, their snapshotted country, and the UTC
--    date; the client cannot inject any of them. Returns only safe fields.
--
--    percentile = the top-bracket the player is in = ceil(100 * position / total),
--    clamped to 1..100 ("you are in the top P%"). Defined ONCE here so Results and
--    the Leaderboard never disagree. Null when the player is the only ranked one.
-- --------------------------------------------------------------------------

create or replace function get_my_daily_rank(
  p_date date default (now() at time zone 'utc')::date
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  v_acct account_type;
  prof_country text;
  me attempts%rowtype;
  cc text;
  g_total int; g_pos int; c_total int; c_pos int;
begin
  if uid is null then
    return jsonb_build_object('locked', true, 'ranked_date', p_date);
  end if;
  select account_type, country_code into v_acct, prof_country from profiles where id = uid;
  -- Anonymous guests get a locked view, never ranked rows/positions.
  if v_acct is distinct from 'permanent' then
    return jsonb_build_object('locked', true, 'ranked_date', p_date);
  end if;

  -- Never a future date.
  if p_date > (now() at time zone 'utc')::date then
    return jsonb_build_object('locked', false, 'has_result', false, 'ranked_date', p_date, 'country_code', prof_country);
  end if;

  select * into me from attempts
   where user_id = uid and ranked_date = p_date and is_ranked
     and status = 'completed' and integrity_status = 'clean'
   limit 1;

  if me.id is null then
    return jsonb_build_object('locked', false, 'has_result', false, 'ranked_date', p_date, 'country_code', prof_country);
  end if;

  cc := me.country_code_snapshot;

  select count(*) into g_total from attempts a
   where a.ranked_date = p_date and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean';
  select count(*) into c_total from attempts a
   where a.ranked_date = p_date and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean'
     and a.country_code_snapshot = cc;

  select count(*) + 1 into g_pos from attempts a
   where a.ranked_date = p_date and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean'
     and ( a.final_score > me.final_score
        or (a.final_score = me.final_score and a.total_solve_ms < me.total_solve_ms)
        or (a.final_score = me.final_score and a.total_solve_ms = me.total_solve_ms and a.completed_at < me.completed_at)
        or (a.final_score = me.final_score and a.total_solve_ms = me.total_solve_ms and a.completed_at = me.completed_at and a.id < me.id) );
  select count(*) + 1 into c_pos from attempts a
   where a.ranked_date = p_date and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean'
     and a.country_code_snapshot = cc
     and ( a.final_score > me.final_score
        or (a.final_score = me.final_score and a.total_solve_ms < me.total_solve_ms)
        or (a.final_score = me.final_score and a.total_solve_ms = me.total_solve_ms and a.completed_at < me.completed_at)
        or (a.final_score = me.final_score and a.total_solve_ms = me.total_solve_ms and a.completed_at = me.completed_at and a.id < me.id) );

  return jsonb_build_object(
    'locked', false,
    'has_result', true,
    'ranked_date', p_date,
    'score', me.final_score,
    'score_locked', true,
    'total_solve_ms', me.total_solve_ms,
    'result_version', me.recalc_version,
    'updated_after_validation', me.recalc_version > 0,
    'country_code', cc,
    'global_position', g_pos,
    'global_total', g_total,
    'global_percentile', case when g_total <= 1 then null else least(100, greatest(1, ceil(100.0 * g_pos / g_total)::int)) end,
    'country_position', c_pos,
    'country_total', c_total,
    'country_percentile', case when c_total <= 1 then null else least(100, greatest(1, ceil(100.0 * c_pos / c_total)::int)) end
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 5. get_daily_leaderboard — one paginated page of safe rows for a scope.
--    Position-windowed over the deterministic total order (row_number). The
--    cursor is a server-clamped integer position, never a client-trusted rank
--    and never the attempt id. Country scope uses the caller's SNAPSHOTTED
--    country, never a client-supplied one.
-- --------------------------------------------------------------------------

create or replace function get_daily_leaderboard(
  p_scope text default 'global',
  p_date date default (now() at time zone 'utc')::date,
  p_after_position int default 0,
  p_limit int default 50
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  v_acct account_type;
  scope text;
  lim int;
  after_pos int;
  my_cc text;
  total int;
  rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('locked', true);
  end if;
  select account_type into v_acct from profiles where id = uid;
  if v_acct is distinct from 'permanent' then
    return jsonb_build_object('locked', true, 'scope', p_scope, 'ranked_date', p_date, 'total', 0, 'rows', '[]'::jsonb);
  end if;

  scope := case when p_scope = 'country' then 'country' else 'global' end;
  lim := least(100, greatest(1, coalesce(p_limit, 50)));          -- hard cap 100, default 50
  after_pos := greatest(0, coalesce(p_after_position, 0));         -- server-validated cursor

  if p_date > (now() at time zone 'utc')::date then                -- never a future date
    return jsonb_build_object('locked', false, 'scope', scope, 'ranked_date', p_date, 'total', 0, 'rows', '[]'::jsonb, 'has_more', false, 'next_after', null);
  end if;

  if scope = 'country' then
    -- The caller's snapshotted country for the day, else their profile country.
    select coalesce(
      (select country_code_snapshot from attempts
        where user_id = uid and ranked_date = p_date and is_ranked and status = 'completed' and integrity_status = 'clean' limit 1),
      (select country_code from profiles where id = uid)
    ) into my_cc;
    if my_cc is null then
      return jsonb_build_object('locked', false, 'scope', 'country', 'ranked_date', p_date, 'total', 0, 'rows', '[]'::jsonb, 'country_code', null, 'has_more', false, 'next_after', null);
    end if;
  end if;

  select count(*) into total from attempts a
   where a.ranked_date = p_date and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean'
     and (scope = 'global' or a.country_code_snapshot = my_cc);

  select coalesce(jsonb_agg(row_obj order by pos), '[]'::jsonb) into rows from (
    select pos,
      jsonb_build_object(
        'position', pos,
        'username', username_snapshot,
        'country_code', country_code_snapshot,
        'score', final_score,
        'solve_ms', total_solve_ms,
        'is_current_user', (row_user = uid)
      ) as row_obj
    from (
      select a.username_snapshot, a.country_code_snapshot, a.final_score, a.total_solve_ms, a.user_id as row_user,
             row_number() over (order by a.final_score desc, a.total_solve_ms asc, a.completed_at asc, a.id asc) as pos
        from attempts a
       where a.ranked_date = p_date and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean'
         and (scope = 'global' or a.country_code_snapshot = my_cc)
    ) ordered
    where pos > after_pos and pos <= after_pos + lim
  ) page;

  return jsonb_build_object(
    'locked', false,
    'scope', scope,
    'ranked_date', p_date,
    'total', total,
    'page_size', lim,
    'after_position', after_pos,
    'next_after', case when after_pos + lim < total then after_pos + lim else null end,
    'has_more', (after_pos + lim < total),
    'country_code', case when scope = 'country' then my_cc else null end,
    'rows', rows
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Grants — authenticated only. The publishable (anon) role and public are
--    denied; the functions themselves gate anonymous-Auth callers to a locked
--    view. No direct access to ranked_result_projection or the attempts table.
-- --------------------------------------------------------------------------

revoke all on function get_my_daily_rank(date) from public, anon;
revoke all on function get_daily_leaderboard(text, date, int, int) from public, anon;
grant execute on function get_my_daily_rank(date) to authenticated;
grant execute on function get_daily_leaderboard(text, date, int, int) to authenticated;
