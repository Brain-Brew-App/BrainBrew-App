-- BrainBrew — Analytics event ingestion (Phase 7G.2).
--
-- A private, append-only client-EVENT store for UI behaviour the database cannot
-- otherwise infer (screen views, CTA views, purchase-UI steps). Authoritative
-- business outcomes (ranked/practice completion, scores, revenue, entitlement)
-- are NEVER taken from these events — they stay derived from canonical tables.
--
-- Security posture: clients CANNOT write this table through the Data API (RLS on,
-- no policies, no grants). The ONLY writer is the service-role `ingest_analytics_
-- events` RPC, called by the analytics-ingest Edge Function AFTER it derives the
-- user from the verified JWT. Event names are allowlisted; properties are bounded
-- and scrubbed of any answer/token/email/provider field.

-- ---------------------------------------------------------------------------
-- 1. Event store
-- ---------------------------------------------------------------------------
create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  event_version int not null default 1,
  occurred_at timestamptz not null,          -- client clock (informational)
  received_at timestamptz not null default now(), -- server clock (authoritative for day-bucketing)
  user_id uuid references auth.users(id) on delete set null,
  is_anonymous boolean,
  session_id text,
  platform text check (platform in ('ios','android','web','unknown')),
  app_version text,
  build_number text,
  environment text not null default 'production',
  country_code text,
  screen text,
  category text,
  engine_id text,
  puzzle_id text,
  attempt_purpose text,
  properties jsonb not null default '{}',
  source text not null default 'client' check (source in ('client','server','derived')),
  ingestion_request_id text,
  dedup_key text,
  created_at timestamptz not null default now()
);
alter table analytics_events enable row level security; -- no policies → server-only
create index if not exists analytics_events_name_day_idx on analytics_events (event_name, received_at);
create index if not exists analytics_events_user_idx on analytics_events (user_id, received_at);
-- Dedup: a repeated client delivery with the same key is ignored.
create unique index if not exists analytics_events_dedup_idx on analytics_events (dedup_key) where dedup_key is not null;

-- ---------------------------------------------------------------------------
-- 2. Event-name allowlist (fixed taxonomy from ANALYTICS_EVENT_MODEL.md)
-- ---------------------------------------------------------------------------
create or replace function analytics_event_allowed(p_name text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select p_name in (
    -- application
    'app_opened','app_foregrounded','app_backgrounded','app_version_seen','screen_viewed',
    -- identity
    'anonymous_session_created','profile_setup_started','profile_completed',
    'secure_progress_started','account_secured_email','account_secured_google',
    -- ranked funnel (UI)
    'home_ranked_cta_viewed','ranked_start_requested','ranked_attempt_resumed','puzzle_rendered',
    'answer_submit_requested','reveal_viewed','ranked_results_viewed','leaderboard_opened',
    -- practice funnel (UI)
    'practice_cta_viewed','practice_started','practice_completed','practice_results_viewed','practice_summary_viewed',
    -- sharing
    'share_requested','share_completed','share_cancelled','share_failed',
    -- premium (UI)
    'premium_preview_viewed','offering_requested','offering_loaded','purchase_requested',
    'purchase_cancelled','purchase_client_failed','restore_requested','restore_completed'
  );
$$;

-- Property keys that must NEVER appear in an event payload (answers/identity/secrets).
create or replace function analytics_props_safe(p_props jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select not exists (
    select 1 from jsonb_object_keys(coalesce(p_props,'{}'::jsonb)) k
    where lower(k) = any (array[
      'email','password','token','auth_token','access_token','jwt','secret','api_key',
      'receipt','purchase_token','transaction_id','customer_id','app_user_id','revenuecat_app_user_id',
      'correct_answer','answer','answer_payload','submitted_answer','seed','ip','latitude','longitude','ad_id','idfa','gaid'
    ])
  ) and pg_column_size(coalesce(p_props,'{}'::jsonb)) <= 4096; -- bounded payload
$$;

-- ---------------------------------------------------------------------------
-- 3. Test/internal subject exclusion (server-controlled, not by email string)
-- ---------------------------------------------------------------------------
create table if not exists analytics_subject_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exclude_from_business_kpis boolean not null default true,
  reason text,
  environment text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table analytics_subject_flags enable row level security; -- server/admin only

create or replace function set_subject_flag(p_user uuid, p_exclude boolean, p_reason text, p_env text, p_by uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into analytics_subject_flags (user_id, exclude_from_business_kpis, reason, environment, created_by)
    values (p_user, coalesce(p_exclude,true), p_reason, p_env, p_by)
  on conflict (user_id) do update set
    exclude_from_business_kpis = excluded.exclude_from_business_kpis,
    reason = excluded.reason, environment = excluded.environment;
end; $$;
revoke all on function set_subject_flag(uuid, boolean, text, text, uuid) from public, anon, authenticated;
grant execute on function set_subject_flag(uuid, boolean, text, text, uuid) to service_role;

-- A reusable predicate: is this user excluded from business KPIs?
create or replace function analytics_excluded(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from analytics_subject_flags where user_id = p_user and exclude_from_business_kpis);
$$;
revoke all on function analytics_excluded(uuid) from public, anon, authenticated;
grant execute on function analytics_excluded(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Ingest RPC — the ONLY writer. Service-role only; user derived by the caller
--    (the Edge Function) from the verified JWT, NEVER from the event body.
-- ---------------------------------------------------------------------------
create or replace function ingest_analytics_events(p_user uuid, p_is_anon boolean, p_events jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ev jsonb; accepted int := 0; rejected int := 0;
  v_name text; v_props jsonb; v_platform text; v_dedup text;
begin
  if jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object('accepted', 0, 'rejected', 0, 'error', 'bad_batch');
  end if;
  if jsonb_array_length(p_events) > 50 then           -- batch cap
    return jsonb_build_object('accepted', 0, 'rejected', 0, 'error', 'batch_too_large');
  end if;

  for ev in select * from jsonb_array_elements(p_events) loop
    v_name := ev->>'event_name';
    v_props := coalesce(ev->'properties', '{}'::jsonb);
    v_platform := coalesce(ev->>'platform', 'unknown');
    v_dedup := ev->>'dedup_key';

    -- Validate: allowlisted name, safe/bounded props, known platform.
    if v_name is null or not analytics_event_allowed(v_name)
       or not analytics_props_safe(v_props)
       or v_platform not in ('ios','android','web','unknown') then
      rejected := rejected + 1;
      continue;
    end if;

    insert into analytics_events (
      event_name, event_version, occurred_at, user_id, is_anonymous, session_id, platform,
      app_version, build_number, environment, country_code, screen, category, engine_id,
      puzzle_id, attempt_purpose, properties, source, ingestion_request_id, dedup_key
    ) values (
      v_name, coalesce((ev->>'event_version')::int, 1),
      coalesce((ev->>'occurred_at')::timestamptz, now()),
      p_user, p_is_anon, ev->>'session_id', v_platform,
      ev->>'app_version', ev->>'build_number', coalesce(ev->>'environment','production'),
      ev->>'country_code', ev->>'screen', ev->>'category', ev->>'engine_id',
      ev->>'puzzle_id', ev->>'attempt_purpose', v_props, 'client',
      ev->>'ingestion_request_id', v_dedup
    )
    on conflict (dedup_key) where dedup_key is not null do nothing;

    if found then accepted := accepted + 1; else rejected := rejected + 1; end if; -- dup → rejected
  end loop;

  return jsonb_build_object('accepted', accepted, 'rejected', rejected);
end; $$;
revoke all on function ingest_analytics_events(uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function ingest_analytics_events(uuid, boolean, jsonb) to service_role;
