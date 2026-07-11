/**
 * Builds the full set of database rows from the local canonical content.
 *
 * The single source both the importer and the parity checker use, so "what the
 * DB should contain" is computed one way. Pure and deterministic: same content
 * in, byte-identical rows out.
 *
 * Returns a structured bundle:
 *   engines[]     — puzzle_engines rows
 *   seeds[]       — puzzle_seeds rows (private)
 *   puzzles[]     — puzzles rows (public payload; no answers)
 *   answers[]     — puzzle_answers rows (private)
 *   validations[] — puzzle_validation_results rows (private)
 *   packs[]       — daily_packs rows
 *   slots[]       — daily_pack_slots rows
 *   scheduledIds  — Set of scheduled puzzle ids
 *   reserveIds    — Set of unscheduled (reserve) puzzle ids
 */

import { compilePureModules } from '../compile.mjs';
import { assertNoAnswerLeak, contentHash, packHash, seedHash, splitPuzzle } from './canonical.mjs';

const BUILDER_VERSION = 'phase3-builders';
const VALIDATOR_VERSION = 'phase3-validators';

export async function buildAllRows() {
  const { load } = compilePureModules();

  const { ALL_PUZZLES, LIBRARY } = await load('content/library.js');
  const { PACKS } = await load('data/packs.js');
  const { ENGINE_REGISTRY } = await load('content/engines.js');
  const { ENGINE_SPLIT, ALWAYS_PRIVATE_FIELDS } = await load('infrastructure/supabase/publicFields.js');
  const { validateLibrary } = await load('content/validators.js');

  // Refuse to build rows from content that does not pass its own validators.
  const problems = validateLibrary(ALL_PUZZLES);
  if (Object.keys(problems).length) {
    throw new Error(`local content does not validate; refusing to build rows: ${Object.keys(problems).join(', ')}`);
  }

  const engines = ENGINE_REGISTRY.map((e) => ({
    engine_id: e.engineId,
    category: e.category,
    name: e.name,
    active: e.active,
    build_status: e.buildStatus,
    min_difficulty: e.minDifficulty,
    max_difficulty: e.maxDifficulty,
    rotation_weight: e.rotationWeight,
    weekly_cap: e.weeklyCap,
    min_days_between: e.minDaysBetween,
    estimated_time_ms: e.estimatedTimeMs,
    ui_component: e.uiComponent,
    builder_id: e.builderId,
    validator_id: e.validatorId,
    scoring_id: e.scoringId,
    explanation_strategy: e.explanationStrategy,
    accessibility_profile: e.accessibilityProfile,
    min_app_version: e.minAppVersion,
  }));

  const seeds = [];
  const puzzles = [];
  const answers = [];
  const validations = [];

  for (const puzzle of ALL_PUZZLES) {
    const { public: pub, answer } = splitPuzzle(puzzle, ENGINE_SPLIT, ALWAYS_PRIVATE_FIELDS);
    assertNoAnswerLeak(pub, puzzle, ENGINE_SPLIT, ALWAYS_PRIVATE_FIELDS);

    const hash = contentHash(puzzle);

    // The seed is the private authoring input. Our builders are pure, so the
    // faithful "seed" for a locally-authored puzzle is the full puzzle object
    // (deterministic and sufficient to reconstruct via the builder). AI-authored
    // seeds in a future phase would store the compact rule instead.
    seeds.push({
      seed_id: puzzle.id,
      engine_id: puzzle.engineId,
      payload: puzzle,
      authored_difficulty: puzzle.difficulty,
      source_type: 'imported',
      status: 'approved',
      schema_version: 1,
      content_hash: seedHash(puzzle),
    });

    puzzles.push({
      puzzle_id: puzzle.id,
      engine_id: puzzle.engineId,
      seed_id: puzzle.id,
      category: puzzle.category,
      difficulty: puzzle.difficulty,
      prompt: puzzle.prompt,
      public_payload: pub,
      builder_version: BUILDER_VERSION,
      validator_version: VALIDATOR_VERSION,
      content_hash: hash,
      status: 'approved',
    });

    answers.push({
      puzzle_id: puzzle.id,
      answer_payload: answer,
      explanation: puzzle.explanation,
    });

    validations.push({
      puzzle_id: puzzle.id,
      validator_version: VALIDATOR_VERSION,
      passed: true,
      findings: [],
      validation_hash: hash,
      validation_source: 'local-pipeline',
    });
  }

  const scheduledIds = new Set();
  const packs = [];
  const slots = [];

  PACKS.forEach((pack, index) => {
    const orderedHashes = pack.puzzles.map((p) => contentHash(p));
    packs.push({
      pack_id: pack.id,
      pack_index: index,
      pack_date: null, // templates: no calendar date until a later phase publishes
      status: 'approved', // assembled + validated, not yet live
      content_hash: packHash(orderedHashes),
      difficulty_label: pack.difficulty,
      incident_status: 'none',
    });

    pack.puzzles.forEach((puzzle, i) => {
      scheduledIds.add(puzzle.id);
      slots.push({
        pack_id: pack.id,
        position: i + 1,
        category: puzzle.category,
        puzzle_id: puzzle.id,
        engine_id: puzzle.engineId,
        max_score: 20,
      });
    });
  });

  const reserveIds = new Set(ALL_PUZZLES.map((p) => p.id).filter((id) => !scheduledIds.has(id)));

  return { engines, seeds, puzzles, answers, validations, packs, slots, scheduledIds, reserveIds };
}
