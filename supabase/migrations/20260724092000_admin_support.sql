-- BrainBrew — Admin User Support RPCs (Phase 7H). Service-role only. Return ONLY
-- safe operational fields — never tokens, passwords, provider ids, raw answers,
-- payment data, or anti-cheat thresholds. Exact lookup only (no enumeration).

-- Exact lookup by username (case-insensitive) or Auth UUID. Small, capped result.
create or replace function admin_user_lookup(p_query text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select p.id as user_id, p.username, p.account_type::text account_type, p.country_code,
      (select created_at from auth.users u where u.id = p.id) created_at
    from profiles p
    where p.username_normalized = lower(trim(coalesce(p_query,'')))
       or p.id::text = trim(coalesce(p_query,''))
    limit 25
  ) t;
$$;
revoke all on function admin_user_lookup(text) from public, anon, authenticated;
grant execute on function admin_user_lookup(text) to service_role;

-- Safe support profile for one user.
create or replace function admin_user_profile(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p.id is null then null else jsonb_build_object(
    'user_id', p.id,
    'username', p.username,
    'account_type', p.account_type,
    'country_code', p.country_code,
    'onboarding_status', p.onboarding_status,
    'created_at', (select created_at from auth.users u where u.id = p.id),
    'last_activity', (select max(a.created_at) from attempts a where a.user_id = p.id),
    'ranked', jsonb_build_object(
      'completed', (select count(*) from attempts a where a.user_id = p.id and a.is_ranked and a.status='completed'),
      'best_score', (select max(a.final_score) from attempts a where a.user_id = p.id and a.is_ranked and a.status='completed'),
      'last_ranked_date', (select max(a.ranked_date) from attempts a where a.user_id = p.id and a.is_ranked and a.status='completed')),
    'practice', jsonb_build_object(
      'completed', (select count(*) from attempts a where a.user_id = p.id and a.attempt_purpose='practice' and a.status='completed')),
    'entitlement', jsonb_build_object(
      'state', coalesce((select entitlement_state from player_entitlements pe where pe.user_id = p.id), 'none'),
      'is_active', coalesce((select is_active from player_entitlements pe where pe.user_id = p.id), false)),
    'test_excluded', exists (select 1 from analytics_subject_flags f where f.user_id = p.id and f.exclude_from_business_kpis)
  ) end
  from (select * from profiles where id = p_user) p;
$$;
revoke all on function admin_user_profile(uuid) from public, anon, authenticated;
grant execute on function admin_user_profile(uuid) to service_role;
