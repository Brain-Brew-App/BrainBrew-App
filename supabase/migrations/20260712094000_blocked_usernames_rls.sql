-- BrainBrew — RLS on blocked_usernames (Phase 5B advisor fix).
--
-- The moderation blocklist is read only by `validate_username` (SECURITY
-- DEFINER, owner — bypasses RLS). No API role needs direct access. Enable RLS
-- with NO policy (deny-by-default) and revoke API grants, clearing the Security
-- Advisor's `rls_disabled_in_public` error without changing behaviour.

alter table blocked_usernames enable row level security;
revoke all on blocked_usernames from anon, authenticated;
grant all on blocked_usernames to service_role;
