/**
 * BOQ normalization dictionaries (AISE-014) — deterministic, versioned,
 * CODE-DEFINED (data files are deliberately avoided: the dictionary IS the
 * reviewable source, and its version is recorded in every derived view).
 *
 * Three dictionaries, all case-insensitive where text is matched:
 *
 *  - `UNIT_DICTIONARY`          canonical unit codes (ISO 80000-ish +
 *                              construction practice) with synonym/alias
 *                              spellings. Documented deviation: the work
 *                              order's illustrative canonical "no" is kept
 *                              as an ALIAS of the canonical "nr" so every
 *                              count spelling ("no", "nos", "No.", "each",
 *                              "pc"...) lands on exactly ONE code.
 *  - `CONCEPT_DICTIONARY`       construction concept codes with canonical
 *                              keywords, synonyms and structural regex
 *                              patterns. Deliberate overlaps create HONEST
 *                              ambiguity: bare "steel" and bare "block"
 *                              are keywords of two concepts each, so a
 *                              description that says only that records
 *                              alternatives instead of guessing.
 *  - `ABBREVIATION_DICTIONARY`  BOQ shorthand -> plain wording. Expansion
 *                              is the ONLY textual transformation the
 *                              normalizer ever applies — the original
 *                              wording stays recoverable.
 *
 * `DICTIONARY_VERSION` changes whenever any entry changes; derived views
 * are keyed (content-addressed) by `sha256(importId + DICTIONARY_VERSION)`,
 * so a new dictionary version writes NEW view files and never overwrites
 * views derived under an older version.
 *
 * Determinism: all matcher regexes are compiled once at module load, in
 * declaration order; lookup maps are built in declaration order. No
 * randomness, no timestamps, no environment reads.
 */

/** Version of all three dictionaries; stamped into every derived view. */
export const DICTIONARY_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* Unit dictionary                                                     */
/* ------------------------------------------------------------------ */

/** One canonical unit code plus its alias/synonym spellings. */
export interface UnitDictionaryEntry {
  /** Canonical unit code (the normalized output, e.g. "m3"). */
  readonly code: string;
  /** Alias/synonym spellings (already lowercase; matched case-insensitively). */
  readonly aliases: readonly string[];
}

export const UNIT_DICTIONARY: readonly UnitDictionaryEntry[] = [
  // Volume
  { code: "m3", aliases: ["cum", "cu.m", "cu m", "cubic metre", "cubic meter", "m³", "cbm", "m^3"] },
  // Area
  { code: "m2", aliases: ["sqm", "sq.m", "sq m", "square metre", "square meter", "m²", "sq", "m^2"] },
  // Length
  { code: "m", aliases: ["metre", "meter", "lm", "lin.m", "lin m", "rmt"] },
  { code: "mm", aliases: ["millimetre", "millimeter"] },
  // Mass
  { code: "kg", aliases: ["kilogram", "kilogramme", "kgs", "kilo"] },
  { code: "t", aliases: ["tonne", "tonnes", "ton", "tons"] },
  // Volume (liquid)
  { code: "l", aliases: ["litre", "liter", "lt", "ltr"] },
  // Count (the design's "no" is an alias here — see module header)
  {
    code: "nr",
    aliases: ["no", "nos", "each", "pc", "pcs", "piece", "pieces", "number", "numbers", "ea"],
  },
  // Assemblies / work packages
  { code: "set", aliases: ["sets"] },
  { code: "lot", aliases: ["lots"] },
  // Time
  { code: "hr", aliases: ["hour", "hours", "hrs"] },
  { code: "day", aliases: ["days"] },
  // Construction-practice extras
  { code: "bag", aliases: ["bags"] },
  { code: "trip", aliases: ["trips"] },
];

/** Canonical codes in declaration order (also the exact-match set). */
export const UNIT_CODES: readonly string[] = UNIT_DICTIONARY.map((entry) => entry.code);

/**
 * Alias -> canonical code (first declaration wins; the dictionaries.test.ts
 * invariant asserts no alias is ever declared twice).
 */
export const UNIT_ALIAS_TO_CODE: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const entry of UNIT_DICTIONARY) {
    for (const alias of entry.aliases) {
      if (!map.has(alias)) {
        map.set(alias, entry.code);
      }
    }
  }
  return map;
})();

/**
 * All spellings (canonical codes + aliases) considered by the near-miss
 * (edit-distance) search, each mapped to its canonical code.
 */
export const UNIT_NEAR_SPELLINGS: readonly { spelling: string; code: string }[] = [
  ...UNIT_DICTIONARY.map((entry) => ({ spelling: entry.code, code: entry.code })),
  ...UNIT_DICTIONARY.flatMap((entry) => entry.aliases.map((alias) => ({ spelling: alias, code: entry.code }))),
];

/* ------------------------------------------------------------------ */
/* Concept dictionary                                                  */
/* ------------------------------------------------------------------ */

/**
 * One construction concept code with its keyword evidence. Matching
 * strength: canonical keyword > synonym/pattern. Within equal strength the
 * LONGEST matched text wins; a full tie between DIFFERENT concepts is
 * recorded as alternatives (never silently resolved).
 */
export interface ConceptDictionaryEntry {
  /** Concept code, e.g. "CONCRETE_WORK". */
  readonly code: string;
  /** Canonical keyword phrases (matched whole, case-insensitive). */
  readonly canonical: readonly string[];
  /** Synonym/alias keyword phrases (matched whole, case-insensitive). */
  readonly synonyms: readonly string[];
  /** Structural regex patterns (no /g flag; single match is enough). */
  readonly patterns: readonly RegExp[];
}

export const CONCEPT_DICTIONARY: readonly ConceptDictionaryEntry[] = [
  {
    code: "CONCRETE_WORK",
    canonical: ["concrete"],
    // "block"/"blocks" deliberately also MASONRY keywords: bare "block" is
    // the architecture-lock example of a genuinely ambiguous description.
    synonyms: ["rc", "cast in situ", "cast-in-situ", "blinding", "mass concrete", "block", "blocks"],
    patterns: [/\b\d+\s*mpa\b/i],
  },
  {
    code: "REINFORCEMENT",
    canonical: ["reinforcement"],
    // "steel" deliberately also a STEELWORK keyword (see STEELWORK).
    synonyms: ["rebar", "reinforcing", "steel bar", "steel bars", "mesh", "bending schedule", "steel"],
    patterns: [/\b[yr]\d{1,2}\b/i],
  },
  {
    code: "FORMWORK",
    canonical: ["formwork"],
    synonyms: ["shuttering", "falsework", "form work"],
    patterns: [],
  },
  {
    code: "MASONRY",
    canonical: ["masonry"],
    synonyms: ["blockwork", "brickwork", "block wall", "brick wall", "block", "blocks", "brick", "bricks"],
    patterns: [],
  },
  {
    code: "PLASTERING",
    canonical: ["plaster"],
    synonyms: ["render", "screed", "plastering", "rendering", "skimming"],
    patterns: [],
  },
  {
    code: "EXCAVATION",
    canonical: ["excavation"],
    synonyms: ["earthworks", "earthwork", "backfill", "backfilling", "cut and fill", "digging", "disposal"],
    patterns: [/\bexcavat(?:e|es|ed|ing|ions?)\b/i],
  },
  {
    code: "WATERPROOFING",
    canonical: ["waterproofing"],
    synonyms: [
      "waterproof",
      "water-proof",
      "water-proofing",
      "damp proof",
      "damp proofing",
      "damp-proofing",
      "dpc",
      "dpm",
      "tanking",
    ],
    patterns: [],
  },
  {
    code: "ROOFING",
    canonical: ["roofing"],
    synonyms: ["roof", "roofs", "gutter", "gutters", "downpipe", "downpipes", "flashing"],
    patterns: [],
  },
  {
    code: "STEELWORK",
    canonical: ["steelwork"],
    // "steel" deliberately also a REINFORCEMENT keyword: "steel work" (as
    // two plain words) matches BOTH concepts at equal strength -> recorded
    // as alternatives with confidence "uncertain".
    synonyms: [
      "structural steel",
      "steel section",
      "steel sections",
      "rsj",
      "universal beam",
      "universal column",
      "steel",
    ],
    patterns: [],
  },
  {
    code: "PAINTING",
    canonical: ["painting"],
    synonyms: ["paint", "paints", "emulsion", "undercoat", "primer"],
    patterns: [],
  },
  {
    code: "DOORS_WINDOWS",
    canonical: ["door", "doors", "window", "windows"],
    synonyms: ["glazing", "ironmongery", "door frame", "door frames", "window frame", "window frames"],
    patterns: [],
  },
  {
    code: "ELECTRICAL",
    canonical: ["electrical"],
    synonyms: ["conduit", "wiring", "cable", "cables", "socket", "sockets", "lighting", "distribution board"],
    patterns: [],
  },
  {
    code: "PLUMBING",
    canonical: ["plumbing"],
    synonyms: ["pipe", "pipes", "piping", "sanitary", "drainage", "wc", "manhole", "gully"],
    patterns: [/\bdrains?\b/i],
  },
  {
    code: "TILING",
    canonical: ["tiling"],
    synonyms: ["tile", "tiles", "ceramic", "porcelain", "quarry tile", "mosaic"],
    patterns: [],
  },
  {
    code: "CARPENTRY",
    canonical: ["carpentry"],
    synonyms: ["timber", "joinery", "woodwork", "hardwood", "softwood"],
    patterns: [],
  },
  {
    code: "PAVING",
    canonical: ["paving"],
    synonyms: ["kerb", "kerbs", "asphalt", "pavement", "roadbase", "bitmac"],
    patterns: [],
  },
  {
    code: "INSULATION",
    canonical: ["insulation"],
    synonyms: ["insulating", "polystyrene", "mineral wool", "rockwool"],
    patterns: [],
  },
  {
    code: "SCAFFOLDING",
    canonical: ["scaffolding"],
    synonyms: ["scaffold", "scaffolds", "access tower", "temporary access"],
    patterns: [],
  },
];

/** Match-strength ranking: canonical keyword (3) beats synonym/pattern (2). */
export type ConceptMatchTier = "canonical" | "synonym" | "pattern";

/** One compiled keyword/pattern matcher of one concept. */
export interface ConceptMatcher {
  readonly concept: string;
  readonly regex: RegExp;
  readonly tier: ConceptMatchTier;
  /** 3 = canonical keyword, 2 = synonym or structural pattern. */
  readonly strength: number;
}

/** Compile a keyword phrase to a whole-phrase, case-insensitive regex. */
function keywordRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/ /g, "\\s+");
  return new RegExp(`\\b${body}\\b`, "i");
}

/** All concept matchers, compiled once in declaration order. */
export const CONCEPT_MATCHERS: readonly ConceptMatcher[] = CONCEPT_DICTIONARY.flatMap((entry) => [
  ...entry.canonical.map(
    (phrase): ConceptMatcher => ({ concept: entry.code, regex: keywordRegex(phrase), tier: "canonical", strength: 3 }),
  ),
  ...entry.synonyms.map(
    (phrase): ConceptMatcher => ({ concept: entry.code, regex: keywordRegex(phrase), tier: "synonym", strength: 2 }),
  ),
  ...entry.patterns.map(
    (regex): ConceptMatcher => ({ concept: entry.code, regex, tier: "pattern", strength: 2 }),
  ),
]);

/* ------------------------------------------------------------------ */
/* Abbreviation dictionary                                             */
/* ------------------------------------------------------------------ */

/** One BOQ shorthand -> plain-wording expansion. */
export interface AbbreviationEntry {
  /** Abbreviation as conventionally written (trailing "." is optional at match time). */
  readonly abbreviation: string;
  /** Plain-wording expansion (capitalized at sentence start when matched uppercase). */
  readonly expansion: string;
}

export const ABBREVIATION_DICTIONARY: readonly AbbreviationEntry[] = [
  { abbreviation: "incl.", expansion: "including" },
  { abbreviation: "exc.", expansion: "excluding" },
  { abbreviation: "w/", expansion: "with" },
  { abbreviation: "c/w", expansion: "complete with" },
  { abbreviation: "w/o", expansion: "without" },
  { abbreviation: "max.", expansion: "maximum" },
  { abbreviation: "min.", expansion: "minimum" },
  { abbreviation: "approx.", expansion: "approximately" },
  { abbreviation: "dia.", expansion: "diameter" },
  { abbreviation: "Ø", expansion: "diameter" },
  { abbreviation: "reinf.", expansion: "reinforcement" },
  { abbreviation: "struct.", expansion: "structural" },
  { abbreviation: "bw.", expansion: "blockwork" },
  { abbreviation: "conc.", expansion: "concrete" },
  { abbreviation: "excav.", expansion: "excavation" },
  { abbreviation: "std.", expansion: "standard" },
  { abbreviation: "thk.", expansion: "thickness" },
  { abbreviation: "reqd.", expansion: "required" },
  { abbreviation: "ht.", expansion: "height" },
  { abbreviation: "bldg.", expansion: "building" },
  { abbreviation: "elec.", expansion: "electrical" },
  { abbreviation: "mech.", expansion: "mechanical" },
];

/**
 * Compiled abbreviation matchers, ordered LONGEST abbreviation first (then
 * declaration order) so "c/w" and "w/o" are consumed before their substrings
 * could match "w/". Each matcher runs ONE global pass over the accumulated
 * text, in this order — the order is part of the deterministic contract.
 */
export interface CompiledAbbreviation {
  readonly abbreviation: string;
  readonly expansion: string;
  readonly regex: RegExp;
}

export const COMPILED_ABBREVIATIONS: readonly CompiledAbbreviation[] = (() => {
  const withIndex = ABBREVIATION_DICTIONARY.map((entry, index) => ({ entry, index }));
  withIndex.sort((a, b) => {
    const lengthDiff = b.entry.abbreviation.length - a.entry.abbreviation.length;
    return lengthDiff !== 0 ? lengthDiff : a.index - b.index;
  });
  return withIndex.map(({ entry }) => {
    if (entry.abbreviation === "Ø") {
      // The diameter symbol: standalone or directly before a digit ("Ø12").
      // Never inside a word. The expansion gains a trailing space so
      // "Ø12" becomes "diameter 12" (canonical spacing cleans doubles).
      return {
        abbreviation: entry.abbreviation,
        expansion: `${entry.expansion} `,
        regex: /(?<![a-zA-Z])[Øø](?![a-zA-Z])/g,
      };
    }
    const body = entry.abbreviation.replace(/\.$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (entry.abbreviation.includes("/")) {
      // Slash-bearing tokens ("w/", "c/w", "w/o"): not preceded by a letter,
      // digit or another slash (so "c/w" cannot feed the "w/" matcher), and
      // not followed by a letter or digit.
      return {
        abbreviation: entry.abbreviation,
        expansion: entry.expansion,
        regex: new RegExp(`(?<![a-zA-Z0-9/])${body}(?![a-zA-Z0-9])`, "gi"),
      };
    }
    // Alphabetic abbreviations: optional trailing period, letter-bounded on
    // both sides ("incl" never matches inside "including").
    return {
      abbreviation: entry.abbreviation,
      expansion: entry.expansion,
      regex: new RegExp(`(?<![a-zA-Z])${body}\\.?(?![a-zA-Z])`, "gi"),
    };
  });
})();

/* ------------------------------------------------------------------ */
/* Text helpers (deterministic)                                        */
/* ------------------------------------------------------------------ */

/** Canonical whitespace: collapse runs of whitespace to one space, then trim. */
export function canonicalSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Clean a unit cell's logical text into a lookup key: trim, unwrap one pair
 * of enclosing parentheses, lowercase, collapse whitespace, strip trailing
 * dots. The VERBATIM raw text is unaffected — this key is lookup-only.
 */
export function unitLookupKey(text: string): string {
  let key = text.trim();
  const unwrapped = /^\((.+)\)$/.exec(key);
  if (unwrapped !== null) {
    key = (unwrapped[1] ?? "").trim();
  }
  key = key.toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  return key;
}

/** Classic Levenshtein edit distance (no cutoff; unit spellings are short). */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  let previous: number[] = [];
  for (let j = 0; j <= b.length; j += 1) {
    previous.push(j);
  }
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      current.push(Math.min(substitution, insertion, deletion));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
