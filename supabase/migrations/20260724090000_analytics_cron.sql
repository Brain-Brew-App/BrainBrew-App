-- BrainBrew — schedule the daily analytics rollup (Phase 7H).
--
-- Runs rebuild_analytics_rollups nightly at 00:15 UTC over a 2-day trailing window
-- (absorbs late events + same-day corrections). Guarded so environments without
-- pg_cron (PGlite test harness) skip it cleanly instead of failing the migration
-- chain. On Supabase, pg_cron is available and this schedules the job.

do $$
begin
  create extension if not exists pg_cron;
  -- Upsert the job by name (unschedule any prior one first for idempotency).
  begin perform cron.unschedule('brainbrew-analytics-rollup'); exception when others then null; end;
  perform cron.schedule(
    'brainbrew-analytics-rollup',
    '15 0 * * *',
    $job$ select rebuild_analytics_rollups((now() at time zone 'utc')::date - 2, (now() at time zone 'utc')::date) $job$
  );
  raise notice 'Scheduled brainbrew-analytics-rollup (daily 00:15 UTC).';
exception when others then
  -- pg_cron not present (e.g. PGlite). The rollup can still be run on demand from
  -- the admin Gameplay page ("Refresh rollups"); schedule it later if needed.
  raise notice 'pg_cron unavailable — analytics rollup not scheduled here (%).', sqlerrm;
end $$;

-- A helper the admin System Health page uses to show rollup freshness.
create or replace function admin_rollup_freshness() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'last_gameplay_day', (select max(day) from analytics_gameplay_daily),
    'last_updated_at', (select max(updated_at) from analytics_gameplay_daily),
    'user_days', (select count(*) from analytics_user_daily),
    'gameplay_days', (select count(*) from analytics_gameplay_daily),
    'generated_at', now()
  );
$$;
revoke all on function admin_rollup_freshness() from public, anon, authenticated;
grant execute on function admin_rollup_freshness() to service_role;
