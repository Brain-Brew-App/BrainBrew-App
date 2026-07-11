-- BrainBrew — corrective public surface (Phase 4B, Task 2).
--
-- Phase 4A exposed `public_pack_slots` as an owner-privileged view. That works,
-- but a view's WHERE clause is its ONLY guard, and an owner view bypasses the
-- base tables' RLS — a real footgun on managed Supabase if the filter ever
-- slips. This migration replaces it with the tightest possible surface:
--
--   a SECURITY DEFINER function that takes only a date, is the SOLE thing anon
--   may execute, touches no base table anon can reach, validates the date is
--   never in the future, and returns exactly the render-safe columns — no
--   answers, seeds, validation, reviews, hashes, drafts, reserve, or future
--   packs, and no write path.
--
-- `search_path` is pinned (the security advisor flags mutable search paths).
-- Base-table grants stay revoked from anon (Phase 4A); anon gets EXECUTE on this
-- one function and nothing else.

drop view if exists public_pack_slots;

create or replace function get_public_pack(p_date date default (now() at time zone 'utc')::date)
returns table (
  pack_date       date,
  pack_difficulty text,
  "position"      int,
  category        category,
  engine_id       text,
  puzzle_id       text,
  difficulty      int,
  prompt          text,
  public_payload  jsonb,
  max_score       int
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.pack_date,
    p.difficulty_label,
    s.position,
    -- slots use the identical-labelled `slot_category` enum; normalise to `category`.
    s.category::text::category,
    s.engine_id,
    s.puzzle_id,
    z.difficulty,
    z.prompt,
    z.public_payload,
    s.max_score
  from daily_pack_slots s
  join daily_packs p on p.pack_id = s.pack_id
  join puzzles z on z.puzzle_id = s.puzzle_id
  where p.status = 'live'
    and p.pack_date is not null
    and p.pack_date = p_date
    and p_date <= (now() at time zone 'utc')::date   -- never a future pack
    and s.void_status = false                        -- never a voided slot
    and z.status = 'approved'
  order by s.position;
$$;

comment on function get_public_pack(date) is
  'The only public read surface. Render-safe columns for one LIVE, past-or-today pack. No answers. SECURITY DEFINER with a pinned search_path.';

-- anon (publishable key) may call this and nothing else. Base tables stay denied.
revoke all on function get_public_pack(date) from public;
grant execute on function get_public_pack(date) to anon, authenticated, service_role;
