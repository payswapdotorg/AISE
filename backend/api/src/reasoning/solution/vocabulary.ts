/**
 * PROD-023 — the deterministic GRAMMAR TABLES of the agent operation
 * compiler (vocabulary.ts).
 *
 * Everything the pattern-based parser matches lives here as FROZEN DATA:
 * unsafe-request patterns (the refusal taxonomy), tool-command patterns,
 * operation-type detection patterns (strong verbs first, noun-only hints
 * second), dimension words and comparatives (delta semantics), unit tokens
 * and canonical-unit normalization (the semantic-equivalence enabler:
 * "1.5 m" ≡ "150 cm" ≡ "1500 mm" for a metre-canonical parameter),
 * material vocabularies per operation type (utterance nouns normalize to
 * the contract fixtures' material ids — never invented), coat/layer words,
 * sequencing clause markers and future-vertical hints for honest
 * unsupported outcomes.
 *
 * NO REGEX HERE PERFORMS I/O, LOOKS AT THE CLOCK OR CONSULTS A PROVIDER:
 * the tables are pure data, evaluated deterministically by compiler.ts.
 * Adding a phrasing means adding a row — the contract never changes
 * (PROD-021 frozen; this module owns only the LANGUAGE surface).
 */

import { BUILDING_OPERATION_TYPES, FUTURE_VERTICALS } from "@aise/solution-contract";
import type { BuildingOperationType } from "@aise/solution-contract";

/* ------------------------------------------------------------------ */
/* Unsafe-request patterns (checked FIRST — refusal taxonomy)          */
/* ------------------------------------------------------------------ */

/**
 * The refusal grammar: utterances that would claim an authority the agent
 * does not own (validation success, engineering approval, observed
 * reality, readiness, cost) or bypass determinism (raw geometry writes,
 * solution-engine bypasses). Each row is one reason code of the frozen
 * taxonomy (model.ts UNSAFE_REFUSAL_REASON_CODES) with its patterns,
 * evaluated in declaration order — first match wins, deterministically.
 */
export const UNSAFE_REQUEST_PATTERNS: readonly {
  readonly reasonCode: string;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    reasonCode: "validation-authority-claim",
    patterns: [
      /\b(?:mark|set|declare|flag|record|consider|treat)\b[^.!?]*\bvalidat(?:ed|ion)\b/i,
      /\bvalidat(?:ed|ion)\b[^.!?]*\b(?:passed|succeeded|successful|is valid)\b/i,
      /\b(?:mark|set|flag)\b[^.!?]*\bas\s+validated\b/i,
    ],
  },
  {
    reasonCode: "approval-authority-claim",
    patterns: [
      /\b(?:approve|approved|approval|approving|sign\s+off)\b/i,
    ],
  },
  {
    reasonCode: "reality-authority-claim",
    patterns: [
      /\b(?:declare|mark|set|record|treat|make)\b[^.!?]*\b(?:observed|confirmed|as\s+reality|authoritative)\b/i,
      /\b(?:declare|mark|set)\b[^.!?]*\b(?:it|this|the\s+\w+)\s+as\s+(?:the\s+)?(?:observed|confirmed)\b/i,
    ],
  },
  {
    reasonCode: "readiness-authority-claim",
    patterns: [
      /\b(?:mark|set|declare|flag)\b[^.!?]*\bready\b/i,
      /\bready\s+for\s+(?:execution|construction|build)\b/i,
    ],
  },
  {
    reasonCode: "cost-authority-claim",
    patterns: [
      /\b(?:set|change|fix|assign|write|update|override)\b[^.!?]*\b(?:cost|price|budget|total)\b/i,
      /\bcost\s+(?:of|to)\b[^.!?]*\b(?:set|is)\s+\w+/i,
    ],
  },
  {
    reasonCode: "raw-geometry-write",
    patterns: [
      /\b(?:write|inject|insert|paste|emit)\b[^.!?]*\b(?:geometry|mesh|vertices|triangles)\b/i,
      /\braw\s+geometry\b/i,
      /\b(?:generate|create|draw)\b[^.!?]*\b(?:geometry|mesh)\b[^.!?]*\b(?:directly|yourself|myself)\b/i,
      /\bhand-?(?:write|author)\b[^.!?]*\b(?:geometry|mesh)\b/i,
    ],
  },
  {
    reasonCode: "engine-bypass",
    patterns: [
      /\b(?:bypass|skip|ignore|avoid|circumvent|work\s+around)\b[^.!?]*\b(?:engine|validation|deterministic|solution\s+engine|tools?)\b/i,
      /\b(?:bypass|skip|ignore|avoid|circumvent)\b[^.!?]*\b(?:engine|validation)\b/i,
      /\b(?:place|apply|put|write)\b[^.!?]*\b(?:yourself|directly\s+into\s+the\s+(?:model|graph))\b/i,
      /\bwithout\s+the\s+(?:engine|validation)\b/i,
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Tool-command patterns (read-only agent commands)                     */
/* ------------------------------------------------------------------ */

/** The navigation sub-targets of a navigate tool command. */
export const NAVIGATION_TARGETS = ["goto-step", "list-steps", "current-state"] as const;
export type NavigationTarget = (typeof NAVIGATION_TARGETS)[number];

/**
 * The tool-command grammar (evaluated in declaration order, before any
 * operation-type detection): validate, BOQ-step lookup, explanation,
 * navigation and inspection. These are read-only commands — they compile
 * directly to typed SolutionToolCommands and NEVER produce operation
 * intents.
 */
export const TOOL_COMMAND_PATTERNS: readonly {
  readonly toolKind: string;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    toolKind: "validate",
    patterns: [/\bvalidate\b/i, /\b(?:run|perform|do)\b[^.!?]*\bvalidation\b/i],
  },
  {
    toolKind: "boq-step-lookup",
    patterns: [
      /\b(?:which|what)\b[^.!?]*\bboq\b[^.!?]*\bstep\b/i,
      /\bboq\s+lines?\b[^.!?]*\b(?:from|of)\b/i,
      /\bstep\s+\d+\b[^.!?]*\b(?:boq|cost)\b/i,
      /\bhow\s+much\b[^.!?]*\bstep\s+\d+\b[^.!?]*\bcost\b/i,
      /\btrace\b[^.!?]*\b(?:boq|line)\b/i,
    ],
  },
  {
    toolKind: "explain",
    patterns: [
      /\bwhat\s+(?:does|did)\s+step\s+\d+\s+do\b/i,
      /\bexplain\b/i,
      /\bdescribe\b[^.!?]*\bstep\b/i,
      /\bwhy\b[^.!?]*\bstep\b/i,
      /\bhow\s+much\b[^.!?]*\b(?:volume|area|material)\b/i,
    ],
  },
  {
    toolKind: "navigate",
    patterns: [
      /\b(?:show|go\s+to|view|see|display|open)\b[^.!?]*\bstep\s+\d+\b/i,
      /\bstep\s+\d+\b[^.!?]*\b(?:please|now)\b/i,
      /\b(?:go|navigate)\s+back\b/i,
      /\b(?:baseline|initial)\s+state\b/i,
      /\blist\b[^.!?]*\b(?:operations|steps)\b/i,
      /\bshow\s+(?:me\s+)?the\s+current\b/i,
    ],
  },
  {
    toolKind: "inspect",
    patterns: [
      /\binspect\b/i,
      /\bexamine\b[^.!?]*\b(?:state|proposal|solution)\b/i,
      /\bwhat\s+(?:is|does)\b[^.!?]*\bcurrent\s+(?:proposed\s+)?state\b/i,
    ],
  },
];

/** Extracts the first "step N" reference of an utterance (1-based). */
export function extractStepIndex(utterance: string): number | undefined {
  const match = /\bstep\s+(\d+)\b/i.exec(utterance);
  if (match === null) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** Classifies a navigation utterance into its sub-target. */
export function navigationTargetOf(utterance: string): NavigationTarget {
  if (/\blist\b[^.!?]*\b(?:operations|steps)\b/i.test(utterance)) {
    return "list-steps";
  }
  if (/\b(?:current|latest)\b[^.!?]*\bstate\b/i.test(utterance)) {
    return "current-state";
  }
  if (/\b(?:baseline|initial)\s+state\b/i.test(utterance) || /\bgo\s+back\b/i.test(utterance)) {
    return "goto-step";
  }
  return "goto-step";
}

/* ------------------------------------------------------------------ */
/* Operation-type detection (strong verbs, then noun-only hints)       */
/* ------------------------------------------------------------------ */

/**
 * STRONG operation patterns: a construction VERB names the operation
 * (verb-anchored only — noun-only phrases live in the weak tier so a
 * demolition verb like "remove the plaster" never double-matches).
 * Evaluated across the whole table — exactly one matching type wins; two
 * or more distinct matches compile to `ambiguous` (a compound request
 * Phase 1 does not represent — honest, never first-match-silent).
 */
export const STRONG_OPERATION_PATTERNS: readonly {
  readonly operationType: BuildingOperationType;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    operationType: "backfill",
    patterns: [
      /\bbackfills?\b/i,
      /\brefills?\b/i,
      /\bfills?\b[^.!?]{0,40}\b(?:pit|trench|excavation)\b/i,
      /\bfill\s+(?:in\s+|up\s+)?the\s+(?:pit|trench|excavation)\b/i,
    ],
  },
  {
    operationType: "demolition-removal",
    patterns: [
      /\bdemolish(?:es|ed|ing)?\b/i,
      /\bremov(?:e|es|ed|ing|al)\b/i,
      /\btear\s+(?:out|down)\b/i,
      /\btake\s+out\b/i,
      /\bbreak\s+out\b/i,
      /\bchip\s+off\b/i,
      /\bstrip\b[^.!?]{0,30}\b(?:plaster|render|finish|paint|coat|wallpaper)\b/i,
    ],
  },
  {
    operationType: "excavation",
    patterns: [
      /\bexcavat(?:e|es|ed|ing)\b/i,
      /\bdig(?:s|ged|ging)?\b/i,
      /\bdug\b/i,
    ],
  },
  {
    operationType: "plaster-application",
    patterns: [
      /\bappl(?:y|ies|ied|ying)\b[^.!?]{0,40}\bplaster\b/i,
      /\brender(?:s|ed|ing)?\b/i,
      /\bskim\s+coat\b/i,
    ],
  },
  {
    operationType: "finish-application",
    patterns: [
      /\bappl(?:y|ies|ied|ying)\b[^.!?]{0,40}\b(?:finish|paint|varnish)\b/i,
    ],
  },
  {
    operationType: "block-wall-placement",
    patterns: [
      /\blay(?:ing)?\b[^.!?]{0,30}\b(?:blocks?|bricks?)\b/i,
      /\bblockwork\b/i,
      /\bbrickwork\b/i,
      /\bbuild(?:ing)?\s+(?:a\s+|the\s+|this\s+)?(?:block\s+|brick\s+|concrete\s+)?wall\b/i,
      /\braise(?:ing)?\s+the\s+(?:block\s+)?wall\b/i,
    ],
  },
  {
    operationType: "opening-creation",
    patterns: [
      /\b(?:cut|create|make|form)\b[^.!?]{0,30}\bopening\b/i,
    ],
  },
  {
    operationType: "slab-placement",
    patterns: [
      /\b(?:pour|place|cast)\b[^.!?]{0,30}\bslabs?\b/i,
    ],
  },
  {
    operationType: "foundation-placement",
    patterns: [
      /\b(?:pour|place|cast|lay)\b[^.!?]{0,30}\b(?:footing|foundation)s?\b/i,
    ],
  },
  {
    operationType: "building-service-installation",
    patterns: [
      /\b(?:run|install|route|lay)\b[^.!?]{0,40}\b(?:conduits?|cable\s+trays?)\b/i,
    ],
  },
];

/**
 * WEAK (noun-only) hints, consulted only when NO strong verb matched:
 * the utterance names the construction noun without a verb ("a pit 2 m
 * wide and 3 m long…"). Exactly one hint wins; multiple hints compile to
 * `ambiguous`.
 */
export const WEAK_OPERATION_HINTS: readonly {
  readonly operationType: BuildingOperationType;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    operationType: "excavation",
    patterns: [/\bpits?\b/i, /\btrench(?:es)?\b/i, /\bexcavat(?:ion|ions)\b/i],
  },
  {
    operationType: "plaster-application",
    patterns: [/\bplaster(?:s|ed|ing)?\b/i, /\brender(?:s|ed|ing)?\b/i, /\bplaster\s+coat\b/i],
  },
  {
    operationType: "finish-application",
    patterns: [/\bpaint(?:s|ed|ing)?\b/i, /\bvarnish(?:es|ed|ing)?\b/i, /\bfinish\s+coat\b/i],
  },
  {
    operationType: "block-wall-placement",
    patterns: [/\b(?:block|brick)\s+wall\b/i, /\bwall\s+of\s+(?:blocks?|bricks?)\b/i],
  },
  { operationType: "opening-creation", patterns: [/\bopening\b/i] },
  {
    operationType: "slab-placement",
    patterns: [/\bslabs?\b/i, /\bground(?:\s+bearing)?\s+slab\b/i],
  },
  {
    operationType: "foundation-placement",
    patterns: [/\bfootings?\b/i, /\bfoundations?\b/i, /\bstrip\s+footings?\b/i],
  },
  {
    operationType: "building-service-installation",
    patterns: [/\b(?:conduits?|cable\s+trays?)\b/i, /\bconduit\s+runs?\b/i],
  },
];

/** Every Phase 1 building operation type, for honest unsupported reasons. */
export const SUPPORTED_OPERATION_TYPES: readonly string[] = BUILDING_OPERATION_TYPES;

/** The future-vertical hints for honest unsupported outcomes. */
export const VERTICAL_HINT_PATTERNS: readonly {
  readonly vertical: string;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    vertical: "civil-works",
    patterns: [
      /\bbridges?\b/i,
      /\broads?\b/i,
      /\bhighways?\b/i,
      /\btunnels?\b/i,
      /\bculverts?\b/i,
      /\bdams?\b/i,
      /\brunways?\b/i,
    ],
  },
  { vertical: "industrial-equipment", patterns: [/\bconveyors?\b/i, /\brobot(?:ic)?\s+(?:cell|line|arm)s?\b/i] },
  { vertical: "electronics", patterns: [/\bPCBs?\b/i, /\bcircuit\s+boards?\b/i] },
  {
    vertical: "integrated-circuits",
    patterns: [/\bintegrated\s+circuits?\b/i, /\bchip\s+layouts?\b/i, /\bIC\s+layouts?\b/i],
  },
];

/** Advisory check: is a vertical one of the contract's future verticals? */
export function isFutureVertical(vertical: string): boolean {
  return (FUTURE_VERTICALS as readonly string[]).includes(vertical);
}

/* ------------------------------------------------------------------ */
/* Dimensions, units, deltas                                            */
/* ------------------------------------------------------------------ */

/**
 * Dimension words map utterance phrases to parameter names. Comparatives
 * ("deeper", "wider"…) additionally signal DELTA semantics when combined
 * with a change verb or a "by <value>" phrase.
 */
export const DIMENSION_WORDS: readonly { readonly word: RegExp; readonly parameter: string }[] = [
  { word: /\bdepth\b|\bdeep\b/i, parameter: "depth" },
  { word: /\bwidth\b|\bwide\b/i, parameter: "width" },
  { word: /\blength\b|\blong\b/i, parameter: "length" },
  { word: /\bheight\b|\bhigh\b|\btall\b/i, parameter: "height" },
  { word: /\bthickness\b|\bthick\b/i, parameter: "thickness" },
  { word: /\bdiameter\b|\bdia\b/i, parameter: "diameter" },
];

/** Comparative dimension words (delta semantics, positive direction). */
export const COMPARATIVE_WORDS: readonly {
  readonly word: RegExp;
  readonly parameter: string;
  readonly direction: 1 | -1;
}[] = [
  { word: /\bdeeper\b/i, parameter: "depth", direction: 1 },
  { word: /\bshallower\b/i, parameter: "depth", direction: -1 },
  { word: /\bwider\b/i, parameter: "width", direction: 1 },
  { word: /\bnarrower\b/i, parameter: "width", direction: -1 },
  { word: /\blonger\b/i, parameter: "length", direction: 1 },
  { word: /\bshorter\b/i, parameter: "length", direction: -1 },
  { word: /\bhigher\b|\btaller\b/i, parameter: "height", direction: 1 },
  { word: /\blower\b/i, parameter: "height", direction: -1 },
  { word: /\bthicker\b/i, parameter: "thickness", direction: 1 },
  { word: /\bthinner\b/i, parameter: "thickness", direction: -1 },
];

/** Change verbs that turn a dimension reference into a delta/absolute change. */
export const CHANGE_VERBS: readonly RegExp[] = [
  /\bmake\b/i,
  /\bincrease\b/i,
  /\bdecrease\b/i,
  /\breduce\b/i,
  /\braise\b/i,
  /\blower\b/i,
  /\bwiden\b/i,
  /\bnarrow\b/i,
  /\blengthen\b/i,
  /\bshorten\b/i,
  /\bextend\b/i,
  /\bdeepen\b/i,
  /\bthicken\b/i,
];

/** Material/layer change verbs (the change-mode triggers). */
export const MATERIAL_CHANGE_VERBS: readonly RegExp[] = [
  /\bchange\b/i,
  /\bswitch\b/i,
  /\bus(e|ing)\b/i,
  /\bswap\b/i,
  /\breplac(?:e|ing)\b/i,
];

/** The additive layer-change pattern: "add a second coat of …". */
export const ADD_COAT_PATTERN =
  /\badd\b[^.!?]{0,30}\b(?:(second|third|fourth|fifth|another)\s+)?coats?\b/i;

/** Coat/layer count words ("two coats", "2-coat", "in 3 layers"). */
export const COAT_COUNT_PATTERN =
  /\b(?:one|two|three|four|five|six|single|1|2|3|4|5|6)\s*[-\s]?\s*(?:coats?|layers?)\b/i;

/** The word-number vocabulary for coat counts. */
export const COAT_WORD_NUMBERS: Readonly<Record<string, number>> = {
  single: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

/** Ordinal coat words ("a second coat" → resulting count 2). */
export const COAT_ORDINALS: Readonly<Record<string, number>> = {
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};

/**
 * The measurement pattern: a decimal number (dot or comma separator)
 * followed by a linear unit token, with optional space ("1.5 m", "30mm",
 * "1,5 m"). Captures: 1 = value text, 2 = unit token.
 */
export const MEASUREMENT_PATTERN = /(\d+(?:\.\d+)?|\d+,\d+)\s*(mm|cm|m|meters?|metres?)\b/gi;

/** Linear unit tokens and their factor to metres (canonicalization base). */
export const LINEAR_UNIT_FACTORS: Readonly<Record<string, number>> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
};

/**
 * The canonical unit per (operation type, parameter name) — the
 * semantic-equivalence enabler: every extracted measurement is normalized
 * to the parameter's canonical unit so "30 mm", "3 cm" and "0.03 m" of
 * plaster compile to the IDENTICAL typed parameter (and therefore the
 * identical contract operation identity). Mirrors the units of the
 * contract's committed valid intent fixtures (m for excavation/block-wall/
 * demolition/foundation/slab linear parameters, mm for plaster/finish
 * thickness and service diameters).
 */
export const CANONICAL_UNITS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  excavation: { depth: "m", width: "m", length: "m" },
  backfill: { depth: "m", width: "m", length: "m" },
  "demolition-removal": { length: "m", height: "m", thickness: "m" },
  "foundation-placement": { length: "m", width: "m", depth: "m" },
  "slab-placement": { length: "m", width: "m", thickness: "m" },
  "block-wall-placement": { length: "m", height: "m", thickness: "m" },
  "opening-creation": { width: "m", height: "m" },
  "plaster-application": { thickness: "mm" },
  "finish-application": { thickness: "mm" },
  "building-service-installation": { length: "m", diameter: "mm" },
};

/** Canonical unit of a parameter; defaults to metres for linear parameters. */
export function canonicalUnitFor(operationType: string, parameter: string): string {
  return CANONICAL_UNITS[operationType]?.[parameter] ?? "m";
}

/** Converts a measured value+unit into the canonical unit of a parameter. */
export function toCanonicalUnit(
  value: number,
  unit: string,
  operationType: string,
  parameter: string,
): number {
  const canonical = canonicalUnitFor(operationType, parameter);
  const sourceFactor = LINEAR_UNIT_FACTORS[unit.toLowerCase()] ?? 1;
  const canonicalFactor = LINEAR_UNIT_FACTORS[canonical] ?? 1;
  const metres = value * sourceFactor;
  const converted = metres / canonicalFactor;
  // Guard float noise so canonical values compare exactly (0.1 + 0.35 style).
  return Math.round(converted * 1e9) / 1e9;
}

/* ------------------------------------------------------------------ */
/* Material vocabularies (utterance nouns → contract material ids)      */
/* ------------------------------------------------------------------ */

/**
 * Material vocabularies per operation type: the utterance's own material
 * nouns normalize to canonical material ids (longest alias wins). The bare
 * noun of the operation ("plaster", "blocks", "paint", "conduit", "door",
 * "window") names the canonical default material of that noun — vocabulary
 * normalization, NEVER an invented engineering fact.
 */
export const MATERIAL_VOCABULARIES: Readonly<
  Record<string, readonly { readonly material: string; readonly aliases: readonly string[] }[]>
> = {
  "plaster-application": [
    { material: "gypsum-plaster", aliases: ["gypsum plaster", "gypsum"] },
    { material: "cement-plaster", aliases: ["cement plaster", "cement", "plaster"] },
    { material: "lime-plaster", aliases: ["lime plaster", "lime"] },
  ],
  "finish-application": [
    { material: "acrylic-paint", aliases: ["acrylic paint", "acrylic", "paint"] },
    { material: "emulsion-paint", aliases: ["emulsion paint", "emulsion"] },
    { material: "enamel-paint", aliases: ["enamel paint", "enamel"] },
  ],
  "block-wall-placement": [
    { material: "concrete-block", aliases: ["concrete blocks", "concrete block", "blocks", "block", "concrete"] },
    { material: "aac-block", aliases: ["aac block", "aac blocks", "aac", "autoclaved aerated concrete"] },
    { material: "clay-brick", aliases: ["clay bricks", "clay brick", "bricks", "brick", "clay"] },
    { material: "hollow-block", aliases: ["hollow blocks", "hollow block", "hollow"] },
  ],
  "foundation-placement": [
    { material: "reinforced-concrete", aliases: ["reinforced concrete", "rc"] },
    { material: "plain-concrete", aliases: ["plain concrete", "concrete"] },
    { material: "rubble-stone", aliases: ["rubble stone", "rubble", "stone"] },
  ],
  "slab-placement": [
    { material: "reinforced-concrete", aliases: ["reinforced concrete", "rc"] },
    { material: "plain-concrete", aliases: ["plain concrete", "concrete"] },
  ],
  "opening-creation": [
    { material: "timber-door", aliases: ["timber door", "wooden door", "door"] },
    { material: "aluminium-window", aliases: ["aluminium window", "aluminum window", "window"] },
    { material: "steel-door", aliases: ["steel door"] },
    { material: "upvc-window", aliases: ["upvc window", "uPVC window"] },
  ],
  "building-service-installation": [
    { material: "cable-tray", aliases: ["cable tray", "cable trays"] },
    { material: "steel-conduit", aliases: ["steel conduit"] },
    { material: "pvc-conduit", aliases: ["pvc conduit", "conduits", "conduit"] },
    { material: "copper-cable", aliases: ["copper cable", "cable"] },
  ],
};

/**
 * Resolves the material nouns of an utterance for one operation type.
 * Returns ALL distinct matches (a single match is the material; two or
 * more — e.g. "brick or concrete block" — are AMBIGUITY readings).
 * Aliases are matched longest-first, word-bounded, case-insensitively;
 * matched spans are consumed so "gypsum plaster" never also matches the
 * bare "plaster" alias of a different material.
 */
export function extractMaterials(
  utterance: string,
  operationType: string,
): readonly string[] {
  const vocabulary = MATERIAL_VOCABULARIES[operationType] ?? [];
  const entries = vocabulary.flatMap((entry) =>
    entry.aliases.map((alias) => ({ alias, material: entry.material })),
  );
  entries.sort((a, b) => b.alias.length - a.alias.length);
  const lower = utterance.toLowerCase();
  const chars = [...lower];
  const found: { material: string; start: number }[] = [];
  for (const { alias, material } of entries) {
    if (found.some((entry) => entry.material === material)) {
      continue;
    }
    const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
    const match = pattern.exec(lower);
    if (match === null) {
      continue;
    }
    const start = match.index;
    const end = start + match[0].length;
    // The alias's span must not overlap a span already consumed by a
    // longer alias (null-char sentinel marking below).
    let overlaps = false;
    for (let index = start; index < end; index += 1) {
      if (chars[index] === "\u0000") {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      continue;
    }
    found.push({ material, start });
    for (let index = start; index < end; index += 1) {
      chars[index] = "\u0000";
    }
  }
  // Utterance order (deterministic; matches the reading order a user sees).
  found.sort((a, b) => a.start - b.start);
  return found.map((entry) => entry.material);
}

/** Escapes regex metacharacters of a literal alias. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts the material named AFTER a change target ("change the material
 * to gypsum plaster", "use lime plaster instead"): the new material is the
 * one inside the to/with/use clause, never the one being replaced.
 */
export function extractChangedMaterial(
  utterance: string,
  operationType: string,
): readonly string[] {
  const clause = /\b(?:to|with|using)\s+([^.,;!?]+)/i.exec(utterance);
  if (clause !== null && clause[1] !== undefined) {
    const materials = extractMaterials(clause[1], operationType);
    if (materials.length > 0) {
      return materials;
    }
  }
  return extractMaterials(utterance, operationType);
}

/* ------------------------------------------------------------------ */
/* Clause stripping (sequencing, replacement, politeness)               */
/* ------------------------------------------------------------------ */

/** Sequencing clause markers this compiler understands ("after the excavation"). */
export const SEQUENCING_CLAUSE_PATTERN = /\b(?:after|once|following)\s+([^.,;!?]+)/gi;

/** Replacement clauses ("instead of 30 mm", "rather than clay bricks"). */
export const REPLACEMENT_CLAUSE_PATTERN = /\b(?:instead\s+of|rather\s+than)\s+([^.,;!?]+)/gi;

/** Strips the matched clauses and returns main text + captured clause texts. */
export function stripClauses(
  utterance: string,
  pattern: RegExp,
): { readonly main: string; readonly clauses: readonly string[] } {
  const clauses: string[] = [];
  const working = new RegExp(pattern.source, pattern.flags);
  let match = working.exec(utterance);
  while (match !== null) {
    if (match[1] !== undefined) {
      clauses.push(match[1].trim());
    }
    match = working.exec(utterance);
  }
  const stripped = utterance.replace(new RegExp(pattern.source, pattern.flags), " ");
  return { main: stripped.replace(/\s{2,}/g, " ").trim(), clauses };
}

/* ------------------------------------------------------------------ */
/* Confirmation words (the interaction loop's yes-vocabulary)           */
/* ------------------------------------------------------------------ */

/**
 * The confirmation vocabulary of the interaction loop: a user confirming
 * a PROPOSED operation (their own proposal — never an engineering
 * approval, which the refusal taxonomy owns).
 */
export const CONFIRMATION_PATTERN =
  /^(?:yes|yes\s+please|yeah|yep|confirm|confirmed|go\s+ahead|proceed|apply\s+it|do\s+it|ok|okay|apply)\b/i;

/** An explicit cancellation of a pending proposal/clarification. */
export const CANCELLATION_PATTERN =
  /^(?:no|nope|cancel|never\s+mind|forget\s+it|discard|abort|start\s+over)\b/i;
