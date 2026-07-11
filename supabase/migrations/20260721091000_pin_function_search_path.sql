-- Pin search_path on the two immutable helper functions (Phase 7E follow-up).
-- The 20260721090000 migration created them without a pinned search_path, which
-- the Supabase security advisor flags (function_search_path_mutable). They touch
-- no tables, so an empty/pg_catalog search_path is correct. This migration makes
-- the already-applied remote functions match the (now-patched) original.

alter function entitlement_has_premium(text) set search_path = pg_catalog, pg_temp;
alter function practice_daily_allowance() set search_path = pg_catalog, pg_temp;
