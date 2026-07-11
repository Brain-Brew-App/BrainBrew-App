-- BrainBrew — Row Level Security and grants (Phase 4A, Task 6).
--
-- Least privilege. The publishable key runs as the Postgres `anon` role, so the
-- posture below is what actually protects the answers.
--
-- Two independent locks on every private table:
--   1. GRANTs revoked from anon/authenticated — the role cannot touch the table.
--   2. RLS enabled with NO policy — even if a grant were ever added, every row
--      is denied. (No `using (true)` anywhere.)
--
-- The only anon-readable object is the sanitized `public_pack_slots` view.
-- Client writes: none in this phase.
--
-- Note: `anon`, `authenticated` and `service_role` are Supabase platform roles.
-- The local PGlite test harness creates them before applying migrations.

-- --------------------------------------------------------------------------
-- Enable RLS on every base table. No policies ⇒ deny-all for anon/authenticated.
-- --------------------------------------------------------------------------

alter table puzzle_engines            enable row level security;
alter table puzzle_seeds              enable row level security;
alter table puzzles                   enable row level security;
alter table puzzle_answers            enable row level security;
alter table puzzle_validation_results enable row level security;
alter table content_reviews           enable row level security;
alter table daily_packs               enable row level security;
alter table daily_pack_slots          enable row level security;

-- --------------------------------------------------------------------------
-- Revoke all table privileges from the public-facing roles. Defense in depth:
-- combined with RLS-deny, anon cannot read or write any base table.
-- --------------------------------------------------------------------------

revoke all on puzzle_engines,
              puzzle_seeds,
              puzzles,
              puzzle_answers,
              puzzle_validation_results,
              content_reviews,
              daily_packs,
              daily_pack_slots
  from anon, authenticated;

-- The private answer key and seeds are the crown jewels — restated explicitly
-- so an accidental future GRANT on a broad set still cannot include them.
revoke all on puzzle_answers, puzzle_seeds, content_reviews, puzzle_validation_results
  from anon, authenticated;

-- --------------------------------------------------------------------------
-- The sanitized view is the sole anon read surface.
-- --------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on public_pack_slots to anon, authenticated;

-- --------------------------------------------------------------------------
-- Privileged tooling uses the SECRET key (service_role), which bypasses RLS.
-- It is never present in the client. Grants here are explicit for clarity;
-- service_role already bypasses RLS, but least-surprise beats implicit magic.
-- --------------------------------------------------------------------------

grant all on puzzle_engines,
             puzzle_seeds,
             puzzles,
             puzzle_answers,
             puzzle_validation_results,
             content_reviews,
             daily_packs,
             daily_pack_slots
  to service_role;
