-- Phase 7J — a lapsed subscription must stop granting Premium (fail closed).
--
-- Found during Test Store certification. `get_my_entitlements` and
-- `player_can_archive` both read `player_entitlements.entitlement_state` verbatim,
-- so once a subscription's period ended the row still said `premium` and the player
-- kept Premium — and the Archives capability — until a webhook or a reconcile
-- happened to correct it. On the Test Store that window is blatant (subscriptions
-- last five minutes); in production it is however long a webhook takes to arrive, or
-- forever if webhooks are misconfigured. Access outliving the period that was paid
-- for is a correctness defect, so the read path now expires it.
--
-- This is deliberately a READ-time clamp, never a write: RevenueCat (via the webhook
-- and reconcile) stays the sole authority for what is STORED. The clamp only ensures
-- we never grant MORE than the stored state justifies.
--
-- Fairness is untouched: ranked_attempts_per_utc_day remains the hard constant 1,
-- and Archive attempts remain unranked.

-- ---------------------------------------------------------------------------
-- Canonical effective state — the ONE place expiry is decided.
-- ---------------------------------------------------------------------------
create or replace function effective_entitlement_state(p_user uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  pe player_entitlements%rowtype;
begin
  select * into pe from player_entitlements where user_id = p_user;
  if not found then
    return case when current_release_policy() = 'beta_open' then 'beta' else 'free' end;
  end if;

  -- `premium`/`billing_issue` end at current_period_end, unless a grace period is
  -- still running. `grace_period` ends at grace_period_end.
  if pe.entitlement_state in ('premium', 'billing_issue')
     and pe.current_period_end is not null
     and pe.current_period_end <= now()
     and (pe.grace_period_end is null or pe.grace_period_end <= now())
  then
    return 'expired';
  end if;
  if pe.entitlement_state = 'grace_period'
     and pe.grace_period_end is not null
     and pe.grace_period_end <= now()
  then
    return 'expired';
  end if;

  return pe.entitlement_state;
end; $$;
revoke all on function effective_entitlement_state(uuid) from public, anon, authenticated;

-- The archive gate now expires with the subscription, at the same instant.
create or replace function player_can_archive(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select entitlement_has_premium(effective_entitlement_state(p_user));
$$;

create or replace function get_my_entitlements() returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid(); mode text := current_release_policy();
  pe player_entitlements%rowtype; has_row boolean := false; state text; is_premium boolean; unlimited boolean; src text;
  active boolean := false;
begin
  if uid is null then return jsonb_build_object('entitlement_state','free','locked',true); end if;
  select * into pe from player_entitlements where user_id = uid; has_row := found;

  state := effective_entitlement_state(uid);          -- clamped: never outlives the period paid for
  if has_row then
    -- is_active must agree with the clamped state, or the UI would say "active"
    -- under an expired badge.
    active := pe.is_active and entitlement_has_premium(state);
  end if;

  is_premium := entitlement_has_premium(state);
  if mode = 'beta_open' then unlimited := true; else unlimited := is_premium; end if;
  if has_row then src := 'subscription'; elsif mode = 'beta_open' then src := 'beta_policy'; else src := 'free_policy'; end if;
  return jsonb_build_object(
    'entitlement_state', state, 'entitlement_version', 1, 'policy_mode', mode,
    'capabilities', jsonb_build_object(
      'daily_ranked_brew', true, 'global_leaderboard', true, 'country_leaderboard', true,
      'ranked_streaks', true, 'basic_progress', true, 'share_cards', true, 'practice_access', true,
      'unlimited_practice', unlimited,
      'archives', is_premium,                       -- 7J: real Premium subscribers only
      'category_training', false, 'difficulty_selection', false, 'advanced_practice_stats', false,
      'advanced_ranked_stats', false, 'bonus_packs', false, 'premium_themes', false, 'private_tournaments', false),
    'limits', jsonb_build_object(
      'ranked_attempts_per_utc_day', 1,             -- FAIRNESS INVARIANT: hard constant 1
      'free_practice_brews_per_period', case when unlimited then null else practice_daily_allowance() end),
    'subscription', case when has_row then jsonb_build_object(
      'is_active', active, 'will_renew', pe.will_renew, 'period_type', pe.period_type,
      'current_period_end', pe.current_period_end, 'in_grace_period', state = 'grace_period', 'billing_issue', state = 'billing_issue')
      else null end,
    'source', src);
end; $$;
revoke all on function get_my_entitlements() from public, anon;
grant execute on function get_my_entitlements() to authenticated;
