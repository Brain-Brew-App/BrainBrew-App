-- BrainBrew — Premium entitlement foundation (Phase 7D).
--
-- The ONE server-authoritative entitlement READ contract. No commerce: no
-- payments, prices, products, receipts, or provider integration. Every current
-- player resolves to the BETA policy — unlimited Practice, all current free
-- capabilities allowed, all future Premium capabilities unavailable.
--
-- No entitlement table yet. Everyone is `beta` and the policy is identical for
-- all users, so a table would be empty and add no present value. When the first
-- payment-provider webhook needs to PERSIST a real entitlement state (7E+), add a
-- private `player_entitlements` table and read it here, falling back to `beta` on a
-- missing row — an additive change that never touches this contract's shape.
--
-- PERMANENT INVARIANT: the ranked-attempt limit is a CONSTANT 1, independent of
-- entitlement state. Premium can NEVER buy an extra ranked attempt, a retry, a
-- score multiplier, a timing/leaderboard advantage, or an anti-cheat exemption.

create or replace function get_my_entitlements() returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid();
begin
  -- Granted to `authenticated` only, so the unauthenticated `anon` role is denied
  -- before reaching here; this is a defensive belt for a null identity.
  if uid is null then
    return jsonb_build_object('entitlement_state', 'free', 'locked', true);
  end if;

  -- Phase 7D beta policy — the same for every authenticated user (permanent or
  -- anonymous). Future states (free/premium/grace_period/expired) plug in here
  -- from the future player_entitlements table without changing the shape.
  return jsonb_build_object(
    'entitlement_state', 'beta',
    'entitlement_version', 1,
    'capabilities', jsonb_build_object(
      -- Free forever
      'daily_ranked_brew', true,
      'global_leaderboard', true,
      'country_leaderboard', true,
      'ranked_streaks', true,
      'basic_progress', true,
      'share_cards', true,
      'practice_access', true,
      -- Free during beta (a future free tier may cap this; Premium keeps it)
      'unlimited_practice', true,
      -- Future Premium (unavailable now)
      'archives', false,
      'category_training', false,
      'difficulty_selection', false,
      'advanced_practice_stats', false,
      'advanced_ranked_stats', false,
      'bonus_packs', false,
      'premium_themes', false,
      'private_tournaments', false
    ),
    -- The ranked limit is a constant, NEVER derived from entitlement.
    'limits', jsonb_build_object(
      'ranked_attempts_per_utc_day', 1,
      'free_practice_brews_per_period', null
    ),
    'period', null,
    'source', 'beta_policy'
  );
end;
$$;

revoke all on function get_my_entitlements() from public, anon;
grant execute on function get_my_entitlements() to authenticated;
