/**
 * Puzzle, answer and result types.
 *
 * These shapes deliberately mirror what a `puzzles` row will look like once
 * content moves to Supabase (Core Spec §14), so the swap is a data-source
 * change rather than a type rewrite. Nothing here talks to a network.
 *
 * NOTE: in Phase 0/1 the correct answer lives on the client, because there is no
 * server. Core Spec §9 forbids this in every later phase.
 */

/** Level 1 — fixed forever (§3). Fixed session order, index = play order. */
export const CATEGORY_ORDER = [
  'observation',
  'pattern',
  'logic',
  'language-logic',
  'attention-speed',
] as const;

export type Category = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  observation: 'Observation',
  pattern: 'Pattern',
  logic: 'Logic',
  'language-logic': 'Language Logic',
  'attention-speed': 'Attention Speed',
};

/**
 * Level 2 — the engine. Ids match `docs/ENGINE_CATALOG.md` and become the
 * primary key of the `puzzle_engines` table (§3).
 *
 * `engineId` — not `category` — is the discriminant of the `Puzzle` union.
 * A category now holds several engines, so category no longer identifies a
 * shape. Adding an engine means adding an id here, and the exhaustive switches
 * in `engines/index.tsx` and `scoring/brewScore.ts` stop compiling until it is
 * routed and scored.
 */
export const ENGINE_IDS = [
  'OBS_001', // Odd One Out
  'OBS_003', // Rotation Match
  'OBS_004', // Pair Find
  'PAT_001', // Sequence Completion
  'PAT_002', // Matrix Completion
  'PAT_003', // Sequence Repair
  'LOG_001', // Deduction
  'LOG_002', // Balance Scales
  'LOG_003', // Ordering
  'LNG_001', // Analogy
  'LNG_002', // Odd Word Out
  'LNG_003', // Sentence Ordering
  'ATT_001', // Symbol Sweep
  'ATT_002', // Memory Flash
  'ATT_003', // Rapid Classification
] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

/**
 * Timing envelope used by the speed bonus. `parMs` earns full bonus,
 * `limitMs` earns none, linear in between. See scoring/brewScore.ts.
 */
export interface Timing {
  parMs: number;
  limitMs: number;
}

/** 1 trivial → 5 hard. Authored intent, not measured behaviour (Core Spec §7). */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

interface PuzzleBase {
  id: string;
  engineId: EngineId;
  category: Category;
  /** Human-readable engine name, e.g. "Odd One Out" — mirrors puzzle_engines.name. */
  engine: string;
  difficulty: Difficulty;
  prompt: string;
  explanation: string;
  timing: Timing;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

/** Shared by every engine whose answer is one of a list of options. */
interface MultipleChoiceBase extends PuzzleBase {
  options: ChoiceOption[];
  correctOptionId: string;
}

// =============================================================================
// OBSERVATION
// =============================================================================

export interface ObservationTile {
  id: string;
  /** Glyph, not colour: differences must survive greyscale (§13). */
  glyph: string;
}

/** `OBS_001` — one tile differs; tap it. */
export interface OddOneOutPuzzle extends PuzzleBase {
  engineId: 'OBS_001';
  category: 'observation';
  tiles: ObservationTile[];
  oddTileId: string;
  columns: number;
}

/**
 * A shape drawn as filled cells. Rows of `#` (filled) and `.` (empty).
 * Font-independent: rendered as Views, never as a glyph.
 */
export type ShapeCells = string[];

/** `OBS_003` — which candidate is the target, rotated? */
export interface RotationMatchPuzzle extends PuzzleBase {
  engineId: 'OBS_003';
  category: 'observation';
  target: ShapeCells;
  options: { id: string; cells: ShapeCells }[];
  correctOptionId: string;
}

/** `OBS_004` — exactly two tiles match; tap them both. */
export interface PairFindPuzzle extends PuzzleBase {
  engineId: 'OBS_004';
  category: 'observation';
  tiles: ObservationTile[];
  pairTileIds: [string, string];
  columns: number;
}

// =============================================================================
// PATTERN
// =============================================================================

/** `PAT_001` — what comes next? */
export interface SequenceCompletionPuzzle extends MultipleChoiceBase {
  engineId: 'PAT_001';
  category: 'pattern';
  /** Rendered as the visible run, with a trailing "?" appended by the engine. */
  sequence: string[];
}

export type FigureShape = 'circle' | 'square' | 'diamond';
export type FigureFill = 'outline' | 'half' | 'solid';

/** A matrix cell. Every attribute is shape-based — never colour (§13). */
export interface Figure {
  shape: FigureShape;
  count: 1 | 2 | 3;
  fill: FigureFill;
}

/**
 * How one attribute varies across the 3×3 grid.
 * `rowConstant` — same value along each row.
 * `colConstant` — same value down each column.
 * `latin`       — each value appears exactly once per row and once per column.
 */
export type MatrixRule = 'rowConstant' | 'colConstant' | 'latin';

/** `PAT_002` — one cell of the grid is missing; which option belongs there? */
export interface MatrixCompletionPuzzle extends MultipleChoiceBase {
  engineId: 'PAT_002';
  category: 'pattern';
  /** Nine cells, row-major. Index 8 (bottom-right) is always the blank. */
  cells: (Figure | null)[];
  rules: { shape: MatrixRule; count: MatrixRule; fill: MatrixRule };
  optionFigures: Record<string, Figure>;
}

/**
 * `PAT_003` — one term in the sequence is wrong; tap it.
 *
 * There are no options: the sequence *is* the answer space. The answer arrives
 * as a `ChoiceAnswer` whose `selectedId` is `term-<index>`.
 */
export interface SequenceRepairPuzzle extends PuzzleBase {
  engineId: 'PAT_003';
  category: 'pattern';
  /** Six terms. Exactly one is corrupted, and it is never the first or last. */
  terms: string[];
  wrongIndex: number;
  /** What the corrupted term should have been. Used by the explanation only. */
  correctTerm: string;
}

// =============================================================================
// LOGIC
// =============================================================================

/** `LOG_001` — which conclusion must follow? */
export interface DeductionPuzzle extends MultipleChoiceBase {
  engineId: 'LOG_001';
  category: 'logic';
  premises: string[];
}

/** One balanced scale: the two pans weigh the same. */
export interface Scale {
  left: string[];
  right: string[];
}

/** `LOG_002` — how many of one shape balance another? Language-free. */
export interface BalanceScalesPuzzle extends MultipleChoiceBase {
  engineId: 'LOG_002';
  category: 'logic';
  scales: Scale[];
  /** "How many `unit` balance one `subject`?" */
  query: { subject: string; unit: string };
}

/** An item the player arranges. Shared by the two ordering engines. */
export interface OrderItem {
  id: string;
  label: string;
}

/** `LOG_003` — use the clues to put four items in order. */
export interface OrderingPuzzle extends PuzzleBase {
  engineId: 'LOG_003';
  category: 'logic';
  items: OrderItem[];
  /** Each clue is load-bearing: drop any one and the answer stops being unique. */
  clues: string[];
  /** The one ordering that satisfies every clue. */
  correctOrder: string[];
}

// =============================================================================
// LANGUAGE LOGIC
// =============================================================================

/** `LNG_001` — A is to B as C is to what? */
export interface AnalogyPuzzle extends MultipleChoiceBase {
  engineId: 'LNG_001';
  category: 'language-logic';
  relation: [string, string];
}

/**
 * `LNG_002` — three words share a category; tap the one that doesn't.
 *
 * `membership` is the curated ontology for exactly these four words. It exists
 * so the validator can prove uniqueness by leave-one-out rather than trusting a
 * model's assertion that "a tomato is a vegetable" (Catalog §LNG_002).
 */
export interface OddWordOutPuzzle extends MultipleChoiceBase {
  engineId: 'LNG_002';
  category: 'language-logic';
  membership: Record<string, string[]>;
}

/**
 * `LNG_003` — four fragments make one sentence; tap them in order.
 *
 * `constraints` are the *structural* facts the validator enumerates against:
 * which fragment opens (capitalised), which closes (ends in a full stop), and
 * which fragment must follow which (a pronoun after its antecedent, a connective
 * that cannot lead). Exactly one of the 24 orderings may satisfy all of them.
 */
export interface SentenceOrderingPuzzle extends PuzzleBase {
  engineId: 'LNG_003';
  category: 'language-logic';
  fragments: OrderItem[];
  correctOrder: string[];
  constraints: {
    opensId: string;
    closesId: string;
    /** `[before, after]` — `after` may never precede `before`. */
    follows: [string, string][];
  };
}

// =============================================================================
// ATTENTION SPEED
// =============================================================================

export interface SweepSymbol {
  id: string;
  glyph: string;
  isTarget: boolean;
}

/** `ATT_001` — tap every target, ignore distractors. Multi-second (§3). */
export interface SymbolSweepPuzzle extends PuzzleBase {
  engineId: 'ATT_001';
  category: 'attention-speed';
  targetGlyph: string;
  symbols: SweepSymbol[];
  columns: number;
  durationMs: number;
}

/**
 * `ATT_002` — a short exposure, a neutral pause, then find what you saw.
 *
 * The pause is a *neutral surface at the app's own background luminance*, never
 * a white frame. That is a §13 hard requirement, not a preference — a bright
 * flash between two dark screens is exactly the flashing content the spec
 * forbids.
 */
export interface MemoryFlashPuzzle extends PuzzleBase {
  engineId: 'ATT_002';
  category: 'attention-speed';
  /** 3–5 glyphs, shown in this order. */
  targets: string[];
  board: ObservationTile[];
  /** Board tiles carrying the targets, in the order the targets were shown. */
  targetIds: string[];
  columns: number;
  /** Floor of 1500ms: reading speed and saccade latency vary widely. */
  exposureMs: number;
  intervalMs: number;
  /** Difficulty 5 only: the targets must be tapped back in the order shown. */
  orderMatters: boolean;
}

export interface ClassificationItem {
  id: string;
  glyph: string;
  /** Index into `buckets`. */
  bucket: 0 | 1;
}

/** `ATT_003` — sort each symbol into one of two groups before time runs out. */
export interface RapidClassificationPuzzle extends PuzzleBase {
  engineId: 'ATT_003';
  category: 'attention-speed';
  /** The question restated above the buttons, e.g. "Does it have a curved edge?" */
  rule: string;
  buckets: [string, string];
  items: ClassificationItem[];
  durationMs: number;
}

// =============================================================================

export type Puzzle =
  | OddOneOutPuzzle
  | RotationMatchPuzzle
  | PairFindPuzzle
  | SequenceCompletionPuzzle
  | MatrixCompletionPuzzle
  | SequenceRepairPuzzle
  | DeductionPuzzle
  | BalanceScalesPuzzle
  | OrderingPuzzle
  | AnalogyPuzzle
  | OddWordOutPuzzle
  | SentenceOrderingPuzzle
  | SymbolSweepPuzzle
  | MemoryFlashPuzzle
  | RapidClassificationPuzzle;

/**
 * The five puzzles a player receives for a date (§2: identical for everyone).
 *
 * A pack does not carry its own date: the local pool maps date → pack
 * deterministically (see data/dailyPack.ts). When packs move to Supabase, a
 * `daily_packs` row supplies the date and this stays the payload.
 */
export interface DailyPack {
  id: string;
  /** Authoring note, shown only in the dev pack switcher. */
  difficulty: 'easier' | 'standard' | 'harder';
  puzzles: Puzzle[];
}

// --- Answers ---------------------------------------------------------------

/** Every engine whose answer is a single option (or a single tile). */
export interface ChoiceAnswer {
  kind: 'choice';
  /** null when the player ran out of time or skipped. */
  selectedId: string | null;
  elapsedMs: number;
}

/**
 * An ordered list of ids. One shape, four engines, each reading it differently —
 * and `scorePuzzle` is the only place that knows which:
 *
 *   `OBS_004` Pair Find        — an unordered set of two; all-or-nothing.
 *   `LOG_003` Ordering         — a full ordering; credit per correct position.
 *   `LNG_003` Sentence Ordering— the same.
 *   `ATT_002` Memory Flash     — a chosen subset; ordered only at difficulty 5.
 *
 * Before this existed, Pair Find had a bespoke `pair` kind that was the same
 * data with a narrower name.
 */
export interface SequenceAnswer {
  kind: 'sequence';
  selectedIds: string[];
  elapsedMs: number;
}

/**
 * Symbol Sweep reports partial performance, not a single choice.
 *
 * `hits`/`falsePositives` are the LOCAL-mode aggregates (the client has the
 * answer key). `tappedIds` is the RAW interaction — the tiles the player tapped,
 * in tap order — and is what cloud mode submits, because a cloud client never
 * learns which tiles were targets. Both are always emitted; the local scorer
 * reads the aggregates, the cloud mapper reads the raw ids.
 */
export interface SweepAnswer {
  kind: 'sweep';
  hits: number;
  falsePositives: number;
  totalTargets: number;
  /** Raw: the symbol ids the player tapped (for server-authoritative scoring). */
  tappedIds: string[];
  elapsedMs: number;
}

/**
 * Rapid Classification: how many were attempted, and how many of those right.
 *
 * As with sweep, `correct`/`attempted`/`total` are the local aggregates and
 * `classifications` is the raw per-item choice the server scores in cloud mode.
 */
export interface ClassifyAnswer {
  kind: 'classify';
  correct: number;
  attempted: number;
  total: number;
  /** Raw: each item the player classified, in order, with the bucket they chose. */
  classifications: { itemId: string; bucket: 0 | 1 }[];
  elapsedMs: number;
}

export type Answer = ChoiceAnswer | SequenceAnswer | SweepAnswer | ClassifyAnswer;

// --- Results ---------------------------------------------------------------

/** One scored puzzle. Produced only by scoring/brewScore.ts. */
export interface CategoryResult {
  puzzleId: string;
  engineId: EngineId;
  category: Category;
  engine: string;
  correct: boolean;
  accuracyPoints: number;
  speedPoints: number;
  /** accuracyPoints + speedPoints, 0–20. */
  points: number;
  elapsedMs: number;
}

/** Final session outcome. `total` is the BrewScore, 0–100. */
export interface BrewScore {
  total: number;
  results: CategoryResult[];
  totalElapsedMs: number;
}
