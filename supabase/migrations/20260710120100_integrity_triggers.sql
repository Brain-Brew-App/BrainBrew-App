-- BrainBrew — cross-table integrity (Phase 4A).
--
-- Invariants that a single-row CHECK cannot express, implemented as narrowly
-- scoped triggers. Each raises a specific error naming the broken rule
-- (Core Spec §5: never a silent "best effort"). Tested and mutation-tested in
-- supabase/tests and scripts/db/db-test.mjs.

-- --------------------------------------------------------------------------
-- A puzzle's category must equal its engine's category (§3).
-- --------------------------------------------------------------------------

create or replace function enforce_puzzle_engine_category() returns trigger
language plpgsql as $$
declare eng_cat category;
begin
  select category into eng_cat from puzzle_engines where engine_id = new.engine_id;
  if new.category <> eng_cat then
    raise exception 'puzzle %: category % does not match engine % category %',
      new.puzzle_id, new.category, new.engine_id, eng_cat;
  end if;
  return new;
end;
$$;

create trigger puzzle_engine_category
  before insert or update of engine_id, category on puzzles
  for each row execute function enforce_puzzle_engine_category();

-- --------------------------------------------------------------------------
-- A puzzle may only be approved with passing validation evidence AND an answer.
-- Enforces "published packs contain only approved, validator-passed puzzles"
-- at the puzzle level, so the pack level can simply require approval.
-- --------------------------------------------------------------------------

create or replace function enforce_puzzle_approval() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved' then
    if not exists (select 1 from puzzle_validation_results v
                   where v.puzzle_id = new.puzzle_id and v.passed) then
      raise exception 'puzzle % cannot be approved: no passing validation result', new.puzzle_id;
    end if;
    if not exists (select 1 from puzzle_answers a where a.puzzle_id = new.puzzle_id) then
      raise exception 'puzzle % cannot be approved: no answer key stored', new.puzzle_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger puzzle_approval_gate
  before insert or update of status on puzzles
  for each row execute function enforce_puzzle_approval();

-- --------------------------------------------------------------------------
-- A slot must agree with its puzzle (category, engine) and its puzzle must be
-- approved. A slot can never carry a draft, rejected or retired puzzle.
-- --------------------------------------------------------------------------

create or replace function enforce_slot_puzzle_agreement() returns trigger
language plpgsql as $$
declare p_cat category; p_eng text; p_status puzzle_status;
begin
  select category, engine_id, status into p_cat, p_eng, p_status
    from puzzles where puzzle_id = new.puzzle_id;

  if new.category::text <> p_cat::text then
    raise exception 'slot %/%: category % does not match puzzle % category %',
      new.pack_id, new.position, new.category, new.puzzle_id, p_cat;
  end if;
  if new.engine_id <> p_eng then
    raise exception 'slot %/%: engine % does not match puzzle % engine %',
      new.pack_id, new.position, new.engine_id, new.puzzle_id, p_eng;
  end if;
  if p_status <> 'approved' then
    raise exception 'slot %/%: puzzle % is % — only approved puzzles may be scheduled',
      new.pack_id, new.position, new.puzzle_id, p_status;
  end if;
  return new;
end;
$$;

create trigger slot_puzzle_agreement
  before insert or update of puzzle_id, engine_id, category on daily_pack_slots
  for each row execute function enforce_slot_puzzle_agreement();

-- --------------------------------------------------------------------------
-- A pack may only become approved/live/archived with exactly five valid slots
-- in the fixed category order.
-- --------------------------------------------------------------------------

create or replace function enforce_pack_completeness() returns trigger
language plpgsql as $$
declare slot_count int; correct_order int;
begin
  if new.status in ('approved', 'live', 'archived') then
    select count(*) into slot_count from daily_pack_slots where pack_id = new.pack_id;
    if slot_count <> 5 then
      raise exception 'pack % cannot be %: has % slots, needs exactly 5',
        new.pack_id, new.status, slot_count;
    end if;
    -- All five positions present, each in its required category.
    select count(*) into correct_order from daily_pack_slots
      where pack_id = new.pack_id
        and (
          (position = 1 and category = 'observation') or
          (position = 2 and category = 'pattern') or
          (position = 3 and category = 'logic') or
          (position = 4 and category = 'language-logic') or
          (position = 5 and category = 'attention-speed')
        );
    if correct_order <> 5 then
      raise exception 'pack % cannot be %: slots are not the five categories in order',
        new.pack_id, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger pack_completeness_gate
  before insert or update of status on daily_packs
  for each row execute function enforce_pack_completeness();

-- --------------------------------------------------------------------------
-- Published pack membership is immutable, except the void process.
--
-- Once a pack is live or archived:
--   * no slot may be inserted or deleted,
--   * a slot's puzzle / position / category / engine / max_score may not change,
--   * only the void columns may change, and only to void (never to un-void, and
--     never swapping the puzzle — voiding removes from scoring, it never
--     substitutes another puzzle: Core Spec §10).
-- --------------------------------------------------------------------------

create or replace function enforce_published_pack_immutable() returns trigger
language plpgsql as $$
declare pack_stat pack_status; ref_pack text;
begin
  ref_pack := coalesce(new.pack_id, old.pack_id);
  select status into pack_stat from daily_packs where pack_id = ref_pack;

  if pack_stat in ('live', 'archived') then
    if tg_op = 'INSERT' then
      raise exception 'pack % is %: no slot may be added to a published pack', ref_pack, pack_stat;
    elsif tg_op = 'DELETE' then
      raise exception 'pack % is %: no slot may be removed from a published pack', ref_pack, pack_stat;
    elsif tg_op = 'UPDATE' then
      if new.puzzle_id <> old.puzzle_id
         or new.position <> old.position
         or new.category <> old.category
         or new.engine_id <> old.engine_id
         or new.max_score <> old.max_score then
        raise exception 'pack % is %: slot membership is immutable (only the void process may change a published pack)',
          ref_pack, pack_stat;
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger published_pack_immutable
  before insert or update or delete on daily_pack_slots
  for each row execute function enforce_published_pack_immutable();

-- --------------------------------------------------------------------------
-- Voiding never substitutes a puzzle — at ANY pack status. Voiding removes a
-- slot from scoring; it never swaps in different content (Core Spec §10).
-- --------------------------------------------------------------------------

create or replace function enforce_void_no_substitution() returns trigger
language plpgsql as $$
begin
  -- A transition into the voided state must keep the same puzzle.
  if new.void_status = true and old.void_status = false then
    if new.puzzle_id <> old.puzzle_id then
      raise exception 'slot %/%: voiding must not substitute a puzzle (Core Spec §10)',
        new.pack_id, new.position;
    end if;
  end if;
  -- A voided slot is terminal: it cannot be un-voided.
  if new.void_status = false and old.void_status = true then
    raise exception 'slot %/%: a voided slot cannot be un-voided', new.pack_id, new.position;
  end if;
  return new;
end;
$$;

create trigger void_no_substitution
  before update on daily_pack_slots
  for each row execute function enforce_void_no_substitution();
