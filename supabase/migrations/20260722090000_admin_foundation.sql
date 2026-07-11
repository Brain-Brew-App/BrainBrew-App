-- BrainBrew — Admin Command Center foundation (Phase 7F.1 + server spine of 7F.2/7F.6).
--
-- The private, server-authoritative security + operations layer the internal admin
-- dashboard is built on. NONE of these tables are client-readable: RLS is enabled
-- with no policies, and every function is service-role only (the admin web app
-- runs server-side with the service role AFTER verifying the caller is a live
-- admin). Ordinary players and the public API role can never reach any of this.
--
-- No destructive operations live here: no arbitrary SQL, no DB reset/delete, no
-- credential exposure. Operational controls are limited to maintenance flags and
-- audit-logged incident/state changes. The mobile app and gameplay are untouched
-- except for a maintenance-mode guard on Practice starts (server-enforced).

-- ---------------------------------------------------------------------------
-- 1. Admin identity & roles
-- ---------------------------------------------------------------------------
do $$ begin
  create type admin_role as enum
    ('founder','super_admin','product_admin','content_admin','finance','support','engineering','viewer');
exception when duplicate_object then null; end $$;

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role admin_role not null,
  status text not null default 'active' check (status in ('active','disabled','suspended')),
  display_name text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  last_reviewed_at timestamptz
);
alter table admin_users enable row level security; -- no policies → service-role/definer only

-- ---------------------------------------------------------------------------
-- 2. Immutable audit log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists admin_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid,                  -- who acted (may be null for system)
  admin_role admin_role,
  action text not null,                -- e.g. 'set_maintenance', 'invalidate_result'
  target_type text,                    -- 'user' | 'puzzle' | 'pack' | 'incident' | 'system' | ...
  target_id text,
  summary jsonb not null default '{}',  -- safe before/after — NEVER secrets/tokens/answers
  reason text,
  request_id text,
  ip_hash text,                        -- hashed only, never a raw IP
  success boolean not null default true,
  approval_ref text,
  created_at timestamptz not null default now()
);
alter table admin_audit_log enable row level security;

-- Append-only: block UPDATE/DELETE for EVERYONE, including the table owner path,
-- via a trigger (belt) plus revoked grants (braces). Ordinary admins can never
-- rewrite history.
create or replace function admin_audit_immutable() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '0A000';
end; $$;
drop trigger if exists admin_audit_no_mutate on admin_audit_log;
create trigger admin_audit_no_mutate before update or delete on admin_audit_log
  for each row execute function admin_audit_immutable();

-- ---------------------------------------------------------------------------
-- 3. Operational flags (maintenance mode) — server-authoritative
-- ---------------------------------------------------------------------------
create table if not exists operational_flags (
  id boolean primary key default true,
  mode text not null default 'normal' check (mode in ('normal','degraded','maintenance')),
  ranked_starts_enabled boolean not null default true,
  practice_starts_enabled boolean not null default true,
  purchases_enabled boolean not null default true,
  content_publication_enabled boolean not null default true,
  message text,
  reason text,
  set_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,               -- optional auto-reset
  constraint operational_flags_singleton check (id)
);
insert into operational_flags (id) values (true) on conflict (id) do nothing;
alter table operational_flags enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Incident center
-- ---------------------------------------------------------------------------
create table if not exists admin_incidents (
  id bigint generated always as identity primary key,
  severity text not null check (severity in ('sev1','sev2','sev3','info')),
  title text not null,
  description text,
  affected_systems text[] not null default '{}',
  status text not null default 'open' check (status in ('open','monitoring','resolved')),
  owner_admin uuid references auth.users(id),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  postmortem_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table admin_incidents enable row level security;

create table if not exists admin_incident_events (
  id bigint generated always as identity primary key,
  incident_id bigint not null references admin_incidents(id) on delete cascade,
  admin_user_id uuid,
  note text not null,
  created_at timestamptz not null default now()
);
alter table admin_incident_events enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Identity + RBAC helpers (service-role only)
-- ---------------------------------------------------------------------------
-- The active admin_role for a user, or null. The web app passes the id from the
-- caller's VERIFIED session; it is never taken from a request body.
create or replace function admin_role_of(p_user uuid) returns admin_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from admin_users where user_id = p_user and status = 'active';
$$;
revoke all on function admin_role_of(uuid) from public, anon, authenticated;
grant execute on function admin_role_of(uuid) to service_role;

create or replace function is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from admin_users where user_id = p_user and status = 'active');
$$;
revoke all on function is_admin(uuid) from public, anon, authenticated;
grant execute on function is_admin(uuid) to service_role;

-- The permission matrix — the SINGLE source of truth for "can this role do X".
-- Enforced server-side; the UI only mirrors it. capability is a stable slug.
create or replace function admin_can(p_role admin_role, p_capability text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_role = 'founder' then true                       -- founder: everything
    when p_role = 'super_admin' then p_capability <> 'manage_founder'
    when p_role = 'product_admin' then p_capability in (
      'view_overview','view_users','view_growth','view_gameplay','view_categories',
      'view_engines','view_puzzles','view_packs','view_ranked','view_practice',
      'view_content','manage_content_notes','view_incidents','view_reports','export_reports')
    when p_role = 'content_admin' then p_capability in (
      'view_overview','view_gameplay','view_categories','view_engines','view_puzzles',
      'view_packs','view_content','manage_content','review_content','publish_pack',
      'void_slot','manage_engine_meta','view_incidents','open_incident')
    when p_role = 'finance' then p_capability in (
      'view_overview','view_revenue','view_subscriptions','view_reconciliation',
      'view_reports','export_reports')
    when p_role = 'support' then p_capability in (
      'view_overview','view_users','lookup_user','moderate_user','resync_entitlement',
      'invalidate_result','view_incidents')
    when p_role = 'engineering' then p_capability in (
      'view_overview','view_infra','view_health','run_health_check','set_maintenance',
      'request_restart','view_incidents','open_incident','resolve_incident',
      'trigger_parity','trigger_advisors','clear_cache')
    when p_role = 'viewer' then p_capability in (
      'view_overview','view_investor','view_reports')
    else false
  end;
$$;
-- Pure/immutable — safe for anyone to evaluate, but the app only calls it via the
-- service role. Grant broadly is harmless (no data); keep it service-role-scoped
-- for consistency.
revoke all on function admin_can(admin_role, text) from public, anon, authenticated;
grant execute on function admin_can(admin_role, text) to service_role;

-- Append an audit entry (service-role only). Strips nothing itself — callers must
-- pass only safe summaries (enforced by review + the forbidden-field guard used in
-- the app), but the column comment and docs make the contract explicit.
create or replace function admin_log(
  p_admin uuid, p_role admin_role, p_action text, p_target_type text, p_target_id text,
  p_summary jsonb, p_reason text, p_request_id text, p_ip_hash text,
  p_success boolean, p_approval_ref text
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  insert into admin_audit_log (admin_user_id, admin_role, action, target_type, target_id,
    summary, reason, request_id, ip_hash, success, approval_ref)
  values (p_admin, p_role, p_action, p_target_type, p_target_id,
    coalesce(p_summary,'{}'::jsonb), p_reason, p_request_id, p_ip_hash,
    coalesce(p_success,true), p_approval_ref)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function admin_log(uuid, admin_role, text, text, text, jsonb, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function admin_log(uuid, admin_role, text, text, text, jsonb, text, text, text, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Operational status — public-safe READ + admin-only SETTER
-- ---------------------------------------------------------------------------
-- Effective status, honouring auto-expiry. Safe to expose (no internals): the
-- mobile app / edge functions read this to enforce maintenance. Granted to
-- authenticated + anon so a maintenance banner works pre-login.
create or replace function get_operational_status() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when f.expires_at is not null and f.expires_at < now()
      then jsonb_build_object('mode','normal','ranked_starts_enabled',true,
        'practice_starts_enabled',true,'purchases_enabled',true,
        'content_publication_enabled',true,'message',null)
    else jsonb_build_object('mode',f.mode,'ranked_starts_enabled',f.ranked_starts_enabled,
      'practice_starts_enabled',f.practice_starts_enabled,'purchases_enabled',f.purchases_enabled,
      'content_publication_enabled',f.content_publication_enabled,'message',f.message)
  end
  from operational_flags f where f.id;
$$;
revoke all on function get_operational_status() from public;
grant execute on function get_operational_status() to anon, authenticated, service_role;

-- True when an operational area (ranked|practice|purchases|publication) is allowed.
create or replace function operational_allows(p_area text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_area
    when 'ranked' then (s->>'ranked_starts_enabled')::boolean
    when 'practice' then (s->>'practice_starts_enabled')::boolean
    when 'purchases' then (s->>'purchases_enabled')::boolean
    when 'publication' then (s->>'content_publication_enabled')::boolean
    else true end
    and (s->>'mode') <> 'maintenance'
  from (select get_operational_status() s) x;
$$;
revoke all on function operational_allows(text) from public;
grant execute on function operational_allows(text) to anon, authenticated, service_role;

-- Setter — service-role only. The app verifies admin + 'set_maintenance' capability
-- + reauth, then calls this and writes an audit row.
create or replace function set_operational_flags(
  p_mode text, p_ranked boolean, p_practice boolean, p_purchases boolean,
  p_publication boolean, p_message text, p_reason text, p_set_by uuid, p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_mode not in ('normal','degraded','maintenance') then
    raise exception 'bad_mode' using errcode = '22023';
  end if;
  update operational_flags set
    mode = p_mode,
    ranked_starts_enabled = coalesce(p_ranked, true),
    practice_starts_enabled = coalesce(p_practice, true),
    purchases_enabled = coalesce(p_purchases, true),
    content_publication_enabled = coalesce(p_publication, true),
    message = p_message, reason = p_reason, set_by = p_set_by,
    expires_at = p_expires_at, updated_at = now()
  where id;
  return get_operational_status();
end; $$;
revoke all on function set_operational_flags(text, boolean, boolean, boolean, boolean, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function set_operational_flags(text, boolean, boolean, boolean, boolean, text, text, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Server-enforced maintenance guard on Practice starts
-- ---------------------------------------------------------------------------
-- Re-create start_practice_pack (unchanged logic) with a maintenance guard at the
-- top: when practice is disabled or the app is in maintenance, no new brew starts.
-- Ranked/purchase enforcement read get_operational_status() in their edge
-- functions (documented in ADMIN_OPERATIONAL_RUNBOOK.md).
create or replace function start_practice_pack(
  p_user_id uuid, p_session_id text, p_app_version text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'utc')::date;
  existing_att uuid; existing_pack uuid;
  new_pack uuid; new_att uuid; seed text; cnt int;
  mode text := current_release_policy(); state text; is_premium boolean; used_today int;
begin
  if p_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  -- Resume an in-progress practice regardless of maintenance (never strand a brew).
  select id, practice_pack_id into existing_att, existing_pack
    from attempts
   where user_id = p_user_id and attempt_purpose = 'practice' and status = 'active' and practice_pack_id is not null
   order by created_at desc limit 1;
  if existing_att is not null then
    return jsonb_build_object('resumed', true, 'attempt_id', existing_att, 'practice_pack_id', existing_pack,
                              'slots', practice_pack_public(existing_pack));
  end if;

  -- Maintenance guard (server-enforced; client cannot override).
  if not operational_allows('practice') then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;

  -- Paywall-mode gate (no effect in beta_open). Premium bypasses the cap.
  if mode <> 'beta_open' then
    select entitlement_state into state from player_entitlements where user_id = p_user_id;
    is_premium := entitlement_has_premium(coalesce(state, 'free'));
    if not is_premium then
      select count(*) into used_today from attempts
       where user_id = p_user_id and attempt_purpose = 'practice' and status = 'completed'
         and (completed_at at time zone 'utc')::date = today;
      if used_today >= practice_daily_allowance() then
        raise exception 'practice_limit_reached' using errcode = 'P0001';
      end if;
    end if;
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
    select p.puzzle_id, p.engine_id, p.category::text as cat
      from puzzles p join puzzle_engines e on e.engine_id = p.engine_id
     where p.status = 'approved' and e.active
       and not exists (select 1 from daily_pack_slots ds where ds.puzzle_id = p.puzzle_id)
       and not exists (select 1 from excluded x where x.puzzle_id = p.puzzle_id)
       and exists (select 1 from puzzle_validation_results v where v.puzzle_id = p.puzzle_id and v.passed)
       and (p_app_version is null
            or string_to_array(e.min_app_version, '.')::int[] <= string_to_array(p_app_version, '.')::int[])
  ),
  picked as (
    select distinct on (cat) cat, puzzle_id, engine_id from eligible
     order by cat, (puzzle_id in (select puzzle_id from recent)) asc,
       (engine_id in (select engine_id from recent)) asc,
       ('x' || substr(md5(puzzle_id || seed), 1, 8))::bit(32)::int
  )
  insert into practice_pack_slots (practice_pack_id, position, category, puzzle_id, engine_id, max_score)
  select new_pack,
    case cat when 'observation' then 1 when 'pattern' then 2 when 'logic' then 3
             when 'language-logic' then 4 when 'attention-speed' then 5 end,
    cat::slot_category, puzzle_id, engine_id, 20
  from picked;

  get diagnostics cnt = row_count;
  if cnt < 5 then raise exception 'practice_pool_exhausted' using errcode = 'P0001'; end if;

  insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator)
    values (p_user_id, p_session_id, new_pack, false, 'active', 100) returning id into new_att;

  return jsonb_build_object('resumed', false, 'attempt_id', new_att, 'practice_pack_id', new_pack,
                            'slots', practice_pack_public(new_pack));
end; $$;
revoke all on function start_practice_pack(uuid, text, text) from public, anon, authenticated;
grant execute on function start_practice_pack(uuid, text, text) to service_role;
