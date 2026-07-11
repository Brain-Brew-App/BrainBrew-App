-- BrainBrew — ranked daily attempts (Phase 6A).
--
-- One server-authoritative ranked result per eligible PERMANENT player per UTC
-- pack date. The database — not the UI — enforces the one-per-day rule (a partial
-- unique index) and the immutability of a completed ranked result (triggers). The
-- client can never set is_ranked, the country snapshot, the ranked date, or the
-- score. This creates trustworthy ranked RECORDS only; no leaderboard yet.

-- --------------------------------------------------------------------------
-- Ranked columns + integrity state on attempts
-- --------------------------------------------------------------------------

create type ranked_integrity as enum ('clean', 'review', 'invalidated');

-- Ranked play now exists: drop the blanket "never ranked" guard from Phase 4B.
alter table attempts drop constraint if exists not_ranked_yet;

alter table attempts
  add column ranked_date           date,
  add column country_code_snapshot text references countries(code),
  add column username_snapshot     text,
  -- Sum of active (non-void) slot max_scores at start; the normalization base.
  add column active_denominator    int,
  add column scoring_version       text,
  add column content_hash_snapshot text,
  add column integrity_status      ranked_integrity not null default 'clean',
  add column recalc_version        int not null default 0,
  add column invalidated_at        timestamptz,
  -- Private; never exposed to the client.
  add column invalidation_reason   text;

-- A ranked attempt must carry its owner, date, and country snapshot.
alter table attempts add constraint ranked_requires_fields check (
  is_ranked = false or (user_id is not null and ranked_date is not null and country_code_snapshot is not null)
);
alter table attempts add constraint active_denominator_range check (
  active_denominator is null or active_denominator between 1 and 100
);

-- THE core rule: at most one ranked attempt per user per UTC ranked date. A
-- partial unique index enforces it atomically across devices — a concurrent
-- second start hits a unique violation, never a second ranked row.
create unique index attempts_one_ranked_per_day on attempts (user_id, ranked_date) where is_ranked;

create index attempts_ranked_date_idx on attempts (ranked_date) where is_ranked;

comment on column attempts.country_code_snapshot is
  'The player country at ranked start. Immutable — later profile changes never rewrite historical ranked records.';

-- --------------------------------------------------------------------------
-- Terminal trigger: extend for ranked immutability + void recalculation.
-- A completed ranked result is immutable EXCEPT that a documented recalculation
-- (recalc_version bump) may adjust the score after a puzzle void.
-- --------------------------------------------------------------------------

create or replace function enforce_attempt_terminal() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare att_status attempt_status;
begin
  if tg_table_name = 'attempt_items' and tg_op = 'INSERT' then
    select status into att_status from attempts where id = new.attempt_id;
    if att_status <> 'active' then
      raise exception 'attempt % is %; no further items may be opened', new.attempt_id, att_status;
    end if;
  elsif tg_table_name = 'attempts' and tg_op = 'UPDATE' then
    if old.status = 'completed' and new.status <> 'completed' then
      raise exception 'attempt % is completed and cannot be reopened', old.id;
    end if;
    -- Score is final once completed, UNLESS this is a recalculation.
    if old.status = 'completed'
       and new.final_score is distinct from old.final_score
       and new.recalc_version <= old.recalc_version then
      raise exception 'attempt % is completed; its score is final', old.id;
    end if;
    -- The ranked identity (date, country snapshot, ranked flag) is immutable.
    if old.is_ranked and (
         new.is_ranked <> old.is_ranked
      or new.ranked_date is distinct from old.ranked_date
      or new.country_code_snapshot is distinct from old.country_code_snapshot
      or new.username_snapshot is distinct from old.username_snapshot
    ) then
      raise exception 'attempt % ranked identity is immutable', old.id;
    end if;
  end if;
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Profile integrity + change-tracking fields (server-controlled; no client
-- write grant exists on profiles — mutations go only through the RPCs below).
-- --------------------------------------------------------------------------

alter table profiles
  add column rank_restricted_until timestamptz,
  add column country_changed_at    timestamptz,
  add column username_changed_at   timestamptz;

comment on column profiles.rank_restricted_until is
  'Server-set integrity hold. When in the future, the player is not rank-eligible. Reason kept private.';
