-- BrainBrew — Analytics daily rollups + retention/funnel RPCs (Phase 7G.3).
--
-- Rollups are DERIVED FROM CANONICAL TABLES (attempts, attempt_items, profiles,
-- auth.users), idempotent, backfillable by date range, and exclude flagged
-- test/internal users. Re-running a day recomputes it (handles late events, ranked
-- voids/recalcs, refunds). All UTC. Service-role only. No fabricated numbers:
-- fields that need mobile events (platform split) or store prices (revenue $) are
-- omitted here and surfaced as "pending" in the UI.

-- Reusable exclusion set.
create or replace function analytics_excluded_ids() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select user_id from analytics_subject_flags where exclude_from_business_kpis;
$$;
revoke all on function analytics_excluded_ids() from public, anon, authenticated;
grant execute on function analytics_excluded_ids() to service_role;

-- ---------------------------------------------------------------------------
-- Rollup tables
-- ---------------------------------------------------------------------------
create table if not exists analytics_user_daily (
  day date primary key,
  new_users int not null default 0,
  new_permanent int not null default 0,
  new_anonymous int not null default 0,
  active_users int not null default 0,
  formula_version int not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists analytics_gameplay_daily (
  day date primary key,
  ranked_starts int not null default 0,
  ranked_completions int not null default 0,
  practice_starts int not null default 0,
  practice_completions int not null default 0,
  avg_score numeric,
  median_score numeric,
  formula_version int not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists analytics_category_daily (
  day date not null,
  category text not null,
  exposures int not null default 0,
  completions int not null default 0,
  avg_points numeric,
  median_points numeric,
  perfect_rate numeric,
  zero_rate numeric,
  formula_version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (day, category)
);
alter table analytics_user_daily enable row level security;
alter table analytics_gameplay_daily enable row level security;
alter table analytics_category_daily enable row level security;

-- ---------------------------------------------------------------------------
-- Idempotent rollup for one UTC day (recompute + upsert). Exclusion-aware.
-- ---------------------------------------------------------------------------
create or replace function rebuild_analytics_day(p_day date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Users
  insert into analytics_user_daily as t (day, new_users, new_permanent, new_anonymous, active_users, updated_at)
  select p_day,
    (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date = p_day
       and u.id not in (select analytics_excluded_ids())),
    (select count(*) from auth.users u join profiles p on p.id = u.id
       where (u.created_at at time zone 'utc')::date = p_day and p.account_type = 'permanent'
       and u.id not in (select analytics_excluded_ids())),
    (select count(*) from auth.users u join profiles p on p.id = u.id
       where (u.created_at at time zone 'utc')::date = p_day and p.account_type = 'anonymous'
       and u.id not in (select analytics_excluded_ids())),
    (select count(distinct a.user_id) from attempts a
       where (a.created_at at time zone 'utc')::date = p_day
       and a.user_id not in (select analytics_excluded_ids())),
    now()
  on conflict (day) do update set
    new_users = excluded.new_users, new_permanent = excluded.new_permanent,
    new_anonymous = excluded.new_anonymous, active_users = excluded.active_users, updated_at = now();

  -- Gameplay
  insert into analytics_gameplay_daily as t (day, ranked_starts, ranked_completions,
    practice_starts, practice_completions, avg_score, median_score, updated_at)
  select p_day,
    (select count(*) from attempts a where a.is_ranked and (a.created_at at time zone 'utc')::date = p_day and a.user_id not in (select analytics_excluded_ids())),
    (select count(*) from attempts a where a.is_ranked and a.status='completed' and (a.completed_at at time zone 'utc')::date = p_day and a.user_id not in (select analytics_excluded_ids())),
    (select count(*) from attempts a where a.attempt_purpose='practice' and (a.created_at at time zone 'utc')::date = p_day and a.user_id not in (select analytics_excluded_ids())),
    (select count(*) from attempts a where a.attempt_purpose='practice' and a.status='completed' and (a.completed_at at time zone 'utc')::date = p_day and a.user_id not in (select analytics_excluded_ids())),
    (select round(avg(final_score)::numeric,2) from attempts a where a.is_ranked and a.status='completed' and (a.completed_at at time zone 'utc')::date = p_day and a.user_id not in (select analytics_excluded_ids())),
    (select round((percentile_cont(0.5) within group (order by final_score))::numeric,2) from attempts a where a.is_ranked and a.status='completed' and (a.completed_at at time zone 'utc')::date = p_day and a.user_id not in (select analytics_excluded_ids())),
    now()
  on conflict (day) do update set
    ranked_starts=excluded.ranked_starts, ranked_completions=excluded.ranked_completions,
    practice_starts=excluded.practice_starts, practice_completions=excluded.practice_completions,
    avg_score=excluded.avg_score, median_score=excluded.median_score, updated_at=now();

  -- Category (ranked packs)
  delete from analytics_category_daily where day = p_day;
  insert into analytics_category_daily (day, category, exposures, completions, avg_points, median_points, perfect_rate, zero_rate, updated_at)
  select p_day, s.category::text,
    count(*), count(*) filter (where ai.status='submitted'),
    round(avg(ai.awarded_score)::numeric,2),
    round((percentile_cont(0.5) within group (order by ai.awarded_score))::numeric,2),
    round((count(*) filter (where ai.awarded_score = s.max_score)::numeric / nullif(count(*),0)),4),
    round((count(*) filter (where ai.awarded_score = 0)::numeric / nullif(count(*),0)),4),
    now()
  from attempt_items ai
  join daily_pack_slots s on s.id = ai.slot_id
  join attempts a on a.id = ai.attempt_id
  where a.status='completed' and (a.completed_at at time zone 'utc')::date = p_day
    and a.user_id not in (select analytics_excluded_ids())
  group by s.category;
end; $$;
revoke all on function rebuild_analytics_day(date) from public, anon, authenticated;
grant execute on function rebuild_analytics_day(date) to service_role;

-- Backfill a range (idempotent).
create or replace function rebuild_analytics_rollups(p_from date, p_to date) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare d date := p_from; c int := 0;
begin
  if p_to - p_from > 400 then raise exception 'range_too_large' using errcode='22023'; end if;
  while d <= p_to loop perform rebuild_analytics_day(d); d := d + 1; c := c + 1; end loop;
  return c;
end; $$;
revoke all on function rebuild_analytics_rollups(date, date) from public, anon, authenticated;
grant execute on function rebuild_analytics_rollups(date, date) to service_role;

-- Read RPCs for the dashboard (from rollups).
create or replace function admin_gameplay_daily(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb)
  from (select * from analytics_gameplay_daily where day >= p_from and day <= p_to) t;
$$;
create or replace function admin_user_daily(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb)
  from (select * from analytics_user_daily where day >= p_from and day <= p_to) t;
$$;
revoke all on function admin_gameplay_daily(date, date) from public, anon, authenticated;
revoke all on function admin_user_daily(date, date) from public, anon, authenticated;
grant execute on function admin_gameplay_daily(date, date) to service_role;
grant execute on function admin_user_daily(date, date) to service_role;

-- ---------------------------------------------------------------------------
-- Retention — cohort = first Brew (ranked OR practice) start day. D1..D30.
-- Computed live from canonical attempts (exclusion-aware). Recent cohorts whose
-- window hasn't elapsed report null for that horizon (honest incompleteness).
-- ---------------------------------------------------------------------------
-- Helper: retained fraction at horizon N (null when the horizon hasn't elapsed).
create or replace function ret(p_cohort date, p_n int, p_size int) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_cohort + p_n > (now() at time zone 'utc')::date then null  -- window not elapsed
    when p_size = 0 then null
    else round((select count(distinct a.user_id)::numeric from attempts a
      join (select user_id, min((created_at at time zone 'utc')::date) cohort from attempts group by user_id) fd
        on fd.user_id = a.user_id and fd.cohort = p_cohort
      where (a.created_at at time zone 'utc')::date = p_cohort + p_n
        and a.user_id not in (select analytics_excluded_ids())) / p_size, 4)
  end;
$$;
revoke all on function ret(date, int, int) from public, anon, authenticated;
grant execute on function ret(date, int, int) to service_role;

create or replace function admin_retention(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with first_day as (
    select a.user_id, min((a.created_at at time zone 'utc')::date) as cohort
    from attempts a where a.user_id not in (select analytics_excluded_ids())
    group by a.user_id
  ),
  cohorts as (select cohort, count(*) size from first_day where cohort >= p_from and cohort <= p_to group by cohort)
  select coalesce(jsonb_agg(jsonb_build_object(
    'cohort', c.cohort, 'size', c.size,
    'd1', ret(c.cohort, 1, c.size::int), 'd3', ret(c.cohort, 3, c.size::int),
    'd7', ret(c.cohort, 7, c.size::int), 'd14', ret(c.cohort, 14, c.size::int), 'd30', ret(c.cohort, 30, c.size::int)
  ) order by c.cohort), '[]'::jsonb)
  from cohorts c;
$$;
revoke all on function admin_retention(date, date) from public, anon, authenticated;
grant execute on function admin_retention(date, date) to service_role;

-- ---------------------------------------------------------------------------
-- Activation funnel — canonical stages (event-only stages marked pending in UI).
-- ---------------------------------------------------------------------------
create or replace function admin_activation_funnel(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'users_created', (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date between p_from and p_to and u.id not in (select analytics_excluded_ids())),
    'profile_completed', (select count(*) from profiles p join auth.users u on u.id=p.id where p.onboarding_status='complete' and (u.created_at at time zone 'utc')::date between p_from and p_to and u.id not in (select analytics_excluded_ids())),
    'ranked_started', (select count(distinct a.user_id) from attempts a where a.is_ranked and (a.created_at at time zone 'utc')::date between p_from and p_to and a.user_id not in (select analytics_excluded_ids())),
    'ranked_completed', (select count(distinct a.user_id) from attempts a where a.is_ranked and a.status='completed' and (a.completed_at at time zone 'utc')::date between p_from and p_to and a.user_id not in (select analytics_excluded_ids())),
    'generated_at', now()
  );
$$;
revoke all on function admin_activation_funnel(date, date) from public, anon, authenticated;
grant execute on function admin_activation_funnel(date, date) to service_role;

-- Engine stats (real, ranked packs) for the Engines page.
create or replace function admin_engine_stats(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.engine_id), '[]'::jsonb) from (
    select s.engine_id,
      count(*) exposures,
      count(distinct a.user_id) unique_players,
      count(*) filter (where ai.status='submitted') completions,
      round(avg(ai.awarded_score)::numeric,2) avg_points,
      round((count(*) filter (where ai.awarded_score = s.max_score)::numeric/nullif(count(*),0)),4) perfect_rate,
      round((count(*) filter (where ai.awarded_score = 0)::numeric/nullif(count(*),0)),4) zero_rate
    from attempt_items ai
    join daily_pack_slots s on s.id = ai.slot_id
    join attempts a on a.id = ai.attempt_id
    where a.status='completed' and (a.completed_at at time zone 'utc')::date between p_from and p_to
      and a.user_id not in (select analytics_excluded_ids())
    group by s.engine_id
  ) t;
$$;
revoke all on function admin_engine_stats(date, date) from public, anon, authenticated;
grant execute on function admin_engine_stats(date, date) to service_role;
