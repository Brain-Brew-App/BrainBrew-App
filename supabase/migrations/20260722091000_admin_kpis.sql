-- BrainBrew — Admin KPI read RPCs (Phase 7F.2). Service-role only; every value is
-- derived from CANONICAL tables (profiles, attempts, player_entitlements,
-- revenuecat_webhook_events) in UTC. No fabricated metrics: figures that need data
-- BrainBrew does not yet have (store prices → MRR/ARR, mobile analytics events →
-- funnels/retention) are intentionally NOT returned here; the dashboard shows an
-- honest "pending instrumentation" state for those. Definitions live in
-- docs/KPI_DICTIONARY.md and MUST match these formulas.

-- Executive overview — the headline counts, all real.
create or replace function admin_kpi_overview() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with today as (select (now() at time zone 'utc')::date d)
  select jsonb_build_object(
    'total_users', (select count(*) from profiles),
    'anonymous_users', (select count(*) from profiles where account_type = 'anonymous'),
    'permanent_users', (select count(*) from profiles where account_type = 'permanent'),
    'new_users_today', (select count(*) from auth.users where (created_at at time zone 'utc')::date = (select d from today)),
    'new_users_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'new_users_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'ranked_completed_total', (select count(*) from attempts where is_ranked and status = 'completed'),
    'ranked_completed_today', (select count(*) from attempts where is_ranked and status = 'completed'
       and (completed_at at time zone 'utc')::date = (select d from today)),
    'practice_completed_total', (select count(*) from attempts where attempt_purpose = 'practice' and status = 'completed'),
    'practice_completed_today', (select count(*) from attempts where attempt_purpose = 'practice' and status = 'completed'
       and (completed_at at time zone 'utc')::date = (select d from today)),
    'ranked_players_today', (select count(distinct user_id) from attempts where is_ranked
       and (created_at at time zone 'utc')::date = (select d from today)),
    'practice_players_today', (select count(distinct user_id) from attempts where attempt_purpose = 'practice'
       and (created_at at time zone 'utc')::date = (select d from today)),
    'avg_brewscore', (select round(avg(final_score)::numeric, 1) from attempts where is_ranked and status = 'completed'),
    'median_brewscore', (select round((percentile_cont(0.5) within group (order by final_score))::numeric, 1)
       from attempts where is_ranked and status = 'completed'),
    'active_subscriptions', (select count(*) from player_entitlements where entitlement_state in ('premium','grace_period','billing_issue')),
    'trial_subscriptions', (select count(*) from player_entitlements where entitlement_state = 'premium' and period_type = 'trial'),
    'generated_at', now()
  );
$$;
revoke all on function admin_kpi_overview() from public, anon, authenticated;
grant execute on function admin_kpi_overview() to service_role;

-- Active users (meaningful product activity = an attempt that UTC day). DAU/WAU/MAU.
create or replace function admin_active_users(p_as_of date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'as_of', p_as_of,
    'dau', (select count(distinct user_id) from attempts where (created_at at time zone 'utc')::date = p_as_of),
    'wau', (select count(distinct user_id) from attempts
       where (created_at at time zone 'utc')::date > p_as_of - 7 and (created_at at time zone 'utc')::date <= p_as_of),
    'mau', (select count(distinct user_id) from attempts
       where (created_at at time zone 'utc')::date > p_as_of - 30 and (created_at at time zone 'utc')::date <= p_as_of),
    'generated_at', now()
  );
$$;
revoke all on function admin_active_users(date) from public, anon, authenticated;
grant execute on function admin_active_users(date) to service_role;

-- Ranked completion funnel over a UTC date range (by attempt creation).
create or replace function admin_ranked_funnel(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select status from attempts
     where is_ranked and (created_at at time zone 'utc')::date >= p_from
       and (created_at at time zone 'utc')::date <= p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'ranked_started', (select count(*) from r),
    'ranked_completed', (select count(*) from r where status = 'completed'),
    'completion_rate', (select case when count(*) = 0 then null
       else round(count(*) filter (where status = 'completed')::numeric / count(*), 4) end from r),
    'generated_at', now()
  );
$$;
revoke all on function admin_ranked_funnel(date, date) from public, anon, authenticated;
grant execute on function admin_ranked_funnel(date, date) to service_role;

-- Subscription snapshot + webhook reconciliation — all REAL (no prices → no MRR here).
create or replace function admin_revenue_snapshot() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'active_subscriptions', (select count(*) from player_entitlements where entitlement_state in ('premium','grace_period','billing_issue')),
    'by_state', (select coalesce(jsonb_object_agg(entitlement_state, c), '{}'::jsonb)
       from (select entitlement_state, count(*) c from player_entitlements group by entitlement_state) s),
    'will_renew', (select count(*) from player_entitlements where will_renew),
    'trials', (select count(*) from player_entitlements where period_type = 'trial' and entitlement_state = 'premium'),
    'webhook_events_total', (select count(*) from revenuecat_webhook_events),
    'webhook_processed', (select count(*) from revenuecat_webhook_events where status = 'processed'),
    'webhook_errors', (select count(*) from revenuecat_webhook_events where status = 'error'),
    'webhook_quarantined', (select count(*) from revenuecat_webhook_events where status = 'quarantined'),
    'webhook_duplicates', (select count(*) from revenuecat_webhook_events where status = 'duplicate'),
    -- Monetary KPIs (MRR/ARR/ARPPU) require store price data BrainBrew does not
    -- have yet — returned as null so the UI shows "pending", never a fake number.
    'mrr', null, 'arr', null, 'arppu', null,
    'revenue_data_available', false,
    'generated_at', now()
  );
$$;
revoke all on function admin_revenue_snapshot() from public, anon, authenticated;
grant execute on function admin_revenue_snapshot() to service_role;

-- Category performance (real, from attempt_items joined to slots for the category).
create or replace function admin_category_stats(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select
      s.category::text as category,
      count(*) as plays,
      round(avg(ai.awarded_score)::numeric, 2) as avg_points,
      round((percentile_cont(0.5) within group (order by ai.awarded_score))::numeric, 2) as median_points,
      round((count(*) filter (where ai.awarded_score = s.max_score)::numeric / nullif(count(*),0)), 4) as perfect_rate,
      round((count(*) filter (where ai.awarded_score = 0)::numeric / nullif(count(*),0)), 4) as zero_rate
    from attempt_items ai
    join daily_pack_slots s on s.id = ai.slot_id
    join attempts a on a.id = ai.attempt_id
    where ai.status = 'submitted' and a.status = 'completed'
      and (a.completed_at at time zone 'utc')::date >= p_from
      and (a.completed_at at time zone 'utc')::date <= p_to
    group by s.category
    order by s.category
  ) t;
$$;
revoke all on function admin_category_stats(date, date) from public, anon, authenticated;
grant execute on function admin_category_stats(date, date) to service_role;
