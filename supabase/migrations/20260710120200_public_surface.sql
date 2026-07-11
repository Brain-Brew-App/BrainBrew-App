-- BrainBrew — the sanitized public read surface (Phase 4A, Task 5).
--
-- `public_pack_slots` is the ONLY object the anon role may read. It exposes what
-- a client needs to *render* a puzzle and nothing it needs to *answer* one:
--   * no answer_payload, no explanation,
--   * no seeds, no validation, no reviews,
--   * only LIVE packs, and only for dates that have already arrived (never a
--     future pack), and never a voided slot.
--
-- Security here is by construction, not by omission: the view's SELECT list has
-- no answer column to leak, and its WHERE clause is the entire visibility rule.
-- The view runs with owner privileges (it must, since anon has no grant on the
-- base tables), so the WHERE clause — not RLS — is what bounds it. It is written
-- to be airtight.
--
-- In Phase 4A no pack is 'live' (imported packs are 'approved' with no date), so
-- this view returns ZERO rows. That is correct: nothing is public until a later
-- phase publishes packs to dates behind server-authoritative scoring.

create view public_pack_slots
with (security_invoker = false) as
select
  p.pack_date,
  p.difficulty_label       as pack_difficulty,
  s.position,
  s.category,
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
  and p.pack_date <= (now() at time zone 'utc')::date  -- never a future pack
  and s.void_status = false                            -- never a voided slot
  and z.status = 'approved';

comment on view public_pack_slots is
  'Sanitized public daily-pack surface. Render-only: no answers, seeds, or internals. Live, past-or-today packs only.';
