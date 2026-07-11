-- BrainBrew — content schema (Phase 4A).
--
-- Migrations are the source of truth for the schema (docs/DATABASE_FOUNDATION.md).
-- This file creates the approved-content platform: engines, private seeds, the
-- public/private puzzle split, validation evidence, human reviews, and the
-- immutable daily packs with their five ordered slots.
--
-- The security boundary is structural, not incidental:
--   * puzzles          — public-renderable content. No answer lives here.
--   * puzzle_answers    — the answer key + explanation, in a SEPARATE table the
--                         anon role is never granted. Not a hidden column.
-- RLS and grants (a later migration) then deny anon everything except a
-- sanitized public view.

-- --------------------------------------------------------------------------
-- Enumerations (constrained text via domains/enums)
-- --------------------------------------------------------------------------

create type category as enum (
  'observation', 'pattern', 'logic', 'language-logic', 'attention-speed'
);

create type engine_build_status as enum ('built', 'planned', 'retired');
create type seed_source        as enum ('human', 'ai', 'imported');
create type seed_status        as enum ('draft', 'validated', 'approved', 'rejected', 'retired');
create type puzzle_status      as enum ('draft', 'validated', 'approved', 'retired');
create type pack_status        as enum ('draft', 'testing', 'approved', 'live', 'archived');
create type incident_level     as enum ('none', 'level_1', 'level_2', 'level_3');
create type review_decision    as enum ('approved', 'rejected', 'needs_changes');

-- Position (1..5) is welded to its category — the fixed session rhythm (§1).
create type slot_category      as enum ('observation', 'pattern', 'logic', 'language-logic', 'attention-speed');

-- --------------------------------------------------------------------------
-- updated_at helper
-- --------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- puzzle_engines — the Engine Registry (§3)
-- --------------------------------------------------------------------------

create table puzzle_engines (
  engine_id            text primary key
                         constraint engine_id_format check (engine_id ~ '^[A-Z]{3}_[0-9]{3}$'),
  category             category not null,
  name                 text not null constraint engine_name_present check (length(trim(name)) > 0),
  active               boolean not null default true,
  build_status         engine_build_status not null default 'planned',

  min_difficulty       int not null constraint min_diff_range check (min_difficulty between 1 and 5),
  max_difficulty       int not null constraint max_diff_range check (max_difficulty between 1 and 5),
  constraint difficulty_ordered check (min_difficulty <= max_difficulty),

  rotation_weight      numeric(4,2) not null default 1.0 constraint rotation_weight_positive check (rotation_weight > 0),
  weekly_cap           int not null constraint weekly_cap_positive check (weekly_cap > 0),
  min_days_between     int not null constraint min_days_nonneg check (min_days_between >= 0),
  estimated_time_ms    int not null constraint est_time_positive check (estimated_time_ms > 0),

  -- Executable-code identifiers are validated, never free text (Task 3).
  ui_component         text not null constraint ui_component_ident check (ui_component ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  builder_id           text not null constraint builder_ident check (builder_id ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  validator_id         text not null constraint validator_ident check (validator_id ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  scoring_id           text not null constraint scoring_ident check (scoring_id ~ '^[A-Za-z][A-Za-z0-9_]*$'),

  prompt_template_id   text,                      -- nullable; AI generation, future
  explanation_strategy text not null,
  accessibility_profile jsonb not null default '{}'::jsonb,
  min_app_version      text not null default '1.0.0'
                         constraint app_version_semver check (min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger engines_updated_at before update on puzzle_engines
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- puzzle_seeds — PRIVATE authoring inputs (§ CONTENT_PIPELINE)
-- --------------------------------------------------------------------------

create table puzzle_seeds (
  seed_id            text primary key
                       constraint seed_id_present check (length(trim(seed_id)) > 0),
  engine_id          text not null references puzzle_engines(engine_id),
  payload            jsonb not null,
  authored_difficulty int not null constraint seed_diff_range check (authored_difficulty between 1 and 5),
  source_type        seed_source not null,
  generation_model   text,                       -- nullable; AI, future
  prompt_version     text,                       -- nullable; AI, future
  status             seed_status not null default 'draft',
  schema_version     int not null default 1 constraint seed_schema_positive check (schema_version >= 1),
  content_hash       text not null constraint seed_hash_sha256 check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index seeds_engine_idx on puzzle_seeds(engine_id);
create trigger seeds_updated_at before update on puzzle_seeds
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- puzzles — PUBLIC-renderable content. No answer key here.
-- --------------------------------------------------------------------------

create table puzzles (
  puzzle_id        text primary key
                     constraint puzzle_id_present check (length(trim(puzzle_id)) > 0),
  engine_id        text not null references puzzle_engines(engine_id),
  seed_id          text not null references puzzle_seeds(seed_id),
  category         category not null,
  difficulty       int not null constraint puzzle_diff_range check (difficulty between 1 and 5),

  prompt           text not null constraint prompt_present check (length(trim(prompt)) > 0),
  public_payload   jsonb not null,               -- render-safe; never the answer
  builder_version  text not null,
  validator_version text not null,
  content_hash     text not null constraint puzzle_hash_sha256 check (content_hash ~ '^[a-f0-9]{64}$'),

  status           puzzle_status not null default 'draft',
  approved_at      timestamptz,
  retired_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- An approved puzzle must carry its approval timestamp; a retired one its retirement.
  constraint approved_has_timestamp check (status <> 'approved' or approved_at is not null),
  constraint retired_has_timestamp  check (status <> 'retired'  or retired_at  is not null)
);

create index puzzles_engine_idx on puzzles(engine_id);
create index puzzles_status_idx on puzzles(status);
create trigger puzzles_updated_at before update on puzzles
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- puzzle_answers — PRIVATE. The answer key and the post-answer explanation.
-- A separate table so the anon role can be denied it wholesale (Task 5).
-- --------------------------------------------------------------------------

create table puzzle_answers (
  puzzle_id      text primary key references puzzles(puzzle_id) on delete cascade,
  answer_payload jsonb not null,                 -- the correct answer, per engine
  explanation    text not null constraint explanation_present check (length(trim(explanation)) > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger answers_updated_at before update on puzzle_answers
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- puzzle_validation_results — PRIVATE. Evidence the stored puzzle passed.
-- --------------------------------------------------------------------------

create table puzzle_validation_results (
  id               uuid primary key default gen_random_uuid(),
  puzzle_id        text not null references puzzles(puzzle_id) on delete cascade,
  validator_version text not null,
  passed           boolean not null,
  findings         jsonb not null default '[]'::jsonb,
  validation_hash  text not null constraint validation_hash_sha256 check (validation_hash ~ '^[a-f0-9]{64}$'),
  validated_at     timestamptz not null default now(),
  validation_source text not null,
  -- A failing result must record why; a passing result must not invent findings.
  constraint failed_has_findings check (passed or jsonb_array_length(findings) > 0),
  constraint passed_is_clean     check (not passed or jsonb_array_length(findings) = 0)
);

create index validation_puzzle_idx on puzzle_validation_results(puzzle_id);

-- --------------------------------------------------------------------------
-- content_reviews — PRIVATE. Human review decisions.
-- --------------------------------------------------------------------------

create table content_reviews (
  id                 uuid primary key default gen_random_uuid(),
  seed_id            text references puzzle_seeds(seed_id),
  puzzle_id          text references puzzles(puzzle_id),
  decision           review_decision not null,
  reviewer_confidence int constraint review_confidence_range check (reviewer_confidence between 1 and 5),
  notes              text,
  reviewer_id        uuid,                        -- nullable until Auth/admin roles exist
  reviewed_at        timestamptz not null default now(),
  constraint review_targets_something check (seed_id is not null or puzzle_id is not null)
);

create index reviews_seed_idx on content_reviews(seed_id);
create index reviews_puzzle_idx on content_reviews(puzzle_id);

-- --------------------------------------------------------------------------
-- daily_packs — one canonical pack per UTC date (§2). Immutable once live.
-- --------------------------------------------------------------------------

create table daily_packs (
  pack_id          text primary key
                     constraint pack_id_present check (length(trim(pack_id)) > 0),
  -- Local packs are cyclic templates; pack_index is their stable identity.
  pack_index       int not null unique constraint pack_index_nonneg check (pack_index >= 0),
  -- NULL until scheduled to a real calendar date (future phase). UNIQUE when set,
  -- so no two packs can ever claim the same UTC date. (NULLs are distinct.)
  pack_date        date unique,
  status           pack_status not null default 'draft',
  published_at     timestamptz,
  content_hash     text not null constraint pack_hash_sha256 check (content_hash ~ '^[a-f0-9]{64}$'),
  difficulty_label text not null constraint pack_difficulty_label
                     check (difficulty_label in ('easier', 'standard', 'harder')),
  incident_status  incident_level not null default 'none',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A live or archived pack is published to a date; a draft one is not.
  constraint live_has_date check (status not in ('live', 'archived') or pack_date is not null),
  constraint live_has_published_at check (status not in ('live', 'archived') or published_at is not null)
);

create index packs_status_idx on daily_packs(status);
create trigger packs_updated_at before update on daily_packs
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- daily_pack_slots — the five ordered category slots.
-- --------------------------------------------------------------------------

create table daily_pack_slots (
  id           uuid primary key default gen_random_uuid(),
  pack_id      text not null references daily_packs(pack_id) on delete cascade,
  position     int not null constraint slot_position_range check (position between 1 and 5),
  category     slot_category not null,
  puzzle_id    text not null references puzzles(puzzle_id),
  engine_id    text not null references puzzle_engines(engine_id),
  max_score    int not null default 20 constraint max_score_positive check (max_score > 0),

  void_status  boolean not null default false,
  void_reason  text,
  voided_at    timestamptz,
  created_at   timestamptz not null default now(),

  -- Exactly one slot per position within a pack.
  constraint one_slot_per_position unique (pack_id, position),
  -- No duplicate puzzle within a pack…
  constraint no_duplicate_puzzle_in_pack unique (pack_id, puzzle_id),
  -- …and no puzzle scheduled into more than one pack, ever (§5 no-repeat).
  constraint puzzle_scheduled_once unique (puzzle_id),

  -- Position is welded to its category — the fixed rhythm (§1).
  constraint position_category_order check (
    (position = 1 and category = 'observation') or
    (position = 2 and category = 'pattern') or
    (position = 3 and category = 'logic') or
    (position = 4 and category = 'language-logic') or
    (position = 5 and category = 'attention-speed')
  ),

  -- Void is all-or-nothing: a voided slot records why and when.
  constraint void_consistency check (
    (void_status = false and void_reason is null and voided_at is null) or
    (void_status = true  and void_reason is not null and voided_at is not null)
  )
);

create index slots_pack_idx on daily_pack_slots(pack_id);
create index slots_puzzle_idx on daily_pack_slots(puzzle_id);
