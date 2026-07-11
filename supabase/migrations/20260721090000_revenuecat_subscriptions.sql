-- BrainBrew — RevenueCat subscription synchronization (Phase 7E).
--
-- Persists provider-synchronized subscription state and turns get_my_entitlements
-- into a real (policy × provider-state) decision. NO commerce logic lives on the
-- client: the client SDK may update UI fast, but this database — written only by a
-- service-role webhook after an authenticated provider fetch — is authoritative
-- for every protected server feature.
--
-- PERMANENT FAIRNESS INVARIANT (unchanged): ranked_attempts_per_utc_day is a hard
-- constant 1 for EVERY entitlement state (beta/free/premium/trial/grace_period/
-- billing_issue/expired/revoked). No subscription state, grace, or promo ever
-- grants a ranked attempt, retry, score, weighting, timing, or eligibility change.

-- ---------------------------------------------------------------------------
-- 1. Release policy mode — the explicit server switch (never inferred from build)
-- ---------------------------------------------------------------------------
-- beta_open (today, everyone keeps unlimited beta Practice; purchases testable),
-- sandbox_paywall (isolated test users only), production_paywall (defined, NOT
-- activated). A one-row table; changed only by the Founder via a service-role tool.
create table if not exists release_policy (
  id boolean primary key default true,
  mode text not null default 'beta_open'
    check (mode in ('beta_open', 'sandbox_paywall', 'production_paywall')),
  updated_at timestamptz not null default now(),
  constraint release_policy_singleton check (id)
);
insert into release_policy (id, mode) values (true, 'beta_open')
  on conflict (id) do nothing;
alter table release_policy enable row level security; -- no policies → definer-only

-- Read the current mode from inside SECURITY DEFINER functions (owner rights).
create or replace function current_release_policy() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select mode from release_policy where id), 'beta_open');
$$;
revoke all on function current_release_policy() from public, anon, authenticated;
grant execute on function current_release_policy() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Canonical per-user entitlement row (provider-synchronized)
-- ---------------------------------------------------------------------------
-- One row per user = current entitlement. Rebuildable from RevenueCat subscriber
-- state. NEVER stores a receipt, payment token, card, secret, or public customer
-- id. The RevenueCat App User ID is, by contract, the Auth UUID itself.
create table if not exists player_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entitlement_state text not null default 'free'
    check (entitlement_state in ('beta','free','premium','grace_period','billing_issue','expired','revoked')),
  source text not null default 'revenuecat',
  revenuecat_entitlement_id text,
  revenuecat_product_id text,
  revenuecat_store text,
  is_active boolean not null default false,
  will_renew boolean not null default false,
  period_type text,                    -- normal | trial | intro
  purchased_at timestamptz,
  original_purchased_at timestamptz,
  current_period_end timestamptz,
  grace_period_end timestamptz,
  unsubscribe_detected_at timestamptz,
  billing_issue_detected_at timestamptz,
  revoked_at timestamptz,
  expiration_reason text,
  latest_event_id text,
  -- Provider event time of the state that produced this row — the ordering key
  -- that stops a stale/out-of-order webhook from regressing a newer state.
  source_updated_at timestamptz not null default now(),
  entitlement_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table player_entitlements enable row level security; -- no policies → no client read/write

-- ---------------------------------------------------------------------------
-- 3. Webhook event audit / idempotency (no personal or payment payload)
-- ---------------------------------------------------------------------------
create table if not exists revenuecat_webhook_events (
  event_id text primary key,           -- RevenueCat event id → idempotency key
  event_type text,
  app_user_id_fingerprint text,        -- sha256 hash, never the raw id/email
  status text not null default 'received'
    check (status in ('received','processed','duplicate','quarantined','error')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table revenuecat_webhook_events enable row level security; -- definer/service-role only

-- Claim an event for processing. Returns true for a NEW event id (first delivery)
-- OR for a PREVIOUSLY-ERRORED event (so a RevenueCat retry can reprocess a
-- transient failure). A successfully-processed / duplicate / quarantined event
-- returns false so the caller skips reprocessing — that is the idempotency lock.
create or replace function claim_webhook_event(
  p_event_id text, p_event_type text, p_fingerprint text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare affected int := 0;
begin
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'bad_event' using errcode = '22023';
  end if;
  insert into revenuecat_webhook_events (event_id, event_type, app_user_id_fingerprint)
    values (p_event_id, p_event_type, p_fingerprint)
    on conflict (event_id) do update
      set status = 'received', received_at = now()
      where revenuecat_webhook_events.status = 'error'; -- only re-claim failed events
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;
revoke all on function claim_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function claim_webhook_event(text, text, text) to service_role;

create or replace function finish_webhook_event(
  p_event_id text, p_status text, p_error text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update revenuecat_webhook_events
     set status = p_status, error_code = p_error, processed_at = now()
   where event_id = p_event_id;
end;
$$;
revoke all on function finish_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function finish_webhook_event(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Idempotent, out-of-order-safe entitlement upsert (service-role only)
-- ---------------------------------------------------------------------------
-- Called by the webhook AFTER it has fetched the authoritative subscriber state
-- from RevenueCat. Quarantines an unknown/invalid user rather than attaching state
-- to an arbitrary row. Rejects a stale event (older source_updated_at) so a
-- delayed CANCELLATION cannot clobber a newer RENEWAL.
create or replace function sync_player_entitlement(p_user_id uuid, p_state text, p_fields jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_src timestamptz := coalesce((p_fields->>'source_updated_at')::timestamptz, now());
  v_event text := p_fields->>'latest_event_id';
  v_existing_src timestamptz;
  v_existing_event text;
begin
  -- Quarantine unknown users — never create/attach an arbitrary entitlement.
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('applied', false, 'reason', 'unknown_user');
  end if;
  if p_state not in ('beta','free','premium','grace_period','billing_issue','expired','revoked') then
    return jsonb_build_object('applied', false, 'reason', 'bad_state');
  end if;

  select source_updated_at, latest_event_id into v_existing_src, v_existing_event
    from player_entitlements where user_id = p_user_id;

  if v_existing_event is not null and v_event is not null and v_existing_event = v_event then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event'); -- already applied
  end if;
  if v_existing_src is not null and v_src < v_existing_src then
    return jsonb_build_object('applied', false, 'reason', 'stale_event');     -- out-of-order
  end if;

  insert into player_entitlements as pe (
    user_id, entitlement_state, source, revenuecat_entitlement_id, revenuecat_product_id,
    revenuecat_store, is_active, will_renew, period_type, purchased_at, original_purchased_at,
    current_period_end, grace_period_end, unsubscribe_detected_at, billing_issue_detected_at,
    revoked_at, expiration_reason, latest_event_id, source_updated_at, updated_at
  ) values (
    p_user_id, p_state, coalesce(p_fields->>'source','revenuecat'),
    p_fields->>'revenuecat_entitlement_id', p_fields->>'revenuecat_product_id',
    p_fields->>'revenuecat_store',
    coalesce((p_fields->>'is_active')::boolean, false),
    coalesce((p_fields->>'will_renew')::boolean, false),
    p_fields->>'period_type',
    (p_fields->>'purchased_at')::timestamptz, (p_fields->>'original_purchased_at')::timestamptz,
    (p_fields->>'current_period_end')::timestamptz, (p_fields->>'grace_period_end')::timestamptz,
    (p_fields->>'unsubscribe_detected_at')::timestamptz, (p_fields->>'billing_issue_detected_at')::timestamptz,
    (p_fields->>'revoked_at')::timestamptz, p_fields->>'expiration_reason',
    v_event, v_src, now()
  )
  on conflict (user_id) do update set
    entitlement_state = excluded.entitlement_state,
    source = excluded.source,
    revenuecat_entitlement_id = excluded.revenuecat_entitlement_id,
    revenuecat_product_id = excluded.revenuecat_product_id,
    revenuecat_store = excluded.revenuecat_store,
    is_active = excluded.is_active,
    will_renew = excluded.will_renew,
    period_type = excluded.period_type,
    purchased_at = excluded.purchased_at,
    original_purchased_at = excluded.original_purchased_at,
    current_period_end = excluded.current_period_end,
    grace_period_end = excluded.grace_period_end,
    unsubscribe_detected_at = excluded.unsubscribe_detected_at,
    billing_issue_detected_at = excluded.billing_issue_detected_at,
    revoked_at = excluded.revoked_at,
    expiration_reason = excluded.expiration_reason,
    latest_event_id = excluded.latest_event_id,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  return jsonb_build_object('applied', true, 'entitlement_state', p_state);
end;
$$;
revoke all on function sync_player_entitlement(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function sync_player_entitlement(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Capability policy — the single (mode × state) → capabilities decision
-- ---------------------------------------------------------------------------
-- A state has the "premium capability" when it is an actively-entitled state.
-- Grace period and billing-issue keep Premium while RevenueCat still reports the
-- entitlement active; expired/revoked/free do not. beta is the open-beta state.
create or replace function entitlement_has_premium(p_state text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select p_state in ('premium','grace_period','billing_issue');
$$;

-- ---------------------------------------------------------------------------
-- 6. get_my_entitlements — authoritative read (policy × provider state)
-- ---------------------------------------------------------------------------
create or replace function get_my_entitlements() returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
  mode text := current_release_policy();
  pe player_entitlements%rowtype;
  has_row boolean := false;
  state text;
  is_premium boolean;
  unlimited boolean;
  src text;
begin
  if uid is null then
    return jsonb_build_object('entitlement_state', 'free', 'locked', true);
  end if;

  select * into pe from player_entitlements where user_id = uid;
  has_row := found;

  -- Resolve the effective state: a provider row wins; otherwise the policy default.
  if has_row then
    state := pe.entitlement_state;
  elsif mode = 'beta_open' then
    state := 'beta';
  else
    state := 'free';
  end if;

  is_premium := entitlement_has_premium(state);

  -- Unlimited Practice: in beta_open everyone keeps it; under a paywall mode it is
  -- a Premium capability. (The Premium FEATURE capabilities below stay false in 7E
  -- because their features are not built yet — "disabled unless explicitly ready".)
  if mode = 'beta_open' then
    unlimited := true;
  else
    unlimited := is_premium;
  end if;

  -- Sanitized source label — never the store, product, customer, or app-user id.
  if has_row then src := 'subscription';
  elsif mode = 'beta_open' then src := 'beta_policy';
  else src := 'free_policy';
  end if;

  return jsonb_build_object(
    'entitlement_state', state,
    'entitlement_version', 1,
    'policy_mode', mode,
    'capabilities', jsonb_build_object(
      'daily_ranked_brew', true,
      'global_leaderboard', true,
      'country_leaderboard', true,
      'ranked_streaks', true,
      'basic_progress', true,
      'share_cards', true,
      'practice_access', true,
      'unlimited_practice', unlimited,
      -- Future Premium FEATURES — not built in 7E, so still unavailable to all.
      'archives', false,
      'category_training', false,
      'difficulty_selection', false,
      'advanced_practice_stats', false,
      'advanced_ranked_stats', false,
      'bonus_packs', false,
      'premium_themes', false,
      'private_tournaments', false
    ),
    -- FAIRNESS INVARIANT: a hard constant 1 in every state.
    'limits', jsonb_build_object(
      'ranked_attempts_per_utc_day', 1,
      'free_practice_brews_per_period', case when unlimited then null else practice_daily_allowance() end
    ),
    -- Safe, non-identifying subscription facts for lifecycle UI.
    'subscription', case when has_row then jsonb_build_object(
      'is_active', pe.is_active,
      'will_renew', pe.will_renew,
      'period_type', pe.period_type,
      'current_period_end', pe.current_period_end,
      'in_grace_period', state = 'grace_period',
      'billing_issue', state = 'billing_issue'
    ) else null end,
    'source', src
  );
end;
$$;
revoke all on function get_my_entitlements() from public, anon;
grant execute on function get_my_entitlements() to authenticated;

-- The free-tier Practice allowance under a paywall mode (documented, small, and
-- only ever reached in sandbox/production paywall — beta_open returns unlimited).
create or replace function practice_daily_allowance() returns int
language sql immutable set search_path = pg_catalog, pg_temp as $$ select 1; $$;

-- ---------------------------------------------------------------------------
-- 7. Policy-aware Practice start — enforcement lives on the SERVER
-- ---------------------------------------------------------------------------
-- beta_open: unchanged, unlimited for everyone. Under a paywall mode a
-- non-Premium user is capped at practice_daily_allowance() unranked brews per UTC
-- day; a Premium user is unlimited. Ranked is NEVER affected. The client cannot
-- override this — the cap is counted from canonical attempts here.
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
  mode text := current_release_policy();
  state text;
  is_premium boolean;
  used_today int;
begin
  if p_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  -- Resume an in-progress practice regardless of policy (never strand an active brew).
  select id, practice_pack_id into existing_att, existing_pack
    from attempts
   where user_id = p_user_id and attempt_purpose = 'practice' and status = 'active' and practice_pack_id is not null
   order by created_at desc limit 1;
  if existing_att is not null then
    return jsonb_build_object('resumed', true, 'attempt_id', existing_att, 'practice_pack_id', existing_pack,
                              'slots', practice_pack_public(existing_pack));
  end if;

  -- Paywall-mode gate (no effect in beta_open). Premium bypasses the cap.
  if mode <> 'beta_open' then
    select entitlement_state into state from player_entitlements where user_id = p_user_id;
    is_premium := entitlement_has_premium(coalesce(state, 'free'));
    if not is_premium then
      select count(*) into used_today
        from attempts
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
      from puzzles p
      join puzzle_engines e on e.engine_id = p.engine_id
     where p.status = 'approved'
       and e.active
       and not exists (select 1 from daily_pack_slots ds where ds.puzzle_id = p.puzzle_id)
       and not exists (select 1 from excluded x where x.puzzle_id = p.puzzle_id)
       and exists (select 1 from puzzle_validation_results v where v.puzzle_id = p.puzzle_id and v.passed)
       and (p_app_version is null
            or string_to_array(e.min_app_version, '.')::int[] <= string_to_array(p_app_version, '.')::int[])
  ),
  picked as (
    select distinct on (cat) cat, puzzle_id, engine_id
      from eligible
     order by cat,
       (puzzle_id in (select puzzle_id from recent)) asc,
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

-- A service-role-only setter so the Founder tool can flip the release policy mode
-- without a raw table write. Anonymous/authenticated can never change policy.
create or replace function set_release_policy(p_mode text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_mode not in ('beta_open','sandbox_paywall','production_paywall') then
    raise exception 'bad_mode' using errcode = '22023';
  end if;
  update release_policy set mode = p_mode, updated_at = now() where id;
  return p_mode;
end;
$$;
revoke all on function set_release_policy(text) from public, anon, authenticated;
grant execute on function set_release_policy(text) to service_role;
