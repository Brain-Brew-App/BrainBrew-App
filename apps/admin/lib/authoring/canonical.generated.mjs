/* eslint-disable */
// @ts-nocheck
/**
 * GENERATED — DO NOT EDIT.
 * Source: src/content/authoringBoundary.ts (the single canonical builder/validator boundary).
 * Regenerate: npm run authoring:bundle   ·   Verify: npm run authoring:bundle:check
 * Byte-identity to the content pipeline is proven by npm run test:authoring-boundary.
 */

// src/content/lexicon.ts
var GLYPH_FAMILIES = {
  halfCircles: ["\u25D0", "\u25D1", "\u25D2", "\u25D3"],
  cornerTriangles: ["\u25E4", "\u25E5", "\u25E3", "\u25E2"],
  triangles: ["\u25B3", "\u25BD", "\u25C1", "\u25B7"],
  filledTriangles: ["\u25B2", "\u25BC", "\u25C0", "\u25B6"],
  circledOps: ["\u2295", "\u2297", "\u2299", "\u2298"],
  halfSquares: ["\u25E7", "\u25E8", "\u25E9", "\u25EA"],
  quarters: ["\u25D4", "\u25D5", "\u25F7", "\u25F6"]
};
var SWEEP_GLYPHS = ["\u25CF", "\u25CB", "\u25A0", "\u25A1", "\u25B2", "\u25B3", "\u25BC", "\u25BD", "\u25C6", "\u25C7"];
var CURVED = /* @__PURE__ */ new Set(["\u25CF", "\u25CB"]);
var FILLED = /* @__PURE__ */ new Set(["\u25CF", "\u25A0", "\u25B2", "\u25BC", "\u25C6"]);
var POINTS_UP = /* @__PURE__ */ new Set(["\u25B2", "\u25B3"]);
var CLASSIFICATION_RULES = {
  curved: {
    key: "curved",
    question: "Does the symbol have a curved edge?",
    buckets: ["Curved", "Straight"],
    alphabet: ["\u25CF", "\u25CB", "\u25A0", "\u25A1", "\u25B2", "\u25B3", "\u25BC", "\u25BD", "\u25C6", "\u25C7"],
    bucketOf: (g) => CURVED.has(g) ? 0 : 1
  },
  filled: {
    key: "filled",
    question: "Is the symbol filled in?",
    buckets: ["Filled", "Hollow"],
    alphabet: ["\u25CF", "\u25CB", "\u25A0", "\u25A1", "\u25B2", "\u25B3", "\u25BC", "\u25BD", "\u25C6", "\u25C7"],
    bucketOf: (g) => FILLED.has(g) ? 0 : 1
  },
  pointsUp: {
    key: "pointsUp",
    question: "Does the triangle point upward?",
    buckets: ["Points up", "Points down"],
    alphabet: ["\u25B2", "\u25B3", "\u25BC", "\u25BD"],
    bucketOf: (g) => POINTS_UP.has(g) ? 0 : 1
  }
};
var DEDUCTION_SCENARIOS = [
  // BARBARA — universal chain
  { form: "BARBARA", a: "book on the top shelf", b: "hardcover", c: "bound in cloth" },
  { form: "BARBARA", a: "key in the drawer", b: "brass key", c: "made of metal" },
  { form: "BARBARA", a: "chair in the hall", b: "folding chair", c: "able to be stacked" },
  { form: "BARBARA", a: "lamp in the study", b: "oil lamp", c: "able to be refilled" },
  { form: "BARBARA", a: "jar on the counter", b: "sealed jar", c: "airtight" },
  // CELARENT — no overlap
  { form: "CELARENT", a: "student in the choir", b: "able to read music", c: "new to the school" },
  { form: "CELARENT", a: "apple in the basket", b: "ripe", c: "bitter" },
  { form: "CELARENT", a: "coin in the tray", b: "silver", c: "magnetic" },
  { form: "CELARENT", a: "door on this floor", b: "locked", c: "open" },
  { form: "CELARENT", a: "letter in the box", b: "stamped", c: "unsent" },
  // MODUS_TOLLENS
  { form: "MODUS_TOLLENS", p: "the bakery is open", q: "the lights are on", notQ: "the lights are off", notP: "the bakery is not open", noise: ["The lights are broken.", "The bakery opens only at dawn."] },
  { form: "MODUS_TOLLENS", p: "the gate is locked", q: "the dog stays in the yard", notQ: "the dog is not in the yard", notP: "the gate is not locked", noise: ["The dog ran away.", "The yard has no gate."] },
  { form: "MODUS_TOLLENS", p: "the kettle is boiling", q: "steam rises from the spout", notQ: "no steam rises from the spout", notP: "the kettle is not boiling", noise: ["The spout is blocked.", "The kettle is empty."] },
  { form: "MODUS_TOLLENS", p: "the tap is running", q: "the basin fills", notQ: "the basin does not fill", notP: "the tap is not running", noise: ["The basin has a crack.", "The tap was mended."] },
  { form: "MODUS_TOLLENS", p: "the window is open", q: "the curtain moves", notQ: "the curtain does not move", notP: "the window is not open", noise: ["The curtain is heavy.", "The room is warm."] },
  // DISJUNCTIVE
  { form: "DISJUNCTIVE", p: "the letter was posted", q: "the letter is still on the desk", notQ: "the letter is not on the desk", notP: "the letter was not posted", noise: ["The letter was lost.", "Nobody wrote the letter."] },
  { form: "DISJUNCTIVE", p: "the ring fell in the grass", q: "the ring is in the box", notQ: "the ring is not in the box", notP: "the ring did not fall in the grass", noise: ["The ring was sold.", "The box was never opened."] },
  { form: "DISJUNCTIVE", p: "the train left early", q: "the train is at the platform", notQ: "the train is not at the platform", notP: "the train did not leave early", noise: ["The train was cancelled.", "The platform was closed."] },
  { form: "DISJUNCTIVE", p: "the note was moved", q: "the note is under the door", notQ: "the note is not under the door", notP: "the note was not moved", noise: ["The note was torn.", "The door was painted."] },
  { form: "DISJUNCTIVE", p: "the parcel was collected", q: "the parcel is in the hall", notQ: "the parcel is not in the hall", notP: "the parcel was not collected", noise: ["The parcel was damaged.", "The hall was locked."] },
  // RESTATEMENT_TRAP — the tempting option is the invalid one
  { form: "RESTATEMENT_TRAP", a: "key in the drawer", b: "brass key", bPlural: "brass keys", c: "worn" },
  { form: "RESTATEMENT_TRAP", a: "seat in the front row", b: "reserved seat", bPlural: "reserved seats", c: "empty" },
  { form: "RESTATEMENT_TRAP", a: "coin in the jar", b: "silver coin", bPlural: "silver coins", c: "bent" },
  { form: "RESTATEMENT_TRAP", a: "book on the desk", b: "borrowed book", bPlural: "borrowed books", c: "overdue" },
  { form: "RESTATEMENT_TRAP", a: "plate on the rack", b: "china plate", bPlural: "china plates", c: "chipped" }
];
var FAMILY_DESCRIPTIONS = {
  halfCircles: "a circle shaded on one side",
  cornerTriangles: "a triangle with its square corner in one place",
  triangles: "a hollow triangle pointing one way",
  filledTriangles: "a filled triangle pointing one way",
  circledOps: "a circle with one mark inside it",
  halfSquares: "a square shaded on one side",
  quarters: "a circle with one part shaded"
};
var ANALOGIES = [
  { relation: "scarcity-of", given: ["DROUGHT", "WATER"], ask: "FAMINE", answer: "FOOD", distractors: ["HUNGER", "HARVEST", "WEATHER"] },
  { relation: "part-of", given: ["PAGE", "BOOK"], ask: "ROOM", answer: "HOUSE", distractors: ["DOOR", "FLOOR", "KEY"] },
  { relation: "intensity", given: ["WHISPER", "SHOUT"], ask: "DRIZZLE", answer: "DOWNPOUR", distractors: ["MIST", "CLOUD", "UMBRELLA"] },
  { relation: "part-of", given: ["CHAPTER", "NOVEL"], ask: "ACT", answer: "PLAY", distractors: ["SCENE", "STAGE", "ACTOR"] },
  { relation: "before-after", given: ["BEFORE", "AFTER"], ask: "CAUSE", answer: "EFFECT", distractors: ["ORIGIN", "PURPOSE", "ACCIDENT"] },
  { relation: "origin-mature", given: ["SEED", "PLANT"], ask: "EGG", answer: "BIRD", distractors: ["SHELL", "NEST", "FEATHER"] },
  { relation: "practitioner-recipient", given: ["DOCTOR", "PATIENT"], ask: "TEACHER", answer: "STUDENT", distractors: ["LESSON", "CLASSROOM", "SCHOOL"] },
  { relation: "antonym", given: ["SCARCE", "PLENTIFUL"], ask: "TEMPORARY", answer: "PERMANENT", distractors: ["FLEETING", "MOMENTARY", "INTERVAL"] },
  { relation: "tool-function", given: ["KNIFE", "CUT"], ask: "BROOM", answer: "SWEEP", distractors: ["DUST", "HANDLE", "FLOOR"] },
  { relation: "member-of", given: ["SPARROW", "BIRD"], ask: "SALMON", answer: "FISH", distractors: ["RIVER", "SCALE", "SWIM"] },
  { relation: "cause-effect", given: ["SPARK", "FIRE"], ask: "SEED", answer: "PLANT", distractors: ["SOIL", "ROOT", "GARDEN"] },
  { relation: "part-of", given: ["PETAL", "FLOWER"], ask: "BRANCH", answer: "TREE", distractors: ["LEAF", "BARK", "FOREST"] },
  { relation: "intensity", given: ["WARM", "SCORCHING"], ask: "COOL", answer: "FREEZING", distractors: ["CHILLY", "MIDWINTER", "FROST"] },
  { relation: "scarcity-of", given: ["THIRST", "DRINK"], ask: "FATIGUE", answer: "REST", distractors: ["SLEEP", "BED", "NIGHT"] },
  { relation: "antonym", given: ["ANCIENT", "MODERN"], ask: "HOLLOW", answer: "SOLID", distractors: ["EMPTY", "SHELL", "CAVITY"] },
  { relation: "tool-function", given: ["SCALE", "WEIGH"], ask: "CLOCK", answer: "TIME", distractors: ["HOUR", "HAND", "ALARM"] },
  { relation: "member-of", given: ["COPPER", "METAL"], ask: "OXYGEN", answer: "GAS", distractors: ["AIR", "BREATH", "ELEMENT"] },
  { relation: "before-after", given: ["QUESTION", "ANSWER"], ask: "PROBLEM", answer: "SOLUTION", distractors: ["PUZZLE", "DIFFICULTY", "METHOD"] },
  { relation: "part-of", given: ["ISLAND", "ARCHIPELAGO"], ask: "TREE", answer: "FOREST", distractors: ["BRANCH", "WOOD", "LEAF"] },
  { relation: "origin-mature", given: ["CALF", "COW"], ask: "CUB", answer: "BEAR", distractors: ["DEN", "FUR", "PAW"] },
  { relation: "cause-effect", given: ["RAIN", "FLOOD"], ask: "WIND", answer: "GALE", distractors: ["BREEZE", "SAIL", "SKY"] },
  { relation: "practitioner-recipient", given: ["AUTHOR", "READER"], ask: "COMPOSER", answer: "LISTENER", distractors: ["SONG", "ORCHESTRA", "STAGE"] },
  { relation: "intensity", given: ["TAP", "POUND"], ask: "GLANCE", answer: "STARE", distractors: ["BLINK", "EYE", "MIRROR"] },
  { relation: "antonym", given: ["ARRIVE", "DEPART"], ask: "GATHER", answer: "SCATTER", distractors: ["COLLECT", "CROWD", "HEAP"] },
  { relation: "tool-function", given: ["LADDER", "CLIMB"], ask: "BRIDGE", answer: "CROSS", distractors: ["RIVER", "ARCH", "ROAD"] }
];
var set = (a, b, c, outlier, shared, outlierCat, extra = {}) => ({
  words: [a, b, c, outlier],
  outlier,
  membership: {
    [a]: [shared, ...extra[a] ?? []],
    [b]: [shared, ...extra[b] ?? []],
    [c]: [shared, ...extra[c] ?? []],
    [outlier]: [outlierCat, ...extra[outlier] ?? []]
  }
});
var ODD_WORD_SETS = [
  set("HAMMER", "SAW", "DRILL", "NAIL", "tool", "fastener"),
  set("OAK", "PINE", "MAPLE", "ACORN", "tree", "seed"),
  set("MERCURY", "IRON", "GOLD", "OXYGEN", "metal", "gas", {
    MERCURY: ["element"],
    IRON: ["element"],
    GOLD: ["element"],
    OXYGEN: ["element"]
  }),
  set("CIRCLE", "SQUARE", "TRIANGLE", "CUBE", "flat-shape", "solid-shape"),
  set("SECOND", "MINUTE", "HOUR", "CLOCK", "time-unit", "instrument"),
  set("COTTON", "WOOL", "SILK", "NEEDLE", "fabric", "tool"),
  set("RIVER", "LAKE", "POND", "DESERT", "body-of-water", "dry-land"),
  set("SPARROW", "EAGLE", "OWL", "MOTH", "bird", "insect"),
  set("BRICK", "PLANK", "TILE", "MORTAR", "building-unit", "binding-agent"),
  set("SPOON", "FORK", "KNIFE", "PLATE", "utensil", "dish"),
  set("KILOMETRE", "MILE", "METRE", "LITRE", "length-unit", "volume-unit"),
  set("VIOLIN", "CELLO", "HARP", "DRUM", "string-instrument", "percussion-instrument"),
  set("THUNDER", "LIGHTNING", "RAIN", "BAROMETER", "weather-event", "instrument"),
  set("COPPER", "BRONZE", "STEEL", "GRANITE", "metal", "rock"),
  set("CINNAMON", "NUTMEG", "GINGER", "VINEGAR", "spice", "condiment"),
  set("WHEAT", "BARLEY", "RICE", "FLOUR", "grain", "processed-product"),
  set("ANKLE", "WRIST", "ELBOW", "SKULL", "joint", "bone"),
  set("LADLE", "WHISK", "SIEVE", "BROTH", "kitchen-tool", "food"),
  set("ISLAND", "PENINSULA", "CAPE", "STRAIT", "landform", "waterway"),
  set("SANDAL", "BOOT", "SLIPPER", "GLOVE", "footwear", "handwear"),
  set("ENGINE", "GEARBOX", "AXLE", "PETROL", "machine-part", "fuel"),
  set("CANVAS", "EASEL", "BRUSH", "PORTRAIT", "painting-equipment", "artwork"),
  set("TRUNK", "BRANCH", "FOLIAGE", "SOIL", "plant part", "ground material"),
  set("HAIL", "SNOW", "SLEET", "CLOUD", "precipitation", "formation"),
  set("MASON", "WELDER", "POTTER", "CLAY", "craftsperson", "material")
];
var before = (a, b) => ({ type: "before", a, b });
var first = (x) => ({ type: "first", x });
var last = (x) => ({ type: "last", x });
var ORDERING_SCENARIOS = [
  { items: ["Rosa", "Ken", "Mia", "Ada"], verb: "finished", clues: [before("Rosa", "Ken"), before("Ken", "Mia"), last("Ada")] },
  { items: ["Ivo", "Lena", "Tom", "Ana"], verb: "arrived", clues: [first("Ivo"), before("Lena", "Tom"), before("Tom", "Ana")] },
  { items: ["Nils", "Cora", "Ben", "Vera"], verb: "spoke", clues: [before("Nils", "Cora"), before("Cora", "Ben"), before("Ben", "Vera")] },
  { items: ["Otto", "Pia", "Rue", "Sam"], verb: "left", clues: [last("Otto"), before("Pia", "Rue"), before("Rue", "Sam")] },
  { items: ["Hana", "Emil", "Nadia", "Luc"], verb: "finished", clues: [first("Hana"), last("Emil"), before("Nadia", "Luc")] },
  { items: ["Bo", "Iris", "Wren", "Kai"], verb: "arrived", clues: [before("Bo", "Iris"), before("Iris", "Wren"), last("Kai")] },
  { items: ["Yara", "Dane", "Mira", "Finn"], verb: "answered", clues: [first("Yara"), before("Dane", "Mira"), before("Mira", "Finn")] },
  { items: ["Zoe", "Ravi", "Nora", "Alec"], verb: "sang", clues: [before("Zoe", "Ravi"), before("Ravi", "Nora"), before("Nora", "Alec")] },
  { items: ["Lars", "Eve", "Tariq", "Juno"], verb: "left", clues: [last("Lars"), before("Eve", "Tariq"), before("Tariq", "Juno")] },
  { items: ["Mae", "Osric", "Pell", "Rhea"], verb: "finished", clues: [first("Mae"), last("Osric"), before("Pell", "Rhea")] },
  { items: ["Ines", "Gus", "Neel", "Tova"], verb: "arrived", clues: [before("Ines", "Gus"), before("Gus", "Neel"), last("Tova")] },
  { items: ["Piet", "Sana", "Ugo", "Wilma"], verb: "spoke", clues: [first("Piet"), before("Sana", "Ugo"), before("Ugo", "Wilma")] },
  { items: ["Arne", "Bela", "Cato", "Dora"], verb: "ran", clues: [before("Arne", "Bela"), before("Bela", "Cato"), before("Cato", "Dora")] },
  { items: ["Esme", "Fabio", "Gita", "Hugo"], verb: "left", clues: [last("Esme"), before("Fabio", "Gita"), before("Gita", "Hugo")] },
  { items: ["Iga", "Jonas", "Kira", "Levi"], verb: "answered", clues: [first("Iga"), last("Jonas"), before("Kira", "Levi")] },
  { items: ["Milo", "Nia", "Oren", "Pearl"], verb: "finished", clues: [before("Milo", "Nia"), before("Nia", "Oren"), last("Pearl")] }
];
var SENTENCE_SETS = [
  { fragments: ["The kettle had just boiled,", "so Ada poured the tea,", "and she carried it outside,", "where the guests were waiting."], hinge: [1, 2] },
  { fragments: ["The bridge was closed,", "so the driver took the ridge road,", "and he arrived an hour late,", "long after the parcel was due."], hinge: [1, 2] },
  { fragments: ["The library shut at six,", "so Nina left her books behind,", "and she returned for them at dawn,", "before anyone else had arrived."], hinge: [1, 2] },
  { fragments: ["The storm knocked out the power,", "so Omar lit the old lantern,", "and he read beside it until midnight,", "while the rain hammered the roof."], hinge: [1, 2] },
  { fragments: ["The path forked at the river,", "so Mira chose the narrower track,", "and it led her to the mill,", "exactly as the map had promised."], hinge: [1, 2] },
  { fragments: ["The bell rang twice,", "so Petra closed her notebook,", "and she hurried to the hall,", "where the others were already seated."], hinge: [1, 2] },
  { fragments: ["The oven had cooled overnight,", "so Tomas relit the fire,", "and he waited for the bricks to warm,", "before sliding in the first loaf."], hinge: [1, 2] },
  { fragments: ["The tide was falling fast,", "so Ines dragged the boat higher,", "and she tied it to the post,", "well above the waterline."], hinge: [1, 2] },
  { fragments: ["The lock had rusted shut,", "so Bram oiled the mechanism,", "and he turned the key twice,", "until the bolt finally slid back."], hinge: [1, 2] },
  { fragments: ["The lecture ran long,", "so Dana skipped the queue,", "and she took the stairs instead,", "arriving before the lift did."], hinge: [1, 2] },
  { fragments: ["The clock had stopped in the night,", "so Felix wound it again,", "and he set the hands by the bell,", "which he could hear from the kitchen."], hinge: [1, 2] },
  { fragments: ["The trail was buried in snow,", "so Greta followed the fence line,", "and she reached the hut by dusk,", "with an hour of light to spare."], hinge: [1, 2] },
  { fragments: ["The harvest came early that year,", "so Anton hired two more hands,", "and he finished the field by Friday,", "a full week ahead of the rain."], hinge: [1, 2] },
  { fragments: ["The window had been left open,", "so Lucia found the floor soaked,", "and she mopped it before breakfast,", "saying nothing about it to anyone."], hinge: [1, 2] },
  { fragments: ["The road flooded overnight,", "so Karim walked to the station,", "and he caught the early train,", "which was almost empty at that hour."], hinge: [1, 2] },
  { fragments: ["The lantern guttered and died,", "so Yusuf struck a fresh match,", "and he shielded it with one hand,", "until the wick caught properly."], hinge: [1, 2] }
];
var MEMORY_EXPOSURE_BY_DIFFICULTY = {
  2: 2400,
  3: 2e3,
  4: 1700,
  5: 1500
};
var MEMORY_INTERVAL_MS = 600;

// src/content/authoring.ts
function lcg(seed) {
  let s = seed * 2654435761 % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}
function shuffle(items, seed) {
  const rand = lcg(seed + 1);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
var OPTION_IDS = ["a", "b", "c", "d"];
function choices(correct, distractors, correctIndex) {
  const labels = [];
  let d = 0;
  for (let i = 0; i < 4; i++) labels.push(i === correctIndex ? correct : distractors[d++]);
  return {
    options: labels.map((label, i) => ({ id: OPTION_IDS[i], label })),
    correctOptionId: OPTION_IDS[correctIndex]
  };
}
var cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function timingFor(base, difficulty) {
  const parMs = base + (difficulty - 1) * Math.round(base * 0.22);
  return { parMs, limitMs: Math.round(parMs * 2.4) };
}
var toMatrix = (rows) => rows.map((r) => [...r].map((c) => c === "#" ? 1 : 0));
var toRows = (m) => m.map((r) => r.map((x) => x ? "#" : ".").join(""));
var keyOf = (m) => m.map((r) => r.join("")).join("/");
var rot90 = (m) => m[0].map((_, c) => m.map((r) => r[c]).reverse());
var mirrorOf = (m) => m.map((r) => [...r].reverse());
var rotationsOf = (m) => {
  const out = [];
  let x = m;
  for (let i = 0; i < 4; i++) {
    out.push(x);
    x = rot90(x);
  }
  return out;
};
var cellCount = (m) => m.flat().filter(Boolean).length;
function connected(m) {
  const H = m.length;
  const W = m[0].length;
  let start = null;
  for (let r = 0; r < H && !start; r++) for (let c = 0; c < W && !start; c++) if (m[r][c]) start = [r, c];
  if (!start) return false;
  const seen = /* @__PURE__ */ new Set([start.join()]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || !m[nr][nc]) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nr, nc]);
    }
  }
  return seen.size === cellCount(m);
}
var usableShape = (m) => {
  const keys = rotationsOf(m).map(keyOf);
  return new Set(keys).size === 4 && !keys.includes(keyOf(mirrorOf(m)));
};
function shapePool(H, W, cells) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const rec = (i, acc) => {
    if (acc.length === cells) {
      const g = Array.from({ length: H }, () => new Array(W).fill(0));
      for (const j of acc) g[Math.floor(j / W)][j % W] = 1;
      if (!g[0].some(Boolean) || !g.some((r) => r[0])) return;
      if (!connected(g) || !usableShape(g)) return;
      const keys = rotationsOf(g).map(keyOf);
      if (keys.some((k) => seen.has(k))) return;
      keys.forEach((k) => seen.add(k));
      found.push(g);
      return;
    }
    if (i >= H * W || acc.length + (H * W - i) < cells) return;
    acc.push(i);
    rec(i + 1, acc);
    acc.pop();
    rec(i + 1, acc);
  };
  rec(0, []);
  return found.map(toRows);
}
function movedCell(m) {
  const rots = rotationsOf(m).map(keyOf);
  const mir = keyOf(mirrorOf(m));
  const H = m.length;
  const W = m[0].length;
  for (let r1 = 0; r1 < H; r1++)
    for (let c1 = 0; c1 < W; c1++) {
      if (!m[r1][c1]) continue;
      for (let r2 = 0; r2 < H; r2++)
        for (let c2 = 0; c2 < W; c2++) {
          if (m[r2][c2]) continue;
          const g = m.map((r) => [...r]);
          g[r1][c1] = 0;
          g[r2][c2] = 1;
          if (connected(g) && !rots.includes(keyOf(g)) && keyOf(g) !== mir) return g;
        }
    }
  return null;
}
function oddOneOut(seed) {
  const family = GLYPH_FAMILIES[seed.family];
  const majority = family[seed.majority];
  const odd = family[seed.odd];
  return {
    id: seed.id,
    engineId: "OBS_001",
    category: "observation",
    engine: "Odd One Out",
    difficulty: seed.difficulty,
    prompt: "One of these is not like the others. Tap it.",
    explanation: `Every symbol is ${FAMILY_DESCRIPTIONS[seed.family]}. Exactly one of them is turned the other way.`,
    columns: seed.columns,
    tiles: Array.from({ length: seed.tiles }, (_, i) => ({
      id: `tile-${i}`,
      glyph: i === seed.oddIndex ? odd : majority
    })),
    oddTileId: `tile-${seed.oddIndex}`,
    timing: timingFor(6e3, seed.difficulty)
  };
}
function rotationMatch(seed) {
  const [H, W] = seed.grid;
  const pool = shapePool(H, W, seed.cells);
  const target = toMatrix(pool[seed.shape % pool.length]);
  const rotated = rotationsOf(target)[seed.turns];
  const mirrored = mirrorOf(target);
  const moved = movedCell(target);
  if (!moved) throw new Error(`${seed.id}: no valid moved-cell distractor`);
  const banned = /* @__PURE__ */ new Set([...rotationsOf(target).map(keyOf), keyOf(mirrored), keyOf(moved)]);
  const other = pool.map(toMatrix).find((m) => !banned.has(keyOf(m)) && !rotationsOf(m).some((r) => banned.has(keyOf(r))));
  if (!other) throw new Error(`${seed.id}: no valid different-shape distractor`);
  const distractors = [mirrored, moved, other];
  const cellsList = [];
  let d = 0;
  for (let i = 0; i < 4; i++) cellsList.push(i === seed.correctIndex ? rotated : distractors[d++]);
  const turnWord = seed.turns === 1 ? "a quarter turn clockwise" : seed.turns === 2 ? "a half turn" : "a quarter turn anticlockwise";
  return {
    id: seed.id,
    engineId: "OBS_003",
    category: "observation",
    engine: "Rotation Match",
    difficulty: seed.difficulty,
    prompt: "Which shape is the one above, turned?",
    explanation: `Give the shape ${turnWord} and it lands on the answer. One of the others is its mirror image \u2014 it looks right, but no turn gets you there. Every option has the same number of filled cells, so counting them tells you nothing.`,
    target: toRows(target),
    options: cellsList.map((m, i) => ({ id: OPTION_IDS[i], cells: toRows(m) })),
    correctOptionId: OPTION_IDS[seed.correctIndex],
    timing: timingFor(16e3, seed.difficulty)
  };
}
function pairFind(seed) {
  const total = seed.others.length + 2;
  const glyphs = [];
  let o = 0;
  for (let i = 0; i < total; i++) glyphs.push(seed.at.includes(i) ? seed.pair : seed.others[o++]);
  return {
    id: seed.id,
    engineId: "OBS_004",
    category: "observation",
    engine: "Pair Find",
    difficulty: seed.difficulty,
    prompt: "Exactly two of these match. Tap them both.",
    explanation: `Only two tiles carry the same symbol. Every other symbol on the board appears exactly once.`,
    columns: seed.columns,
    tiles: glyphs.map((glyph, i) => ({ id: `tile-${i}`, glyph })),
    pairTileIds: [`tile-${seed.at[0]}`, `tile-${seed.at[1]}`],
    timing: timingFor(14e3, seed.difficulty)
  };
}
function buildSequence(family, params, length) {
  const n = length;
  const terms = [];
  switch (family) {
    case "arithmetic": {
      const [a, d] = params;
      for (let i = 0; i < n + 1; i++) terms.push(a + i * d);
      const next = terms.pop();
      return { terms, next, explanation: `Each term adds ${d}. ${terms[n - 1]} + ${d} = ${next}.`, nearMisses: [next + d, next - 1, next + 1] };
    }
    case "geometric": {
      const [a, r] = params;
      for (let i = 0; i < n + 1; i++) terms.push(a * r ** i);
      const next = terms.pop();
      return { terms, next, explanation: `Each term is ${r} times the one before it. ${terms[n - 1]} x ${r} = ${next}.`, nearMisses: [next + terms[n - 1], next - 2, next + 2, next * 2] };
    }
    case "divide": {
      const [a, r] = params;
      let x = a;
      for (let i = 0; i < n + 1; i++) {
        terms.push(x);
        x = x / r;
      }
      const next = terms.pop();
      return { terms, next, explanation: `Each term is the one before it divided by ${r}. ${terms[n - 1]} \xF7 ${r} = ${next}.`, nearMisses: [next * r, next + 1, next + 2, next + 3] };
    }
    case "squares": {
      const [start] = params;
      for (let i = 0; i < n + 1; i++) terms.push((start + i) ** 2);
      const next = terms.pop();
      const k = start + n;
      return { terms, next, explanation: `These are the square numbers. Next is ${k} x ${k} = ${next}.`, nearMisses: [next - 1, next + k, next - k] };
    }
    case "triangular": {
      const [start] = params;
      const tri = (k) => k * (k + 1) / 2;
      for (let i = 0; i < n + 1; i++) terms.push(tri(start + i));
      const next = terms.pop();
      return { terms, next, explanation: `The gap grows by one each step. Each term is k x (k + 1) \xF7 2, so the next is ${next}.`, nearMisses: [next + 1, next - 1, next + 3] };
    }
    case "oblong": {
      const [start] = params;
      const ob = (k) => k * (k + 1);
      for (let i = 0; i < n + 1; i++) terms.push(ob(start + i));
      const next = terms.pop();
      return { terms, next, explanation: `The gaps grow by two each step. Each term is k x (k + 1), so the next is ${next}.`, nearMisses: [next - 2, next + 2, next - 6] };
    }
    case "fibonacci": {
      const [a, b] = params;
      terms.push(a, b);
      for (let i = 2; i < n + 1; i++) terms.push(terms[i - 1] + terms[i - 2]);
      const next = terms.pop();
      return { terms, next, explanation: `Each term is the sum of the two before it. ${terms[n - 2]} + ${terms[n - 1]} = ${next}.`, nearMisses: [next + 1, next - 1, next + 2, next - 2, next + terms[n - 1]] };
    }
    case "alternating": {
      const [a, d, m] = params;
      let x = a;
      for (let i = 0; i < n + 1; i++) {
        terms.push(x);
        x = i % 2 === 0 ? x + d : x * m;
      }
      const next = terms.pop();
      const added = (n - 1) % 2 === 0;
      return {
        terms,
        next,
        explanation: added ? `The rule alternates: add ${d}, then multiply by ${m}. This step adds ${d}.` : `The rule alternates: add ${d}, then multiply by ${m}. This step multiplies by ${m}.`,
        nearMisses: [added ? next * m : next + d, next + 1, next - 1]
      };
    }
  }
}
function sequenceCompletion(seed) {
  const length = seed.length ?? 5;
  const { terms, next, explanation, nearMisses } = buildSequence(seed.family, seed.params, length);
  const shown = new Set(terms);
  const fallback = Array.from({ length: 12 }, (_, k) => next + k + 1);
  const distractors = [];
  for (const value of [...nearMisses, ...fallback]) {
    if (value === next || value <= 0 || distractors.includes(value) || shown.has(value)) continue;
    distractors.push(value);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) throw new Error(`${seed.id}: could not build three distinct near-misses`);
  return {
    id: seed.id,
    engineId: "PAT_001",
    category: "pattern",
    engine: "Sequence Completion",
    difficulty: seed.difficulty,
    prompt: "What comes next in the sequence?",
    sequence: terms.map(String),
    explanation,
    ...choices(String(next), distractors.map(String), seed.correctIndex),
    timing: timingFor(9e3, seed.difficulty)
  };
}
var SHAPES = ["circle", "square", "diamond"];
var COUNTS = [1, 2, 3];
var FILLS = ["outline", "half", "solid"];
function valueAt(values, rule, r, c, k) {
  switch (rule) {
    case "rowConstant":
      return values[r];
    case "colConstant":
      return values[c];
    case "latin":
      return values[(k[0] * r + k[1] * c) % 3];
  }
}
var nextOf = (values, value) => values[(values.indexOf(value) + 1) % values.length];
var describeFigure = (f) => `${f.count} ${f.shape}${f.count > 1 ? "s" : ""}, ${f.fill}`;
var RULE_WORDS = {
  rowConstant: "stays the same along each row",
  colConstant: "stays the same down each column",
  latin: "appears exactly once in every row and every column"
};
function matrixCompletion(seed) {
  const coeffs = seed.coeffs ?? { shape: [1, 1], count: [1, 2], fill: [2, 1] };
  const figures = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      figures.push({
        shape: valueAt(SHAPES, seed.rules.shape, r, c, coeffs.shape),
        count: valueAt(COUNTS, seed.rules.count, r, c, coeffs.count),
        fill: valueAt(FILLS, seed.rules.fill, r, c, coeffs.fill)
      });
  const correct = figures[8];
  const variants = [
    { ...correct, shape: nextOf(SHAPES, correct.shape) },
    { ...correct, count: nextOf(COUNTS, correct.count) },
    { ...correct, fill: nextOf(FILLS, correct.fill) }
  ];
  const chosen = [];
  let v = 0;
  for (let i = 0; i < 4; i++) chosen.push(i === seed.correctIndex ? correct : variants[v++]);
  return {
    id: seed.id,
    engineId: "PAT_002",
    category: "pattern",
    engine: "Matrix Completion",
    difficulty: seed.difficulty,
    prompt: "One cell is missing. Which option belongs there?",
    explanation: `The shape ${RULE_WORDS[seed.rules.shape]}. The count ${RULE_WORDS[seed.rules.count]}. The fill ${RULE_WORDS[seed.rules.fill]}. Only one option satisfies all three at once.`,
    cells: figures.map((f, i) => i === 8 ? null : f),
    rules: seed.rules,
    options: chosen.map((f, i) => ({ id: OPTION_IDS[i], label: describeFigure(f) })),
    optionFigures: Object.fromEntries(chosen.map((f, i) => [OPTION_IDS[i], f])),
    correctOptionId: OPTION_IDS[seed.correctIndex],
    timing: timingFor(22e3, seed.difficulty)
  };
}
function renderDeduction(s) {
  switch (s.form) {
    case "BARBARA":
      return {
        premises: [`Every ${s.a} is a ${s.b}.`, `Every ${s.b} is ${s.c}.`],
        correct: `Every ${s.a} is ${s.c}.`,
        distractors: [
          `Everything that is ${s.c} is a ${s.b}.`,
          // illicit conversion
          `No ${s.a} is ${s.c}.`,
          // contradiction
          `At least one ${s.b} is not ${s.c}.`
          // contradicts premise 2
        ],
        explanation: `Every ${s.a} is a ${s.b}, and every ${s.b} is ${s.c} \u2014 so every ${s.a} must be ${s.c}. The others reverse a statement or contradict one.`
      };
    case "CELARENT":
      return {
        premises: [`Every ${s.a} is ${s.b}.`, `Nothing that is ${s.b} is ${s.c}.`],
        correct: `No ${s.a} is ${s.c}.`,
        distractors: [
          `At least one ${s.a} is ${s.c}.`,
          // contradiction
          `Everything that is ${s.c} is ${s.b}.`,
          // illicit conversion
          `At least one ${s.a} is not ${s.b}.`
          // contradicts premise 1
        ],
        explanation: `Every ${s.a} is ${s.b}, and nothing ${s.b} is ${s.c} \u2014 so no ${s.a} can be ${s.c}. The others reverse a statement or contradict one.`
      };
    case "RESTATEMENT_TRAP":
      return {
        premises: [`Every ${s.a} is a ${s.b}.`, `Some ${s.bPlural} are ${s.c}.`],
        correct: `Every ${s.a} is a ${s.b}.`,
        distractors: [
          `At least one ${s.a} is ${s.c}.`,
          // the tempting, invalid one
          `Everything that is ${s.c} is a ${s.b}.`,
          `No ${s.a} is ${s.c}.`
        ],
        explanation: `The ${s.c} ${s.bPlural} need not be the ones described in the first statement, so nothing follows about them either way. Only the first statement, restated, must be true.`
      };
    case "MODUS_TOLLENS":
      return {
        premises: [`If ${s.p}, then ${s.q}.`, `${cap(s.notQ)}.`],
        correct: `${cap(s.notP)}.`,
        distractors: [`${cap(s.p)}.`, s.noise[0], s.noise[1]],
        explanation: `If ${s.p}, then ${s.q} would follow. But ${s.notQ} \u2014 so ${s.notP}. Why that is the case is never stated.`
      };
    case "DISJUNCTIVE":
      return {
        premises: [`Either ${s.p}, or ${s.q}.`, `${cap(s.notQ)}.`],
        correct: `${cap(s.p)}.`,
        distractors: [`${cap(s.q)}.`, s.noise[0], s.noise[1]],
        explanation: `One of the two must hold. The second is ruled out, so the first must be true. Nothing else is stated.`
      };
  }
}
function deduction(seed) {
  const scenario = DEDUCTION_SCENARIOS[seed.scenario];
  const { premises, correct, distractors, explanation } = renderDeduction(scenario);
  return {
    id: seed.id,
    engineId: "LOG_001",
    category: "logic",
    engine: "Deduction",
    difficulty: seed.difficulty,
    prompt: "If both statements are true, which must also be true?",
    premises,
    explanation,
    ...choices(correct, distractors, seed.correctIndex),
    timing: timingFor(14e3, seed.difficulty)
  };
}
function balanceScales(seed) {
  const w = seed.weights;
  for (const [left, right] of seed.scales) {
    const l = left.reduce((t, g) => t + w[g], 0);
    const r = right.reduce((t, g) => t + w[g], 0);
    if (l !== r) throw new Error(`${seed.id}: scale does not balance (${l} vs ${r})`);
  }
  const ratio = w[seed.query.subject] / w[seed.query.unit];
  if (!Number.isInteger(ratio) || ratio <= 1) throw new Error(`${seed.id}: ratio ${ratio} must be an integer above 1`);
  const candidates = [ratio + 1, ratio - 1, ratio * 2, ratio + 2, Math.floor(ratio / 2)];
  const distractors = [];
  for (const value of candidates) {
    if (value === ratio || value <= 0 || distractors.includes(value)) continue;
    distractors.push(value);
    if (distractors.length === 3) break;
  }
  const scales = seed.scales.map(([left, right]) => ({ left, right }));
  const many = seed.scales.length > 2 ? "All three scales balance." : "Both scales balance.";
  return {
    id: seed.id,
    engineId: "LOG_002",
    category: "logic",
    engine: "Balance Scales",
    difficulty: seed.difficulty,
    prompt: `${many} Work out the missing amount.`,
    explanation: `Substitute one scale into the next until the two shapes in the question meet. One ${seed.query.subject} balances ${ratio} of the ${seed.query.unit}.`,
    scales,
    query: seed.query,
    ...choices(String(ratio), distractors.map(String), seed.correctIndex),
    timing: timingFor(22e3, seed.difficulty)
  };
}
var RELATION_WORDS = {
  "part-of": "the first is one part of the second",
  "cause-effect": "the first brings about the second",
  intensity: "the second is a far stronger version of the first",
  "scarcity-of": "the first is a severe shortage of the second",
  "member-of": "the first belongs to the group named by the second",
  "tool-function": "the first is used to do the second",
  "before-after": "the second is what follows the first",
  "origin-mature": "the first grows into the second",
  "practitioner-recipient": "the first serves the second",
  antonym: "the second is the opposite of the first"
};
function analogy(seed) {
  const e = ANALOGIES[seed.entry];
  return {
    id: seed.id,
    engineId: "LNG_001",
    category: "language-logic",
    engine: "Analogy",
    difficulty: seed.difficulty,
    prompt: "Complete the analogy.",
    relation: [`${e.given[0]} is to ${e.given[1]}`, `${e.ask} is to ?`],
    explanation: `In the first pair, ${RELATION_WORDS[e.relation]}. Carry that same relation across: ${e.ask} is to ${e.answer}. The other options sit nearby but hold a different relation.`,
    ...choices(e.answer, [...e.distractors], seed.correctIndex),
    timing: timingFor(1e4, seed.difficulty)
  };
}
function oddWordOut(seed) {
  const s = ODD_WORD_SETS[seed.set];
  const rest = s.words.filter((w) => w !== s.outlier);
  const shared = s.membership[rest[0]].find((c) => rest.every((w) => s.membership[w].includes(c)));
  const outlierCat = s.membership[s.outlier].find((c) => !rest.some((w) => s.membership[w].includes(c)));
  const others = rest.map((w) => w.toLowerCase());
  const readable = (c) => c.replace(/-/g, " ");
  return {
    id: seed.id,
    engineId: "LNG_002",
    category: "language-logic",
    engine: "Odd Word Out",
    difficulty: seed.difficulty,
    prompt: "Three of these belong together. Tap the one that does not.",
    explanation: `${cap(others[0])}, ${others[1]} and ${others[2]} are each a ${readable(shared)}. ${cap(s.outlier.toLowerCase())} is a ${readable(outlierCat)}.`,
    membership: s.membership,
    ...choices(s.outlier, rest, seed.correctIndex),
    timing: timingFor(9e3, seed.difficulty)
  };
}
function symbolSweep(seed) {
  const total = seed.rows * seed.columns;
  const glyphs = Array.from({ length: seed.targetCount }, () => seed.target);
  for (let i = glyphs.length; i < total; i++) glyphs.push(seed.distractors[i % seed.distractors.length]);
  const laid = shuffle(glyphs, hash(seed.id));
  return {
    id: seed.id,
    engineId: "ATT_001",
    category: "attention-speed",
    engine: "Symbol Sweep",
    difficulty: seed.difficulty,
    prompt: `Tap every ${seed.target}. Ignore the rest.`,
    explanation: "Accuracy counts first. A wrong tap costs you more than a slow one.",
    targetGlyph: seed.target,
    symbols: laid.map((glyph, i) => ({ id: `sym-${i}`, glyph, isTarget: glyph === seed.target })),
    columns: seed.columns,
    durationMs: seed.durationMs,
    timing: { parMs: Math.round(seed.durationMs * 0.6), limitMs: seed.durationMs }
  };
}
function rapidClassification(seed) {
  const rule = CLASSIFICATION_RULES[seed.rule];
  if (!rule) throw new Error(`${seed.id}: unknown classification rule "${seed.rule}"`);
  if (seed.items % 2 !== 0) throw new Error(`${seed.id}: item count must be even so the buckets balance`);
  const bucket0 = rule.alphabet.filter((g) => rule.bucketOf(g) === 0);
  const bucket1 = rule.alphabet.filter((g) => rule.bucketOf(g) === 1);
  const half = seed.items / 2;
  const glyphs = [];
  for (let i = 0; i < half; i++) glyphs.push(bucket0[i % bucket0.length]);
  for (let i = 0; i < half; i++) glyphs.push(bucket1[i % bucket1.length]);
  const laid = shuffle(glyphs, hash(seed.id));
  return {
    id: seed.id,
    engineId: "ATT_003",
    category: "attention-speed",
    engine: "Rapid Classification",
    difficulty: seed.difficulty,
    prompt: "Sort each symbol before the clock runs out.",
    explanation: `Accuracy first. Sorting a few carefully beats rushing all ${seed.items}.`,
    rule: rule.question,
    buckets: rule.buckets,
    items: laid.map((glyph, i) => ({ id: `item-${i}`, glyph, bucket: rule.bucketOf(glyph) })),
    durationMs: seed.durationMs,
    timing: { parMs: Math.round(seed.durationMs * 0.65), limitMs: seed.durationMs }
  };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
var REPAIR_RECOGNISERS = [
  // arithmetic
  (t) => {
    const d = t[1] - t[0];
    return d !== 0 && t.every((v, i) => i === 0 || v - t[i - 1] === d);
  },
  // geometric, integer ratio ≥ 2
  (t) => {
    if (t[0] === 0) return false;
    const r = t[1] / t[0];
    return Number.isInteger(r) && r >= 2 && t.every((v, i) => i === 0 || v === t[i - 1] * r);
  },
  // fibonacci-style recurrence
  (t) => t.length >= 3 && t.every((v, i) => i < 2 || v === t[i - 1] + t[i - 2]),
  // consecutive squares
  (t) => {
    const k = Math.round(Math.sqrt(t[0]));
    return k >= 1 && k * k === t[0] && t.every((v, i) => v === (k + i) ** 2);
  },
  // consecutive triangular numbers
  (t) => {
    const k = Math.round((Math.sqrt(8 * t[0] + 1) - 1) / 2);
    const tri = (n) => n * (n + 1) / 2;
    return k >= 1 && tri(k) === t[0] && t.every((v, i) => v === tri(k + i));
  },
  // consecutive oblong numbers
  (t) => {
    const k = Math.round((Math.sqrt(4 * t[0] + 1) - 1) / 2);
    const ob = (n) => n * (n + 1);
    return k >= 1 && ob(k) === t[0] && t.every((v, i) => v === ob(k + i));
  }
];
var followsSomeRule = (terms) => terms.every((v) => Number.isInteger(v) && v > 0 && v <= 999) && REPAIR_RECOGNISERS.some((fits) => fits(terms));
function repairablePositions(terms, maxValue = 999) {
  const out = [];
  for (let j = 0; j < terms.length; j++) {
    for (let v = 1; v <= maxValue; v++) {
      if (v === terms[j]) continue;
      const candidate = [...terms];
      candidate[j] = v;
      if (followsSomeRule(candidate)) {
        out.push(j);
        break;
      }
    }
  }
  return out;
}
function sequenceRepair(seed) {
  const { terms, explanation } = buildSequence(seed.family, seed.params, 6);
  const correct = terms[seed.corruptIndex];
  const magnitudes = [0.15, 0.25, 0.35, 0.1, 0.4];
  const deltas = magnitudes.flatMap((pct) => {
    const step = Math.max(1, Math.round(correct * pct));
    return [step, -step];
  });
  for (const delta of deltas) {
    const wrong = correct + delta;
    if (wrong <= 0 || wrong > 999 || wrong === correct) continue;
    const corrupted = [...terms];
    corrupted[seed.corruptIndex] = wrong;
    const repairable2 = repairablePositions(corrupted);
    if (repairable2.length !== 1 || repairable2[0] !== seed.corruptIndex) continue;
    return {
      id: seed.id,
      engineId: "PAT_003",
      category: "pattern",
      engine: "Sequence Repair",
      difficulty: seed.difficulty,
      prompt: "One term in this sequence is wrong. Tap it.",
      explanation: `${explanation.split(".")[0]}. So the term at position ${seed.corruptIndex + 1} should be ${correct}, not ${wrong}.`,
      terms: corrupted.map(String),
      wrongIndex: seed.corruptIndex,
      correctTerm: String(correct),
      timing: timingFor(18e3, seed.difficulty)
    };
  }
  throw new Error(
    `${seed.id}: no corruption of term ${seed.corruptIndex} leaves exactly one repairable position`
  );
}
var permutations = (items) => items.length <= 1 ? [items] : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
var clueHolds = (clue, order) => {
  switch (clue.type) {
    case "before":
      return order.indexOf(clue.a) < order.indexOf(clue.b);
    case "first":
      return order[0] === clue.x;
    case "last":
      return order[order.length - 1] === clue.x;
    case "notFirst":
      return order[0] !== clue.x;
    case "notLast":
      return order[order.length - 1] !== clue.x;
  }
};
var solutions = (items, clues) => permutations(items).filter((order) => clues.every((c) => clueHolds(c, order)));
var renderClue = (clue, verb) => {
  switch (clue.type) {
    case "before":
      return `${clue.a} ${verb} before ${clue.b}.`;
    case "first":
      return `${clue.x} was first.`;
    case "last":
      return `${clue.x} was last.`;
    case "notFirst":
      return `${clue.x} was not first.`;
    case "notLast":
      return `${clue.x} was not last.`;
  }
};
function ordering(seed) {
  const s = ORDERING_SCENARIOS[seed.scenario];
  const found = solutions(s.items, s.clues);
  if (found.length !== 1) throw new Error(`${seed.id}: ${found.length} orderings satisfy the clues \u2014 exactly one must`);
  for (let i = 0; i < s.clues.length; i++) {
    const without = s.clues.filter((_, j) => j !== i);
    if (solutions(s.items, without).length === 1) {
      throw new Error(`${seed.id}: clue ${i + 1} is redundant \u2014 the answer stays unique without it`);
    }
  }
  const answer = found[0];
  const items = s.items.map((label, i) => ({ id: `item-${i}`, label }));
  const idOf = (name) => items.find((i) => i.label === name).id;
  return {
    id: seed.id,
    engineId: "LOG_003",
    category: "logic",
    engine: "Ordering",
    difficulty: seed.difficulty,
    prompt: "Use the clues to put these in order.",
    explanation: `Only one order satisfies every clue at once: ${answer.join(", ")}. Drop any clue and a second order becomes possible.`,
    // Displayed shuffled, so the pool never hints at the answer.
    items: shuffle(items, hash(seed.id)),
    clues: s.clues.map((c) => renderClue(c, s.verb)),
    correctOrder: answer.map(idOf),
    timing: timingFor(26e3, seed.difficulty)
  };
}
var opensSentence = (text) => /^[A-Z]/.test(text);
var closesSentence = (text) => /\.$/.test(text);
function sentenceOrdering(seed) {
  const s = SENTENCE_SETS[seed.set];
  const fragments = s.fragments.map((text, i) => ({ id: `frag-${i}`, label: text }));
  const openers = fragments.filter((f) => opensSentence(f.label));
  const closers = fragments.filter((f) => closesSentence(f.label));
  if (openers.length !== 1) throw new Error(`${seed.id}: ${openers.length} fragments start with a capital \u2014 exactly one must`);
  if (closers.length !== 1) throw new Error(`${seed.id}: ${closers.length} fragments end with a full stop \u2014 exactly one must`);
  if (openers[0].id !== "frag-0") throw new Error(`${seed.id}: the capitalised fragment is not the first`);
  if (closers[0].id !== "frag-3") throw new Error(`${seed.id}: the closing fragment is not the last`);
  const [antecedent, pronoun] = s.hinge;
  const constraints = {
    opensId: "frag-0",
    closesId: "frag-3",
    follows: [[`frag-${antecedent}`, `frag-${pronoun}`]]
  };
  const orders = permutations(fragments.map((f) => f.id)).filter((order) => {
    if (order[0] !== constraints.opensId) return false;
    if (order[order.length - 1] !== constraints.closesId) return false;
    return constraints.follows.every(([a, b]) => order.indexOf(a) < order.indexOf(b));
  });
  if (orders.length !== 1) throw new Error(`${seed.id}: ${orders.length} orderings satisfy the structure \u2014 exactly one must`);
  return {
    id: seed.id,
    engineId: "LNG_003",
    category: "language-logic",
    engine: "Sentence Ordering",
    difficulty: seed.difficulty,
    prompt: "These fragments make one sentence. Tap them in order.",
    explanation: "Only one order opens with the capitalised fragment, closes with the full stop, and places the pronoun after the name it refers to.",
    fragments: shuffle(fragments, hash(seed.id)),
    correctOrder: orders[0],
    constraints,
    timing: timingFor(24e3, seed.difficulty)
  };
}
var MEMORY_GLYPHS = [...SWEEP_GLYPHS, "\u25D0", "\u25D1"];
function targetsAreScattered(indices, columns, boardSize) {
  const sorted = [...indices].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (contiguous) return false;
  const rows = new Set(sorted.map((i) => Math.floor(i / columns)));
  const cols = new Set(sorted.map((i) => i % columns));
  if (rows.size === 1 || cols.size === 1) return false;
  return boardSize > 0;
}
function memoryFlash(seed) {
  const exposureMs = MEMORY_EXPOSURE_BY_DIFFICULTY[seed.difficulty];
  if (!exposureMs) throw new Error(`${seed.id}: no exposure band for difficulty ${seed.difficulty}`);
  if (seed.boardSize < seed.targets.length * 2) throw new Error(`${seed.id}: board must hold at least twice the targets`);
  const distractors = MEMORY_GLYPHS.filter((g) => !seed.targets.includes(g)).slice(
    0,
    seed.boardSize - seed.targets.length
  );
  if (distractors.length + seed.targets.length !== seed.boardSize) throw new Error(`${seed.id}: not enough distinct glyphs for the board`);
  const glyphs = [...seed.targets, ...distractors];
  let laid = glyphs;
  let seedOffset = 0;
  for (; seedOffset < 64; seedOffset++) {
    laid = shuffle(glyphs, hash(seed.id) + seedOffset);
    const indices = seed.targets.map((g) => laid.indexOf(g));
    if (targetsAreScattered(indices, seed.columns, seed.boardSize)) break;
  }
  if (seedOffset === 64) throw new Error(`${seed.id}: could not scatter the targets`);
  const board = laid.map((glyph, i) => ({ id: `tile-${i}`, glyph }));
  const targetIds = seed.targets.map((g) => board.find((t) => t.glyph === g).id);
  const orderMatters = seed.difficulty === 5;
  const seconds = (exposureMs / 1e3).toFixed(exposureMs % 1e3 ? 1 : 0);
  return {
    id: seed.id,
    engineId: "ATT_002",
    category: "attention-speed",
    engine: "Memory Flash",
    difficulty: seed.difficulty,
    prompt: orderMatters ? "Remember the symbols, then tap them back in order." : "Remember the symbols, then find them again.",
    explanation: orderMatters ? `${seed.targets.length} symbols for ${seconds} seconds, and the order counts. Accuracy first \u2014 a wrong tile cancels a right one.` : `${seed.targets.length} symbols for ${seconds} seconds. Accuracy first \u2014 a wrong tile cancels a right one.`,
    targets: [...seed.targets],
    board,
    targetIds,
    columns: seed.columns,
    exposureMs,
    intervalMs: MEMORY_INTERVAL_MS,
    orderMatters,
    // The clock covers selection only, so it is generous by design.
    timing: timingFor(9e3, seed.difficulty)
  };
}

// src/content/engines.ts
var A11Y = {
  colorSafe: true,
  highContrast: true,
  screenScaling: true,
  handednessNeutral: true,
  noAudioDependency: true,
  noFlashingContent: true,
  minTapTargetDp: 48
};
var entry = (engineId, category, name, min, max, estimatedTimeMs, weeklyCap, minDaysBetween, rotationWeight, uiComponent, builderId, validatorId) => ({
  engineId,
  category,
  name,
  active: true,
  buildStatus: "built",
  minDifficulty: min,
  maxDifficulty: max,
  rotationWeight,
  weeklyCap,
  minDaysBetween,
  estimatedTimeMs,
  uiComponent,
  builderId,
  validatorId,
  scoringId: "scorePuzzle",
  explanationStrategy: "builder-derived",
  accessibilityProfile: { ...A11Y },
  minAppVersion: "1.0.0"
});
var ENGINE_REGISTRY = [
  entry("OBS_001", "observation", "Odd One Out", 1, 4, 15e3, 3, 2, 1, "OddOneOutEngine", "oddOneOut", "validateOddOneOut"),
  entry("OBS_003", "observation", "Rotation Match", 2, 5, 32e3, 2, 3, 0.9, "RotationMatchEngine", "rotationMatch", "validateRotationMatch"),
  entry("OBS_004", "observation", "Pair Find", 2, 4, 3e4, 2, 3, 0.8, "PairFindEngine", "pairFind", "validatePairFind"),
  entry("PAT_001", "pattern", "Sequence Completion", 1, 5, 25e3, 3, 2, 1.2, "SequenceCompletionEngine", "sequenceCompletion", "validateSequence"),
  entry("PAT_002", "pattern", "Matrix Completion", 2, 5, 45e3, 2, 3, 1, "MatrixCompletionEngine", "matrixCompletion", "validateMatrix"),
  entry("PAT_003", "pattern", "Sequence Repair", 2, 5, 32e3, 2, 3, 1, "SequenceRepairEngine", "sequenceRepair", "validateSequenceRepair"),
  entry("LOG_001", "logic", "Deduction", 2, 5, 38e3, 3, 2, 1.1, "DeductionEngine", "deduction", "validateDeduction"),
  entry("LOG_002", "logic", "Balance Scales", 2, 5, 38e3, 3, 2, 1.1, "BalanceScalesEngine", "balanceScales", "validateBalance"),
  entry("LOG_003", "logic", "Ordering", 2, 5, 45e3, 2, 3, 0.9, "OrderingEngine", "ordering", "validateOrdering"),
  entry("LNG_001", "language-logic", "Analogy", 2, 5, 25e3, 3, 2, 1.1, "AnalogyEngine", "analogy", "validateAnalogy"),
  entry("LNG_002", "language-logic", "Odd Word Out", 1, 4, 2e4, 3, 2, 1, "OddWordOutEngine", "oddWordOut", "validateOddWordOut"),
  entry("LNG_003", "language-logic", "Sentence Ordering", 2, 4, 35e3, 2, 3, 0.9, "SentenceOrderingEngine", "sentenceOrdering", "validateSentenceOrdering"),
  entry("ATT_001", "attention-speed", "Symbol Sweep", 1, 5, 2e4, 3, 2, 1.2, "SymbolSweepEngine", "symbolSweep", "validateSweep"),
  entry("ATT_002", "attention-speed", "Memory Flash", 2, 5, 22e3, 2, 3, 1, "MemoryFlashEngine", "memoryFlash", "validateMemoryFlash"),
  entry("ATT_003", "attention-speed", "Rapid Classification", 2, 5, 22e3, 2, 3, 1, "RapidClassificationEngine", "rapidClassification", "validateClassification")
];

// src/content/validators.ts
var ENGINE_CATEGORY = {
  OBS_001: "observation",
  OBS_003: "observation",
  OBS_004: "observation",
  PAT_001: "pattern",
  PAT_002: "pattern",
  PAT_003: "pattern",
  LOG_001: "logic",
  LOG_002: "logic",
  LOG_003: "logic",
  LNG_001: "language-logic",
  LNG_002: "language-logic",
  LNG_003: "language-logic",
  ATT_001: "attention-speed",
  ATT_002: "attention-speed",
  ATT_003: "attention-speed"
};
var TEXT_CHOICE_ENGINES = ["PAT_001", "PAT_002", "LOG_001", "LOG_002", "LNG_001", "LNG_002"];
var parse = (rows) => rows.map((r) => [...r].map((c) => c === "#" ? 1 : 0));
var sig = (g) => g.map((r) => r.join("")).join("/");
var turn = (g) => g[0].map((_, c) => g.map((r) => r[c]).reverse());
var flip = (g) => g.map((r) => [...r].reverse());
var turns = (g) => {
  const out = [];
  let x = g;
  for (let i = 0; i < 4; i++) {
    out.push(sig(x));
    x = turn(x);
  }
  return out;
};
var filled = (g) => g.flat().filter(Boolean).length;
function isConnected(g) {
  const H = g.length;
  const W = g[0].length;
  let start = null;
  for (let r = 0; r < H && !start; r++) for (let c = 0; c < W && !start; c++) if (g[r][c]) start = [r, c];
  if (!start) return false;
  const seen = /* @__PURE__ */ new Set([start.join()]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || !g[nr][nc]) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nr, nc]);
    }
  }
  return seen.size === filled(g);
}
function balanceRatios(scales, subject, unit, maxWeight = 16) {
  const glyphs = [...new Set(scales.flatMap((s) => [...s.left, ...s.right]))];
  const sum = (arr, w) => arr.reduce((t, g) => t + w[g], 0);
  const ratios = /* @__PURE__ */ new Set();
  const assign = (i, w) => {
    if (i === glyphs.length) {
      for (const s of scales) if (sum(s.left, w) !== sum(s.right, w)) return;
      ratios.add(w[subject] / w[unit]);
      return;
    }
    for (let v = 1; v <= maxWeight; v++) assign(i + 1, { ...w, [glyphs[i]]: v });
  };
  assign(0, {});
  return [...ratios];
}
var ATTRS = ["shape", "count", "fill"];
var DOMAINS = {
  shape: ["circle", "square", "diamond"],
  count: [1, 2, 3],
  fill: ["outline", "half", "solid"]
};
function deriveMissing(cells, rules) {
  const out = {};
  for (const attr of ATTRS) {
    const rule = rules[attr];
    const row2 = [cells[6][attr], cells[7][attr]];
    const col2 = [cells[2][attr], cells[5][attr]];
    if (rule === "rowConstant") {
      if (row2[0] !== row2[1]) return `${attr}: not constant along the last row`;
      out[attr] = row2[0];
    } else if (rule === "colConstant") {
      if (col2[0] !== col2[1]) return `${attr}: not constant down the last column`;
      out[attr] = col2[0];
    } else {
      const inRow = DOMAINS[attr].filter((v) => !row2.includes(v));
      const inCol = DOMAINS[attr].filter((v) => !col2.includes(v));
      const both = inRow.filter((v) => inCol.includes(v));
      if (both.length !== 1) return `${attr}: Latin square leaves ${both.length} candidates for the blank`;
      out[attr] = both[0];
    }
  }
  return out;
}
var sameFigure = (a, b) => ATTRS.every((k) => a[k] === b[k]);
function validateCommon(p) {
  const out = [];
  if (!(p.engineId in ENGINE_CATEGORY)) out.push(`unknown engine id "${p.engineId}"`);
  else if (ENGINE_CATEGORY[p.engineId] !== p.category) out.push(`engine ${p.engineId} does not belong to category ${p.category}`);
  if (!p.prompt.trim()) out.push("empty prompt");
  if (p.explanation.trim().length < 25) out.push("explanation is too short to explain anything");
  if (!/[.!?]$/.test(p.explanation.trim())) out.push("explanation does not end in a full stop");
  if (p.timing.parMs >= p.timing.limitMs) out.push("par time is not before the limit");
  if (p.difficulty < 1 || p.difficulty > 5) out.push(`difficulty ${p.difficulty} outside 1\u20135`);
  if (TEXT_CHOICE_ENGINES.includes(p.engineId)) {
    const q = p;
    const ids = q.options.map((o) => o.id);
    const labels = q.options.map((o) => o.label.trim());
    if (q.options.length !== 4) out.push(`expected four options, found ${q.options.length}`);
    if (new Set(ids).size !== ids.length) out.push("duplicate option ids");
    if (new Set(labels).size !== labels.length) out.push("duplicate option labels");
    if (!ids.includes(q.correctOptionId)) out.push("correctOptionId names no option");
    const numeric = labels.every((l) => /^\d+$/.test(l));
    if (!numeric && labels.length > 1) {
      const correct = q.options.find((o) => o.id === q.correctOptionId).label;
      const lengths = labels.map((l) => l.length);
      const longest = Math.max(...lengths);
      const shortest = Math.min(...lengths);
      const uniquelyLongest = lengths.filter((l) => l === longest).length === 1;
      if (uniquelyLongest && correct.length === longest && longest > shortest * 1.6) {
        out.push("the correct option is uniquely and markedly the longest");
      }
    }
  }
  return out;
}
function validateOddOneOut(p) {
  const out = [];
  const odd = p.tiles.find((t) => t.id === p.oddTileId);
  if (!odd) return ["oddTileId names no tile"];
  const counts = /* @__PURE__ */ new Map();
  for (const t of p.tiles) counts.set(t.glyph, (counts.get(t.glyph) ?? 0) + 1);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (counts.size !== 2) out.push(`expected two distinct glyphs, found ${counts.size}`);
  if (counts.get(odd.glyph) !== 1) out.push("the odd glyph appears more than once");
  if (odd.glyph === majority[0]) out.push("the odd tile carries the majority glyph");
  if (p.tiles.length % p.columns !== 0) out.push("grid does not fill complete rows");
  if (new Set(p.tiles.map((t) => t.id)).size !== p.tiles.length) out.push("duplicate tile ids");
  if (p.oddTileId === "tile-0" || p.oddTileId === `tile-${p.tiles.length - 1}`) out.push("odd tile sits in the first or last position");
  if (p.tiles.length / p.columns < 3) out.push("grid is too shallow to require a scan");
  return out;
}
function validateRotationMatch(p) {
  const out = [];
  const target = parse(p.target);
  const rots = turns(target);
  if (new Set(rots).size !== 4) out.push("target has rotational symmetry, so two candidates coincide");
  if (rots.includes(sig(flip(target)))) out.push("target is achiral, so the mirror distractor is also a rotation");
  if (!isConnected(target)) out.push("target is not a single connected shape");
  const opts = p.options.map((o) => ({ id: o.id, g: parse(o.cells) }));
  const rotationOpts = opts.filter((o) => rots.includes(sig(o.g)));
  if (opts.length !== 4) out.push(`expected four candidates, found ${opts.length}`);
  if (rotationOpts.length !== 1) out.push(`${rotationOpts.length} candidates are rotations of the target \u2014 exactly one must be`);
  else if (rotationOpts[0].id !== p.correctOptionId) out.push("the rotation is not the correct option");
  if (!opts.every((o) => filled(o.g) === filled(target))) out.push("a candidate has a different cell count \u2014 it can be eliminated by counting");
  if (new Set(opts.map((o) => sig(o.g))).size !== opts.length) out.push("two candidates are identical");
  if (!opts.every((o) => o.g.length === target.length && o.g[0].length === target[0].length)) out.push("candidates do not share the target grid size");
  if (!opts.some((o) => sig(o.g) === sig(flip(target)))) out.push("no mirror-image distractor");
  if (!opts.every((o) => isConnected(o.g))) out.push("a candidate is not a single connected shape");
  return out;
}
function validatePairFind(p) {
  const out = [];
  const counts = /* @__PURE__ */ new Map();
  for (const t of p.tiles) counts.set(t.glyph, (counts.get(t.glyph) ?? 0) + 1);
  const twice = [...counts.entries()].filter(([, c]) => c === 2);
  if (twice.length !== 1) out.push(`${twice.length} glyphs appear exactly twice \u2014 exactly one must`);
  if ([...counts.values()].some((c) => c > 2)) out.push("a glyph appears more than twice");
  const pairGlyphs = p.pairTileIds.map((id) => p.tiles.find((t) => t.id === id)?.glyph);
  if (pairGlyphs[0] !== pairGlyphs[1]) out.push("pairTileIds name two different glyphs");
  if (twice[0] && pairGlyphs[0] !== twice[0][0]) out.push("pairTileIds do not name the repeated glyph");
  if (p.tiles.length % p.columns !== 0) out.push("grid does not fill complete rows");
  if (new Set(p.tiles.map((t) => t.id)).size !== p.tiles.length) out.push("duplicate tile ids");
  const pos = p.pairTileIds.map((id) => p.tiles.findIndex((t) => t.id === id));
  const rc = pos.map((i) => [Math.floor(i / p.columns), i % p.columns]);
  if (rc[0][0] === rc[1][0]) out.push("the pair shares a row");
  if (rc[0][1] === rc[1][1]) out.push("the pair shares a column");
  if (Math.abs(rc[0][0] - rc[1][0]) <= 1 && Math.abs(rc[0][1] - rc[1][1]) <= 1) out.push("the pair is adjacent");
  return out;
}
function validateSequence(p) {
  const out = [];
  if (p.sequence.length < 4) out.push("too few visible terms to fix a rule");
  if (p.sequence.length > 5) out.push("sequence will wrap on a 320dp screen");
  if (p.sequence.some((t) => t.length > 3)) out.push("a term is too wide for the chip row");
  if (new Set(p.sequence).size !== p.sequence.length && p.sequence[0] !== p.sequence[1]) {
    out.push("the visible run repeats a term");
  }
  const values = p.options.map((o) => Number(o.label));
  if (values.some((v) => !Number.isFinite(v))) out.push("a non-numeric option");
  if (values.some((v) => v <= 0)) out.push("a non-positive option");
  if (new Set(values).size !== values.length) out.push("two options share a value");
  const shown = new Set(p.sequence.map(Number));
  for (const o of p.options) if (o.id !== p.correctOptionId && shown.has(Number(o.label))) out.push(`distractor ${o.label} already appears in the sequence`);
  return out;
}
function validateMatrix(p) {
  const out = [];
  if (p.cells.length !== 9 || p.cells[8] !== null) return ["the grid must be nine cells with the last one blank"];
  if (!p.cells.slice(0, 8).every(Boolean)) return ["a visible cell is missing"];
  const derived = deriveMissing(p.cells, p.rules);
  if (typeof derived === "string") return [derived];
  for (const attr of ATTRS) {
    const seen = new Set(p.cells.slice(0, 8).map((c) => c[attr]));
    if (seen.size < 2) out.push(`${attr} is constant across the grid \u2014 it is decoration, not a rule`);
  }
  const correct = p.optionFigures[p.correctOptionId];
  if (!correct) out.push("correctOptionId names no figure");
  else if (!sameFigure(correct, derived)) out.push("the correct option is not the figure the rules derive");
  const figures = p.options.map((o) => p.optionFigures[o.id]);
  const satisfying = figures.filter((f) => sameFigure(f, derived));
  if (satisfying.length !== 1) out.push(`${satisfying.length} options satisfy every rule \u2014 exactly one must`);
  if (new Set(figures.map((f) => JSON.stringify(f))).size !== figures.length) out.push("two options are the same figure");
  for (const o of p.options) {
    if (o.id === p.correctOptionId) continue;
    const differing = ATTRS.filter((a) => p.optionFigures[o.id][a] !== derived[a]).length;
    if (differing !== 1) out.push(`distractor ${o.id} differs in ${differing} attributes \u2014 it must differ in exactly one`);
  }
  return out;
}
function validateDeduction(p) {
  const out = [];
  if (p.premises.length < 2) out.push("fewer than two premises");
  if (p.premises.some((s) => s.split(/\s+/).length > 18)) out.push("a premise is longer than 18 words");
  if (p.options.some((o) => o.label.split(/\s+/).length > 14)) out.push("an option is longer than 14 words");
  if (p.premises.some((s) => !/[.]$/.test(s.trim()))) out.push("a premise does not end in a full stop");
  const correct = p.options.find((o) => o.id === p.correctOptionId).label;
  const isRestatement = p.premises.some((s) => s.trim() === correct.trim());
  if (isRestatement && !/restated|only the first statement/i.test(p.explanation)) {
    out.push("the answer restates a premise but the explanation does not say why that is the point");
  }
  return out;
}
function validateBalance(p) {
  const out = [];
  if (p.scales.length < 2) out.push("fewer than two scales");
  if (p.scales.some((s) => !s.left.length || !s.right.length)) out.push("a scale has an empty pan");
  const together = p.scales.some(
    (s) => [...s.left, ...s.right].includes(p.query.subject) && [...s.left, ...s.right].includes(p.query.unit)
  );
  if (together) out.push("subject and unit share a scale \u2014 the answer can be read off without substituting");
  const ratios = balanceRatios(p.scales, p.query.subject, p.query.unit);
  if (ratios.length === 0) out.push("the scales admit no consistent integer weighting");
  else if (ratios.length > 1) out.push(`the scales admit ${ratios.length} different ratios \u2014 the answer is not unique`);
  else {
    const ratio = ratios[0];
    if (!Number.isInteger(ratio) || ratio <= 0) out.push(`the ratio ${ratio} is not a positive integer`);
    const correct = Number(p.options.find((o) => o.id === p.correctOptionId).label);
    if (correct !== ratio) out.push(`the correct option (${correct}) is not the solved ratio (${ratio})`);
    const values = p.options.map((o) => Number(o.label));
    if (values.filter((v) => v === ratio).length !== 1) out.push("the ratio appears as more than one option");
    if (values.some((v) => !Number.isInteger(v) || v <= 0)) out.push("an option is not a positive integer");
  }
  return out;
}
function validateAnalogy(p) {
  const out = [];
  if (p.relation.length !== 2) out.push("relation must render as two lines");
  if (p.options.some((o) => /\s/.test(o.label))) out.push("an option is more than one word");
  if (p.options.some((o) => !/^[A-Z]{3,12}$/.test(o.label))) out.push("an option is outside the common-word band (3\u201312 letters, uppercase)");
  const words = p.relation.join(" ");
  for (const o of p.options) if (words.includes(o.label)) out.push(`option ${o.label} already appears in the relation`);
  return out;
}
function validateOddWordOut(p) {
  const out = [];
  const words = p.options.map((o) => o.label);
  if (words.length !== 4) out.push("expected four words");
  if (!words.every((w) => Array.isArray(p.membership[w]))) return ["membership does not cover every option"];
  if (!words.every((w) => /^[A-Z]{3,12}$/.test(w))) out.push("a word is outside the common-word band");
  const outliers = words.filter((candidate) => {
    const rest = words.filter((w) => w !== candidate);
    const shared = p.membership[rest[0]].filter((c) => rest.every((w) => p.membership[w].includes(c)));
    return shared.some((c) => !p.membership[candidate].includes(c));
  });
  if (outliers.length !== 1) out.push(`${outliers.length} words qualify as the odd one out \u2014 exactly one must`);
  else if (p.options.find((o) => o.id === p.correctOptionId).label !== outliers[0]) out.push("the correct option is not the odd word");
  return out;
}
function validateSweep(p) {
  const out = [];
  const targets = p.symbols.filter((s) => s.isTarget);
  const distractors = new Set(p.symbols.filter((s) => !s.isTarget).map((s) => s.glyph));
  if (targets.length < 5) out.push("fewer than five targets");
  if (p.symbols.length - targets.length < targets.length) out.push("fewer distractors than targets");
  if (distractors.size < 2) out.push("only one distractor glyph \u2014 this is a counting task, not a sweep");
  if (!p.symbols.every((s) => s.isTarget === (s.glyph === p.targetGlyph))) out.push("isTarget disagrees with the target glyph");
  if (p.symbols.length % p.columns !== 0) out.push("grid does not fill complete rows");
  if (new Set(p.symbols.map((s) => s.id)).size !== p.symbols.length) out.push("duplicate symbol ids");
  if (!p.prompt.includes(p.targetGlyph)) out.push("the prompt does not name the target glyph");
  if (p.durationMs < p.timing.limitMs) out.push("the window is shorter than the scoring limit");
  if (p.columns > 5) out.push("more than five columns falls below 48dp at 320dp width");
  return out;
}
function validateClassification(p) {
  const out = [];
  const rule = Object.values(CLASSIFICATION_RULES).find((r) => r.question === p.rule);
  if (!rule) return [`the rule "${p.rule}" is not in the curated table`];
  if (p.buckets[0] !== rule.buckets[0] || p.buckets[1] !== rule.buckets[1]) out.push("buckets do not match the curated rule");
  if (p.items.length < 6) out.push("too few items to find a rhythm");
  if (new Set(p.items.map((i) => i.id)).size !== p.items.length) out.push("duplicate item ids");
  if (!p.items.every((i) => rule.alphabet.includes(i.glyph))) out.push("an item uses a glyph outside the curated alphabet");
  if (!p.items.every((i) => i.bucket === rule.bucketOf(i.glyph))) out.push("an item is filed in the wrong bucket");
  if (p.durationMs < p.timing.limitMs) out.push("the window is shorter than the scoring limit");
  const share = p.items.filter((i) => i.bucket === 0).length / p.items.length;
  if (share < 0.4 || share > 0.6) out.push(`buckets are ${Math.round(share * 100)}/${100 - Math.round(share * 100)} \u2014 one-sided tapping could win`);
  return out;
}
var RULES_FOR_REPAIR = [
  (t) => {
    const step = t[1] - t[0];
    return step !== 0 && t.every((v, i) => i === 0 || v - t[i - 1] === step);
  },
  (t) => {
    if (!t[0]) return false;
    const ratio = t[1] / t[0];
    return Number.isInteger(ratio) && ratio >= 2 && t.every((v, i) => i === 0 || v === t[i - 1] * ratio);
  },
  (t) => t.length >= 3 && t.every((v, i) => i < 2 || v === t[i - 1] + t[i - 2]),
  (t) => {
    const root = Math.round(Math.sqrt(t[0]));
    return root >= 1 && root ** 2 === t[0] && t.every((v, i) => v === (root + i) ** 2);
  },
  (t) => {
    const n = Math.round((Math.sqrt(8 * t[0] + 1) - 1) / 2);
    return n >= 1 && n * (n + 1) / 2 === t[0] && t.every((v, i) => v === (n + i) * (n + i + 1) / 2);
  },
  (t) => {
    const n = Math.round((Math.sqrt(4 * t[0] + 1) - 1) / 2);
    return n >= 1 && n * (n + 1) === t[0] && t.every((v, i) => v === (n + i) * (n + i + 1));
  }
];
var obeysARule = (terms) => terms.every((v) => Number.isInteger(v) && v > 0 && v <= 999) && RULES_FOR_REPAIR.some((fits) => fits(terms));
function repairable(terms) {
  const out = [];
  for (let j = 0; j < terms.length; j++) {
    for (let v = 1; v <= 999; v++) {
      if (v === terms[j]) continue;
      const trial = [...terms];
      trial[j] = v;
      if (obeysARule(trial)) {
        out.push(j);
        break;
      }
    }
  }
  return out;
}
function validateSequenceRepair(p) {
  const out = [];
  const terms = p.terms.map(Number);
  if (terms.length !== 6) out.push(`expected six terms, found ${terms.length}`);
  if (terms.some((t) => !Number.isInteger(t) || t <= 0)) out.push("a term is not a positive integer");
  if (p.terms.some((t) => t.length > 3)) out.push("a term is too wide for the chip row at 320dp");
  if (p.wrongIndex === 0 || p.wrongIndex === terms.length - 1) {
    out.push('the corrupted term is first or last \u2014 either can be "repaired" by shortening the run');
  }
  if (String(terms[p.wrongIndex]) === p.correctTerm) out.push("the corrupted term equals the correct term");
  const repaired = [...terms];
  repaired[p.wrongIndex] = Number(p.correctTerm);
  if (!obeysARule(repaired)) out.push("replacing the named term does not restore any approved rule");
  const positions = repairable(terms);
  if (positions.length !== 1) {
    out.push(`${positions.length} positions admit a single-term repair (${positions.join(", ")}) \u2014 exactly one must`);
  } else if (positions[0] !== p.wrongIndex) {
    out.push(`the repairable position is ${positions[0]}, not the named ${p.wrongIndex}`);
  }
  const correct = Number(p.correctTerm);
  const delta = Math.abs(terms[p.wrongIndex] - correct);
  if (delta === 0) out.push("the corruption has zero magnitude");
  if (correct >= 10 && delta / correct > 0.5) out.push("the corruption is more than half the correct value \u2014 too obvious");
  return out;
}
var allOrders = (xs) => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => allOrders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
function clueSatisfied(clue, order, labelOf) {
  const names = order.map(labelOf);
  let m = clue.match(/^(\S+) \S+ before (\S+)\.$/);
  if (m) return names.indexOf(m[1]) < names.indexOf(m[2]);
  m = clue.match(/^(\S+) was first\.$/);
  if (m) return names[0] === m[1];
  m = clue.match(/^(\S+) was last\.$/);
  if (m) return names[names.length - 1] === m[1];
  m = clue.match(/^(\S+) was not first\.$/);
  if (m) return names[0] !== m[1];
  m = clue.match(/^(\S+) was not last\.$/);
  if (m) return names[names.length - 1] !== m[1];
  return null;
}
function validateOrdering(p) {
  const out = [];
  const ids = p.items.map((i) => i.id);
  const labelOf = (id) => p.items.find((i) => i.id === id).label;
  if (p.items.length !== 4) out.push(`expected four items, found ${p.items.length}`);
  if (new Set(ids).size !== ids.length) out.push("duplicate item ids");
  if (new Set(p.items.map((i) => i.label)).size !== p.items.length) out.push("duplicate item labels");
  if (p.clues.length < 3) out.push("fewer than three clues");
  if (p.clues.some((c) => c.split(/\s+/).length > 12)) out.push("a clue is longer than 12 words");
  for (const clue of p.clues) {
    if (clueSatisfied(clue, ids, labelOf) === null) out.push(`unparseable clue: "${clue}"`);
    for (const word of clue.replace(/[.]/g, "").split(/\s+/)) {
      if (/^[A-Z][a-z]+$/.test(word) && !p.items.some((i) => i.label === word)) {
        out.push(`clue names "${word}", which is not one of the items`);
      }
    }
  }
  if (out.length) return out;
  const satisfying = allOrders(ids).filter((order) => p.clues.every((c) => clueSatisfied(c, order, labelOf) === true));
  if (satisfying.length !== 1) out.push(`${satisfying.length} orderings satisfy the clues \u2014 exactly one must`);
  else if (satisfying[0].join() !== p.correctOrder.join()) out.push("correctOrder is not the ordering the clues imply");
  for (let i = 0; i < p.clues.length; i++) {
    const without = p.clues.filter((_, j) => j !== i);
    const count = allOrders(ids).filter((order) => without.every((c) => clueSatisfied(c, order, labelOf) === true)).length;
    if (count === 1) out.push(`clue ${i + 1} is redundant \u2014 the answer stays unique without it`);
  }
  return out;
}
var LEADING_CONNECTIVE = /^(and|so|but|because|which|where|while|until|though|although)\b/i;
function validateSentenceOrdering(p) {
  const out = [];
  const ids = p.fragments.map((f) => f.id);
  const textOf = (id) => p.fragments.find((f) => f.id === id).label;
  if (p.fragments.length !== 4) out.push(`expected four fragments, found ${p.fragments.length}`);
  if (new Set(ids).size !== ids.length) out.push("duplicate fragment ids");
  if (p.fragments.some((f) => f.label.split(/\s+/).length > 6 + 2)) out.push("a fragment is too long to stay legible at 320dp");
  const capitalised = p.fragments.filter((f) => /^[A-Z]/.test(f.label));
  const terminal = p.fragments.filter((f) => /\.$/.test(f.label));
  if (capitalised.length !== 1) out.push(`${capitalised.length} fragments start with a capital \u2014 exactly one must`);
  if (terminal.length !== 1) out.push(`${terminal.length} fragments end with a full stop \u2014 exactly one must`);
  if (capitalised[0] && capitalised[0].id !== p.constraints.opensId) out.push("the capitalised fragment is not the declared opener");
  if (terminal[0] && terminal[0].id !== p.constraints.closesId) out.push("the terminal fragment is not the declared closer");
  if (LEADING_CONNECTIVE.test(textOf(p.constraints.opensId))) out.push("the opening fragment starts with a connective");
  for (const [a, b] of p.constraints.follows) {
    if (!ids.includes(a) || !ids.includes(b)) out.push("a follows-constraint names an unknown fragment");
  }
  if (out.length) return out;
  const satisfying = allOrders(ids).filter((order) => {
    if (order[0] !== p.constraints.opensId) return false;
    if (order[order.length - 1] !== p.constraints.closesId) return false;
    return p.constraints.follows.every(([a, b]) => order.indexOf(a) < order.indexOf(b));
  });
  if (satisfying.length !== 1) out.push(`${satisfying.length} orderings satisfy the structure \u2014 exactly one must`);
  else if (satisfying[0].join() !== p.correctOrder.join()) out.push("correctOrder is not the ordering the constraints imply");
  const assembled = p.correctOrder.map(textOf).join(" ");
  if (!/^[A-Z]/.test(assembled)) out.push("the assembled sentence does not begin with a capital");
  if (!/\.$/.test(assembled)) out.push("the assembled sentence does not end with a full stop");
  return out;
}
function validateMemoryFlash(p) {
  const out = [];
  const boardGlyphs = p.board.map((t) => t.glyph);
  if (p.targets.length < 3 || p.targets.length > 5) out.push(`${p.targets.length} targets \u2014 the band is 3 to 5`);
  if (p.board.length < p.targets.length * 2) out.push("the board holds fewer than twice the targets");
  if (new Set(boardGlyphs).size !== boardGlyphs.length) out.push("the board repeats a glyph");
  if (new Set(p.board.map((t) => t.id)).size !== p.board.length) out.push("duplicate board tile ids");
  if (p.board.length % p.columns !== 0) out.push("the board does not fill complete rows");
  if (p.columns > 4) out.push("more than four columns falls below 48dp at 320dp width");
  for (const glyph of p.targets) {
    const hits = boardGlyphs.filter((g) => g === glyph).length;
    if (hits !== 1) out.push(`target ${glyph} appears ${hits} times on the board \u2014 it must appear exactly once`);
  }
  if (new Set(p.targets).size !== p.targets.length) out.push("a target is repeated in the exposure");
  if (p.targetIds.length !== p.targets.length) out.push("targetIds does not match the targets");
  for (let i = 0; i < p.targets.length; i++) {
    const tile = p.board.find((t) => t.id === p.targetIds[i]);
    if (!tile) out.push(`targetIds[${i}] names no board tile`);
    else if (tile.glyph !== p.targets[i]) out.push(`targetIds[${i}] points at ${tile.glyph}, not ${p.targets[i]}`);
  }
  if (p.exposureMs < 1500) out.push(`exposure ${p.exposureMs}ms is below the 1500ms floor`);
  if (p.intervalMs < 300 || p.intervalMs > 1200) out.push(`interval ${p.intervalMs}ms outside the 300\u20131200ms band`);
  if (p.orderMatters !== (p.difficulty === 5)) out.push("order only matters at difficulty 5");
  const indices = p.targetIds.map((id) => p.board.findIndex((t) => t.id === id)).sort((a, b) => a - b);
  if (indices.every((v, i) => i === 0 || v === indices[i - 1] + 1)) out.push("the targets sit in a contiguous run");
  if (new Set(indices.map((i) => Math.floor(i / p.columns))).size === 1) out.push("every target sits in one row");
  if (new Set(indices.map((i) => i % p.columns)).size === 1) out.push("every target sits in one column");
  return out;
}
function validatePuzzle(p) {
  const out = validateCommon(p);
  switch (p.engineId) {
    case "OBS_001":
      out.push(...validateOddOneOut(p));
      break;
    case "OBS_003":
      out.push(...validateRotationMatch(p));
      break;
    case "OBS_004":
      out.push(...validatePairFind(p));
      break;
    case "PAT_001":
      out.push(...validateSequence(p));
      break;
    case "PAT_002":
      out.push(...validateMatrix(p));
      break;
    case "PAT_003":
      out.push(...validateSequenceRepair(p));
      break;
    case "LOG_001":
      out.push(...validateDeduction(p));
      break;
    case "LOG_002":
      out.push(...validateBalance(p));
      break;
    case "LOG_003":
      out.push(...validateOrdering(p));
      break;
    case "LNG_001":
      out.push(...validateAnalogy(p));
      break;
    case "LNG_002":
      out.push(...validateOddWordOut(p));
      break;
    case "LNG_003":
      out.push(...validateSentenceOrdering(p));
      break;
    case "ATT_001":
      out.push(...validateSweep(p));
      break;
    case "ATT_002":
      out.push(...validateMemoryFlash(p));
      break;
    case "ATT_003":
      out.push(...validateClassification(p));
      break;
  }
  return out;
}

// src/infrastructure/supabase/publicFields.ts
var ALWAYS_PRIVATE_FIELDS = ["explanation"];
var ENGINE_SPLIT = {
  OBS_001: { delete: ["oddTileId"] },
  OBS_003: { delete: ["correctOptionId"] },
  OBS_004: { delete: ["pairTileIds"] },
  PAT_001: { delete: ["correctOptionId"] },
  PAT_002: { delete: ["correctOptionId"] },
  PAT_003: { delete: ["wrongIndex", "correctTerm"] },
  LOG_001: { delete: ["correctOptionId"] },
  LOG_002: { delete: ["correctOptionId"] },
  LOG_003: { delete: ["correctOrder"] },
  LNG_001: { delete: ["correctOptionId"] },
  // `membership` encodes which word is the outlier, so it is part of the answer.
  LNG_002: { delete: ["correctOptionId", "membership"] },
  // `constraints` pin the one valid ordering, so they are the answer.
  LNG_003: { delete: ["correctOrder", "constraints"] },
  // The grid must render, but which tiles are targets is the answer: strip
  // `isTarget` from each symbol.
  ATT_001: { delete: [], reshape: { field: "symbols", answerKey: "isTarget" } },
  // The board and the shown `targets` are gameplay; which board tiles carry them
  // (`targetIds`) is the canonical answer key. (Memory Flash's real secret is the
  // player's memory — the answer is derivable from what they were shown. See the
  // design doc; the key is stored for a canonical record, not to hide it.)
  ATT_002: { delete: ["targetIds"] },
  // The stream must render, but each item's correct bucket is the answer.
  ATT_003: { delete: [], reshape: { field: "items", answerKey: "bucket" } }
};

// src/content/authoringBoundary.ts
var BUILDER_FNS = {
  oddOneOut,
  rotationMatch,
  pairFind,
  sequenceCompletion,
  matrixCompletion,
  sequenceRepair,
  deduction,
  balanceScales,
  ordering,
  analogy,
  oddWordOut,
  sentenceOrdering,
  symbolSweep,
  memoryFlash,
  rapidClassification
};
var BUILDERS = Object.fromEntries(
  ENGINE_REGISTRY.map((e) => {
    const fn = BUILDER_FNS[e.builderId];
    if (!fn) throw new Error(`authoringBoundary: no builder for ${e.engineId} (${e.builderId})`);
    return [e.engineId, fn];
  })
);
var ENGINE_IDS = ENGINE_REGISTRY.map((e) => e.engineId);
function isSupportedEngine(engineId) {
  const e = ENGINE_REGISTRY.find((x) => x.engineId === engineId);
  return !!e && e.active && e.buildStatus === "built";
}
function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const obj = value;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(",")}}`;
}
function splitBuilt(puzzle) {
  const spec = ENGINE_SPLIT[puzzle.engineId];
  if (!spec) throw new Error(`no split descriptor for engine ${puzzle.engineId}`);
  const del = /* @__PURE__ */ new Set([...spec.delete, ...ALWAYS_PRIVATE_FIELDS]);
  const pub = {};
  const answer = {};
  for (const [key, val] of Object.entries(puzzle)) {
    if (del.has(key)) answer[key] = val;
    else pub[key] = val;
  }
  if (spec.reshape) {
    const { field, answerKey } = spec.reshape;
    const elements = puzzle[field];
    pub[field] = elements.map((el) => {
      const { [answerKey]: _omit, ...rest } = el;
      return rest;
    });
    answer[field] = elements.map((el) => ({ id: el.id, [answerKey]: el[answerKey] }));
  }
  return { public: pub, answer };
}
function assertNoAnswerLeak(publicPayload, puzzle) {
  const spec = ENGINE_SPLIT[puzzle.engineId];
  const leaks = [];
  for (const field of [...spec.delete, ...ALWAYS_PRIVATE_FIELDS]) {
    if (field in publicPayload) leaks.push(field);
  }
  if (spec.reshape) {
    const { field, answerKey } = spec.reshape;
    const arr = publicPayload[field] ?? [];
    if (arr.some((el) => answerKey in el)) leaks.push(`${field}[].${answerKey}`);
  }
  if (leaks.length) throw new Error(`${puzzle.id}: public payload leaks answer field(s): ${leaks.join(", ")}`);
}
function buildCandidate(engineId, seed) {
  if (!isSupportedEngine(engineId)) {
    return { ok: false, code: "unsupported_engine", message: `engine ${engineId} is not an active built engine` };
  }
  if (seed === null || typeof seed !== "object") {
    return { ok: false, code: "invalid_seed", message: "seed must be an object" };
  }
  const builder = BUILDERS[engineId];
  let puzzle;
  try {
    puzzle = builder(seed);
  } catch (e) {
    return { ok: false, code: "build_error", message: e instanceof Error ? e.message : String(e) };
  }
  const findings = validatePuzzle(puzzle).slice();
  const { public: publicPayload, answer } = splitBuilt(puzzle);
  return {
    ok: true,
    puzzle,
    publicPayload,
    answer,
    contentString: canonicalStringify(puzzle),
    seedString: canonicalStringify(seed),
    findings
  };
}
export {
  BUILDERS,
  ENGINE_IDS,
  ENGINE_REGISTRY,
  assertNoAnswerLeak,
  buildCandidate,
  canonicalStringify,
  isSupportedEngine,
  splitBuilt,
  validatePuzzle
};
