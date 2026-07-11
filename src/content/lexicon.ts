/**
 * The curated ontologies. Human-owned, slow-growing, and the reason the content
 * pipeline can validate itself.
 *
 * Nothing in this file is generated. A model may one day *choose* entries from
 * here; it may never *add* to it, and it may never assert a fact that lives
 * here. That distinction is the whole safety property: a model will happily
 * claim a tomato is a vegetable, and the validator would believe it.
 *
 * See docs/CONTENT_PIPELINE.md §4.
 */

// =============================================================================
// Glyphs
// =============================================================================

/**
 * Odd One Out families. Within a family, any two members differ only by
 * orientation or internal detail — never by hue, and never by fill alone where
 * fill is the *only* difference at a glance.
 *
 * Every glyph here must be verified on real iOS and Android hardware before it
 * enters generation (Catalog §7 risk 1). Families are ordered by how reliably
 * they render.
 */
export const GLYPH_FAMILIES = {
  halfCircles: ['◐', '◑', '◒', '◓'],
  cornerTriangles: ['◤', '◥', '◣', '◢'],
  triangles: ['△', '▽', '◁', '▷'],
  filledTriangles: ['▲', '▼', '◀', '▶'],
  circledOps: ['⊕', '⊗', '⊙', '⊘'],
  halfSquares: ['◧', '◨', '◩', '◪'],
  quarters: ['◔', '◕', '◷', '◶'],
} as const;

export type GlyphFamily = keyof typeof GLYPH_FAMILIES;

/**
 * Glyphs that render reliably everywhere we have checked, safe for grids where
 * the player must scan many of them at speed.
 */
export const SWEEP_GLYPHS = ['●', '○', '■', '□', '▲', '△', '▼', '▽', '◆', '◇'] as const;

/** The alphabet Pair Find draws from. All shape-distinct at 48dp. */
export const PAIR_GLYPHS = [
  '●', '○', '■', '□', '▲', '△', '▼', '▽', '◆', '◇',
  '◐', '◑', '◒', '◓', '⊕', '⊗', '⊙', '⊘', '◤', '◥', '◣', '◢',
] as const;

// =============================================================================
// Rapid Classification: total, unambiguous rules over a closed alphabet
// =============================================================================

/**
 * Each rule must be *total* over its alphabet — every glyph has exactly one
 * correct bucket, and no glyph is arguable. A diamond is not "curved"; a
 * half-filled circle is not in any alphabet here, because "is it filled?" would
 * have no answer for it.
 */
export interface ClassificationRule {
  key: string;
  question: string;
  buckets: [string, string];
  alphabet: readonly string[];
  /** Returns the index into `buckets`. */
  bucketOf: (glyph: string) => 0 | 1;
}

const CURVED = new Set(['●', '○']);
const FILLED = new Set(['●', '■', '▲', '▼', '◆']);
const POINTS_UP = new Set(['▲', '△']);

export const CLASSIFICATION_RULES: Record<string, ClassificationRule> = {
  curved: {
    key: 'curved',
    question: 'Does the symbol have a curved edge?',
    buckets: ['Curved', 'Straight'],
    alphabet: ['●', '○', '■', '□', '▲', '△', '▼', '▽', '◆', '◇'],
    bucketOf: (g) => (CURVED.has(g) ? 0 : 1),
  },
  filled: {
    key: 'filled',
    question: 'Is the symbol filled in?',
    buckets: ['Filled', 'Hollow'],
    alphabet: ['●', '○', '■', '□', '▲', '△', '▼', '▽', '◆', '◇'],
    bucketOf: (g) => (FILLED.has(g) ? 0 : 1),
  },
  pointsUp: {
    key: 'pointsUp',
    question: 'Does the triangle point upward?',
    buckets: ['Points up', 'Points down'],
    alphabet: ['▲', '△', '▼', '▽'],
    bucketOf: (g) => (POINTS_UP.has(g) ? 0 : 1),
  },
};

// =============================================================================
// Deduction: logical forms and their culture-neutral skins
// =============================================================================

/**
 * The logic is computed from the form; only the nouns are authored. Distractors
 * are drawn from the fallacy catalogue, never invented — a random wrong answer
 * makes every puzzle easy.
 */
export type DeductionForm =
  | 'BARBARA' // Every A is a B. Every B is C. ⊢ Every A is C.
  | 'CELARENT' // Every A is B. Nothing B is C. ⊢ No A is C.
  | 'MODUS_TOLLENS' // If P then Q. ¬Q. ⊢ ¬P.
  | 'DISJUNCTIVE' // P or Q. ¬Q. ⊢ P.
  | 'RESTATEMENT_TRAP'; // Every A is a B. Some Bs are C. ⊢ (only) Every A is a B.

/** BARBARA / CELARENT / RESTATEMENT_TRAP. All phrases singular; no article games. */
export interface SyllogismScenario {
  form: 'BARBARA' | 'CELARENT' | 'RESTATEMENT_TRAP';
  /** Singular noun phrase, e.g. "book on the top shelf". */
  a: string;
  /** BARBARA/TRAP: singular noun ("hardcover"). CELARENT: predicate ("ripe"). */
  b: string;
  /** Plural of `b`. Required by RESTATEMENT_TRAP's second premise. */
  bPlural?: string;
  /** Predicate phrase, e.g. "bound in cloth". */
  c: string;
}

/** MODUS_TOLLENS / DISJUNCTIVE. Negations are authored, never machine-formed. */
export interface ConditionalScenario {
  form: 'MODUS_TOLLENS' | 'DISJUNCTIVE';
  p: string;
  q: string;
  notQ: string;
  notP: string;
  /** Two irrelevant-but-plausible claims. Never entailed, never contradicted. */
  noise: [string, string];
}

export type DeductionScenario = SyllogismScenario | ConditionalScenario;

export const DEDUCTION_SCENARIOS: DeductionScenario[] = [
  // BARBARA — universal chain
  { form: 'BARBARA', a: 'book on the top shelf', b: 'hardcover', c: 'bound in cloth' },
  { form: 'BARBARA', a: 'key in the drawer', b: 'brass key', c: 'made of metal' },
  { form: 'BARBARA', a: 'chair in the hall', b: 'folding chair', c: 'able to be stacked' },
  { form: 'BARBARA', a: 'lamp in the study', b: 'oil lamp', c: 'able to be refilled' },
  { form: 'BARBARA', a: 'jar on the counter', b: 'sealed jar', c: 'airtight' },

  // CELARENT — no overlap
  { form: 'CELARENT', a: 'student in the choir', b: 'able to read music', c: 'new to the school' },
  { form: 'CELARENT', a: 'apple in the basket', b: 'ripe', c: 'bitter' },
  { form: 'CELARENT', a: 'coin in the tray', b: 'silver', c: 'magnetic' },
  { form: 'CELARENT', a: 'door on this floor', b: 'locked', c: 'open' },
  { form: 'CELARENT', a: 'letter in the box', b: 'stamped', c: 'unsent' },

  // MODUS_TOLLENS
  { form: 'MODUS_TOLLENS', p: 'the bakery is open', q: 'the lights are on', notQ: 'the lights are off', notP: 'the bakery is not open', noise: ['The lights are broken.', 'The bakery opens only at dawn.'] },
  { form: 'MODUS_TOLLENS', p: 'the gate is locked', q: 'the dog stays in the yard', notQ: 'the dog is not in the yard', notP: 'the gate is not locked', noise: ['The dog ran away.', 'The yard has no gate.'] },
  { form: 'MODUS_TOLLENS', p: 'the kettle is boiling', q: 'steam rises from the spout', notQ: 'no steam rises from the spout', notP: 'the kettle is not boiling', noise: ['The spout is blocked.', 'The kettle is empty.'] },
  { form: 'MODUS_TOLLENS', p: 'the tap is running', q: 'the basin fills', notQ: 'the basin does not fill', notP: 'the tap is not running', noise: ['The basin has a crack.', 'The tap was mended.'] },
  { form: 'MODUS_TOLLENS', p: 'the window is open', q: 'the curtain moves', notQ: 'the curtain does not move', notP: 'the window is not open', noise: ['The curtain is heavy.', 'The room is warm.'] },

  // DISJUNCTIVE
  { form: 'DISJUNCTIVE', p: 'the letter was posted', q: 'the letter is still on the desk', notQ: 'the letter is not on the desk', notP: 'the letter was not posted', noise: ['The letter was lost.', 'Nobody wrote the letter.'] },
  { form: 'DISJUNCTIVE', p: 'the ring fell in the grass', q: 'the ring is in the box', notQ: 'the ring is not in the box', notP: 'the ring did not fall in the grass', noise: ['The ring was sold.', 'The box was never opened.'] },
  { form: 'DISJUNCTIVE', p: 'the train left early', q: 'the train is at the platform', notQ: 'the train is not at the platform', notP: 'the train did not leave early', noise: ['The train was cancelled.', 'The platform was closed.'] },
  { form: 'DISJUNCTIVE', p: 'the note was moved', q: 'the note is under the door', notQ: 'the note is not under the door', notP: 'the note was not moved', noise: ['The note was torn.', 'The door was painted.'] },
  { form: 'DISJUNCTIVE', p: 'the parcel was collected', q: 'the parcel is in the hall', notQ: 'the parcel is not in the hall', notP: 'the parcel was not collected', noise: ['The parcel was damaged.', 'The hall was locked.'] },

  // RESTATEMENT_TRAP — the tempting option is the invalid one
  { form: 'RESTATEMENT_TRAP', a: 'key in the drawer', b: 'brass key', bPlural: 'brass keys', c: 'worn' },
  { form: 'RESTATEMENT_TRAP', a: 'seat in the front row', b: 'reserved seat', bPlural: 'reserved seats', c: 'empty' },
  { form: 'RESTATEMENT_TRAP', a: 'coin in the jar', b: 'silver coin', bPlural: 'silver coins', c: 'bent' },
  { form: 'RESTATEMENT_TRAP', a: 'book on the desk', b: 'borrowed book', bPlural: 'borrowed books', c: 'overdue' },
  { form: 'RESTATEMENT_TRAP', a: 'plate on the rack', b: 'china plate', bPlural: 'china plates', c: 'chipped' },
];

/** How to describe a family's difference in an Odd One Out explanation. */
export const FAMILY_DESCRIPTIONS: Record<GlyphFamily, string> = {
  halfCircles: 'a circle shaded on one side',
  cornerTriangles: 'a triangle with its square corner in one place',
  triangles: 'a hollow triangle pointing one way',
  filledTriangles: 'a filled triangle pointing one way',
  circledOps: 'a circle with one mark inside it',
  halfSquares: 'a square shaded on one side',
  quarters: 'a circle with one part shaded',
};

// =============================================================================
// Analogy: a closed relation catalogue, and typed distractors
// =============================================================================

export type AnalogyRelation =
  | 'part-of'
  | 'cause-effect'
  | 'intensity'
  | 'scarcity-of'
  | 'member-of'
  | 'tool-function'
  | 'before-after'
  | 'origin-mature'
  | 'practitioner-recipient'
  | 'antonym';

export interface AnalogyEntry {
  relation: AnalogyRelation;
  /** The stated pair. */
  given: [string, string];
  /** The asked pair; `answer` completes it. */
  ask: string;
  answer: string;
  /**
   * Three typed distractors, in order:
   *  [0] related to the answer but the wrong relation
   *  [1] a part / effect / neighbour of the answer
   *  [2] from the same field, wrong relation entirely
   */
  distractors: [string, string, string];
}

export const ANALOGIES: AnalogyEntry[] = [
  { relation: 'scarcity-of', given: ['DROUGHT', 'WATER'], ask: 'FAMINE', answer: 'FOOD', distractors: ['HUNGER', 'HARVEST', 'WEATHER'] },
  { relation: 'part-of', given: ['PAGE', 'BOOK'], ask: 'ROOM', answer: 'HOUSE', distractors: ['DOOR', 'FLOOR', 'KEY'] },
  { relation: 'intensity', given: ['WHISPER', 'SHOUT'], ask: 'DRIZZLE', answer: 'DOWNPOUR', distractors: ['MIST', 'CLOUD', 'UMBRELLA'] },
  { relation: 'part-of', given: ['CHAPTER', 'NOVEL'], ask: 'ACT', answer: 'PLAY', distractors: ['SCENE', 'STAGE', 'ACTOR'] },
  { relation: 'before-after', given: ['BEFORE', 'AFTER'], ask: 'CAUSE', answer: 'EFFECT', distractors: ['ORIGIN', 'PURPOSE', 'ACCIDENT'] },
  { relation: 'origin-mature', given: ['SEED', 'PLANT'], ask: 'EGG', answer: 'BIRD', distractors: ['SHELL', 'NEST', 'FEATHER'] },
  { relation: 'practitioner-recipient', given: ['DOCTOR', 'PATIENT'], ask: 'TEACHER', answer: 'STUDENT', distractors: ['LESSON', 'CLASSROOM', 'SCHOOL'] },
  { relation: 'antonym', given: ['SCARCE', 'PLENTIFUL'], ask: 'TEMPORARY', answer: 'PERMANENT', distractors: ['FLEETING', 'MOMENTARY', 'INTERVAL'] },
  { relation: 'tool-function', given: ['KNIFE', 'CUT'], ask: 'BROOM', answer: 'SWEEP', distractors: ['DUST', 'HANDLE', 'FLOOR'] },
  { relation: 'member-of', given: ['SPARROW', 'BIRD'], ask: 'SALMON', answer: 'FISH', distractors: ['RIVER', 'SCALE', 'SWIM'] },
  { relation: 'cause-effect', given: ['SPARK', 'FIRE'], ask: 'SEED', answer: 'PLANT', distractors: ['SOIL', 'ROOT', 'GARDEN'] },
  { relation: 'part-of', given: ['PETAL', 'FLOWER'], ask: 'BRANCH', answer: 'TREE', distractors: ['LEAF', 'BARK', 'FOREST'] },
  { relation: 'intensity', given: ['WARM', 'SCORCHING'], ask: 'COOL', answer: 'FREEZING', distractors: ['CHILLY', 'MIDWINTER', 'FROST'] },
  { relation: 'scarcity-of', given: ['THIRST', 'DRINK'], ask: 'FATIGUE', answer: 'REST', distractors: ['SLEEP', 'BED', 'NIGHT'] },
  { relation: 'antonym', given: ['ANCIENT', 'MODERN'], ask: 'HOLLOW', answer: 'SOLID', distractors: ['EMPTY', 'SHELL', 'CAVITY'] },
  { relation: 'tool-function', given: ['SCALE', 'WEIGH'], ask: 'CLOCK', answer: 'TIME', distractors: ['HOUR', 'HAND', 'ALARM'] },
  { relation: 'member-of', given: ['COPPER', 'METAL'], ask: 'OXYGEN', answer: 'GAS', distractors: ['AIR', 'BREATH', 'ELEMENT'] },
  { relation: 'before-after', given: ['QUESTION', 'ANSWER'], ask: 'PROBLEM', answer: 'SOLUTION', distractors: ['PUZZLE', 'DIFFICULTY', 'METHOD'] },
  { relation: 'part-of', given: ['ISLAND', 'ARCHIPELAGO'], ask: 'TREE', answer: 'FOREST', distractors: ['BRANCH', 'WOOD', 'LEAF'] },
  { relation: 'origin-mature', given: ['CALF', 'COW'], ask: 'CUB', answer: 'BEAR', distractors: ['DEN', 'FUR', 'PAW'] },
  { relation: 'cause-effect', given: ['RAIN', 'FLOOD'], ask: 'WIND', answer: 'GALE', distractors: ['BREEZE', 'SAIL', 'SKY'] },
  { relation: 'practitioner-recipient', given: ['AUTHOR', 'READER'], ask: 'COMPOSER', answer: 'LISTENER', distractors: ['SONG', 'ORCHESTRA', 'STAGE'] },
  { relation: 'intensity', given: ['TAP', 'POUND'], ask: 'GLANCE', answer: 'STARE', distractors: ['BLINK', 'EYE', 'MIRROR'] },
  { relation: 'antonym', given: ['ARRIVE', 'DEPART'], ask: 'GATHER', answer: 'SCATTER', distractors: ['COLLECT', 'CROWD', 'HEAP'] },
  { relation: 'tool-function', given: ['LADDER', 'CLIMB'], ask: 'BRIDGE', answer: 'CROSS', distractors: ['RIVER', 'ARCH', 'ROAD'] },
];

// =============================================================================
// Odd Word Out: closed categories, and the membership that proves uniqueness
// =============================================================================

export interface OddWordSet {
  /** The three that belong, and the one that does not. */
  words: [string, string, string, string];
  outlier: string;
  /** Curated. The validator proves uniqueness from this, not from a model. */
  membership: Record<string, string[]>;
}

const set = (
  a: string, b: string, c: string, outlier: string,
  shared: string, outlierCat: string,
  extra: Record<string, string[]> = {},
): OddWordSet => ({
  words: [a, b, c, outlier],
  outlier,
  membership: {
    [a]: [shared, ...(extra[a] ?? [])],
    [b]: [shared, ...(extra[b] ?? [])],
    [c]: [shared, ...(extra[c] ?? [])],
    [outlier]: [outlierCat, ...(extra[outlier] ?? [])],
  },
});

export const ODD_WORD_SETS: OddWordSet[] = [
  set('HAMMER', 'SAW', 'DRILL', 'NAIL', 'tool', 'fastener'),
  set('OAK', 'PINE', 'MAPLE', 'ACORN', 'tree', 'seed'),
  set('MERCURY', 'IRON', 'GOLD', 'OXYGEN', 'metal', 'gas', {
    MERCURY: ['element'], IRON: ['element'], GOLD: ['element'], OXYGEN: ['element'],
  }),
  set('CIRCLE', 'SQUARE', 'TRIANGLE', 'CUBE', 'flat-shape', 'solid-shape'),
  set('SECOND', 'MINUTE', 'HOUR', 'CLOCK', 'time-unit', 'instrument'),
  set('COTTON', 'WOOL', 'SILK', 'NEEDLE', 'fabric', 'tool'),
  set('RIVER', 'LAKE', 'POND', 'DESERT', 'body-of-water', 'dry-land'),
  set('SPARROW', 'EAGLE', 'OWL', 'MOTH', 'bird', 'insect'),
  set('BRICK', 'PLANK', 'TILE', 'MORTAR', 'building-unit', 'binding-agent'),
  set('SPOON', 'FORK', 'KNIFE', 'PLATE', 'utensil', 'dish'),
  set('KILOMETRE', 'MILE', 'METRE', 'LITRE', 'length-unit', 'volume-unit'),
  set('VIOLIN', 'CELLO', 'HARP', 'DRUM', 'string-instrument', 'percussion-instrument'),
  set('THUNDER', 'LIGHTNING', 'RAIN', 'BAROMETER', 'weather-event', 'instrument'),
  set('COPPER', 'BRONZE', 'STEEL', 'GRANITE', 'metal', 'rock'),
  set('CINNAMON', 'NUTMEG', 'GINGER', 'VINEGAR', 'spice', 'condiment'),
  set('WHEAT', 'BARLEY', 'RICE', 'FLOUR', 'grain', 'processed-product'),
  set('ANKLE', 'WRIST', 'ELBOW', 'SKULL', 'joint', 'bone'),
  set('LADLE', 'WHISK', 'SIEVE', 'BROTH', 'kitchen-tool', 'food'),
  set('ISLAND', 'PENINSULA', 'CAPE', 'STRAIT', 'landform', 'waterway'),
  set('SANDAL', 'BOOT', 'SLIPPER', 'GLOVE', 'footwear', 'handwear'),
  set('ENGINE', 'GEARBOX', 'AXLE', 'PETROL', 'machine-part', 'fuel'),
  set('CANVAS', 'EASEL', 'BRUSH', 'PORTRAIT', 'painting-equipment', 'artwork'),
  set('TRUNK', 'BRANCH', 'FOLIAGE', 'SOIL', 'plant part', 'ground material'),
  set('HAIL', 'SNOW', 'SLEET', 'CLOUD', 'precipitation', 'formation'),
  set('MASON', 'WELDER', 'POTTER', 'CLAY', 'craftsperson', 'material'),
];

// =============================================================================
// Sequence Completion: the rule families the generator may use
// =============================================================================

export type SequenceFamily =
  | 'arithmetic'
  | 'geometric'
  | 'divide'
  | 'squares'
  | 'triangular' // n(n+1)/2
  | 'oblong' // n(n+1)
  | 'fibonacci'
  | 'alternating'; // +a then ×b

export interface SequenceSeed {
  family: SequenceFamily;
  /** Meaning depends on the family; see authoring.ts. */
  params: number[];
  length?: number;
}

// =============================================================================
// Ordering (LOG_003): clue templates and scenarios
// =============================================================================

export type Clue =
  | { type: 'before'; a: string; b: string }
  | { type: 'first'; x: string }
  | { type: 'last'; x: string }
  | { type: 'notFirst'; x: string }
  | { type: 'notLast'; x: string };

/**
 * Four names, a verb, and the clues. The *solution* is never authored — the
 * builder derives it by enumerating all 24 orderings and demanding exactly one
 * survives. If an author writes a redundant clue, the build fails.
 */
export interface OrderingScenario {
  items: [string, string, string, string];
  /** "finished", "arrived", … Used to render `before` clues. */
  verb: string;
  clues: Clue[];
}

const before = (a: string, b: string): Clue => ({ type: 'before', a, b });
const first = (x: string): Clue => ({ type: 'first', x });
const last = (x: string): Clue => ({ type: 'last', x });

export const ORDERING_SCENARIOS: OrderingScenario[] = [
  { items: ['Rosa', 'Ken', 'Mia', 'Ada'], verb: 'finished', clues: [before('Rosa', 'Ken'), before('Ken', 'Mia'), last('Ada')] },
  { items: ['Ivo', 'Lena', 'Tom', 'Ana'], verb: 'arrived', clues: [first('Ivo'), before('Lena', 'Tom'), before('Tom', 'Ana')] },
  { items: ['Nils', 'Cora', 'Ben', 'Vera'], verb: 'spoke', clues: [before('Nils', 'Cora'), before('Cora', 'Ben'), before('Ben', 'Vera')] },
  { items: ['Otto', 'Pia', 'Rue', 'Sam'], verb: 'left', clues: [last('Otto'), before('Pia', 'Rue'), before('Rue', 'Sam')] },
  { items: ['Hana', 'Emil', 'Nadia', 'Luc'], verb: 'finished', clues: [first('Hana'), last('Emil'), before('Nadia', 'Luc')] },

  { items: ['Bo', 'Iris', 'Wren', 'Kai'], verb: 'arrived', clues: [before('Bo', 'Iris'), before('Iris', 'Wren'), last('Kai')] },
  { items: ['Yara', 'Dane', 'Mira', 'Finn'], verb: 'answered', clues: [first('Yara'), before('Dane', 'Mira'), before('Mira', 'Finn')] },
  { items: ['Zoe', 'Ravi', 'Nora', 'Alec'], verb: 'sang', clues: [before('Zoe', 'Ravi'), before('Ravi', 'Nora'), before('Nora', 'Alec')] },
  { items: ['Lars', 'Eve', 'Tariq', 'Juno'], verb: 'left', clues: [last('Lars'), before('Eve', 'Tariq'), before('Tariq', 'Juno')] },
  { items: ['Mae', 'Osric', 'Pell', 'Rhea'], verb: 'finished', clues: [first('Mae'), last('Osric'), before('Pell', 'Rhea')] },

  { items: ['Ines', 'Gus', 'Neel', 'Tova'], verb: 'arrived', clues: [before('Ines', 'Gus'), before('Gus', 'Neel'), last('Tova')] },
  { items: ['Piet', 'Sana', 'Ugo', 'Wilma'], verb: 'spoke', clues: [first('Piet'), before('Sana', 'Ugo'), before('Ugo', 'Wilma')] },
  { items: ['Arne', 'Bela', 'Cato', 'Dora'], verb: 'ran', clues: [before('Arne', 'Bela'), before('Bela', 'Cato'), before('Cato', 'Dora')] },
  { items: ['Esme', 'Fabio', 'Gita', 'Hugo'], verb: 'left', clues: [last('Esme'), before('Fabio', 'Gita'), before('Gita', 'Hugo')] },
  { items: ['Iga', 'Jonas', 'Kira', 'Levi'], verb: 'answered', clues: [first('Iga'), last('Jonas'), before('Kira', 'Levi')] },

  { items: ['Milo', 'Nia', 'Oren', 'Pearl'], verb: 'finished', clues: [before('Milo', 'Nia'), before('Nia', 'Oren'), last('Pearl')] },
];

// =============================================================================
// Sentence Ordering (LNG_003): four fragments, one hinge
// =============================================================================

/**
 * Fragments in their **correct order**. The builder shuffles them for display
 * and records the structural constraints; the validator then enumerates all 24
 * orderings and demands exactly one satisfies them all.
 *
 * Every sentence is built around one explicit hinge: a pronoun that must follow
 * its antecedent. Combined with "only the opener is capitalised" and "only the
 * closer ends in a full stop", that pins exactly one ordering.
 *
 * `hinge` names two middle fragments by index: [antecedent, pronoun].
 *
 * **Human review is mandatory on this engine** even after validation passes:
 * English tolerates reordering, and the checker can be satisfied while the
 * sentence remains arguable (Catalog §LNG_003).
 */
export interface SentenceSet {
  fragments: [string, string, string, string];
  hinge: [number, number];
}

export const SENTENCE_SETS: SentenceSet[] = [
  { fragments: ['The kettle had just boiled,', 'so Ada poured the tea,', 'and she carried it outside,', 'where the guests were waiting.'], hinge: [1, 2] },
  { fragments: ['The bridge was closed,', 'so the driver took the ridge road,', 'and he arrived an hour late,', 'long after the parcel was due.'], hinge: [1, 2] },
  { fragments: ['The library shut at six,', 'so Nina left her books behind,', 'and she returned for them at dawn,', 'before anyone else had arrived.'], hinge: [1, 2] },
  { fragments: ['The storm knocked out the power,', 'so Omar lit the old lantern,', 'and he read beside it until midnight,', 'while the rain hammered the roof.'], hinge: [1, 2] },
  { fragments: ['The path forked at the river,', 'so Mira chose the narrower track,', 'and it led her to the mill,', 'exactly as the map had promised.'], hinge: [1, 2] },

  { fragments: ['The bell rang twice,', 'so Petra closed her notebook,', 'and she hurried to the hall,', 'where the others were already seated.'], hinge: [1, 2] },
  { fragments: ['The oven had cooled overnight,', 'so Tomas relit the fire,', 'and he waited for the bricks to warm,', 'before sliding in the first loaf.'], hinge: [1, 2] },
  { fragments: ['The tide was falling fast,', 'so Ines dragged the boat higher,', 'and she tied it to the post,', 'well above the waterline.'], hinge: [1, 2] },
  { fragments: ['The lock had rusted shut,', 'so Bram oiled the mechanism,', 'and he turned the key twice,', 'until the bolt finally slid back.'], hinge: [1, 2] },
  { fragments: ['The lecture ran long,', 'so Dana skipped the queue,', 'and she took the stairs instead,', 'arriving before the lift did.'], hinge: [1, 2] },

  { fragments: ['The clock had stopped in the night,', 'so Felix wound it again,', 'and he set the hands by the bell,', 'which he could hear from the kitchen.'], hinge: [1, 2] },
  { fragments: ['The trail was buried in snow,', 'so Greta followed the fence line,', 'and she reached the hut by dusk,', 'with an hour of light to spare.'], hinge: [1, 2] },
  { fragments: ['The harvest came early that year,', 'so Anton hired two more hands,', 'and he finished the field by Friday,', 'a full week ahead of the rain.'], hinge: [1, 2] },
  { fragments: ['The window had been left open,', 'so Lucia found the floor soaked,', 'and she mopped it before breakfast,', 'saying nothing about it to anyone.'], hinge: [1, 2] },
  { fragments: ['The road flooded overnight,', 'so Karim walked to the station,', 'and he caught the early train,', 'which was almost empty at that hour.'], hinge: [1, 2] },

  { fragments: ['The lantern guttered and died,', 'so Yusuf struck a fresh match,', 'and he shielded it with one hand,', 'until the wick caught properly.'], hinge: [1, 2] },
];

// =============================================================================
// Memory Flash (ATT_002)
// =============================================================================

/** Exposure floor is 1500ms: reading speed and saccade latency vary widely (§13). */
export const MEMORY_EXPOSURE_BY_DIFFICULTY: Record<number, number> = {
  2: 2400,
  3: 2000,
  4: 1700,
  5: 1500,
};

/** The neutral pause. Long enough to clear the after-image, short enough not to bore. */
export const MEMORY_INTERVAL_MS = 600;
