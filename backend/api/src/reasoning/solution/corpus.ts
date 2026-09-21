/**
 * PROD-023 — the versioned COMMAND CORPUS (corpus.ts).
 *
 * The enumerable evidence inventory of the agent operation compiler: every
 * utterance the acceptance suite runs through the compiler, categorized
 * exactly as the work order's evidence requirement names them —
 * representative building commands, equivalent phrasing sets, ambiguous
 * requests, unsupported domains, unsafe/authority-claiming requests,
 * clarification cases, and the read-only tool commands (navigation,
 * explanation, inspection, BOQ-step lookup, validate).
 *
 * The corpus is a pure TypeScript DATA module (lint-visible, side-effect
 * free, no I/O). It drives corpus.test.ts (every entry compiles to its
 * expected typed outcome) and doubles as the documentation inventory in
 * docs/productization-evidence/PROD-023/command-corpus.md.
 *
 * Session kinds: "demo" — the canonical demo session (wall / wall-faces /
 * pit-area foci with caller-known facts, recent excavation/demolition/
 * plaster operations, attached to solution-demo-001 v1); "bare" — no foci,
 * no default focus, no recent operations, no solution attachment.
 */

import type { ClarificationSlotKind, UnsafeRefusalReasonCode } from "./model";

/** The corpus version (bumped when entries change). */
export const COMMAND_CORPUS_VERSION = "1.0.0";

/** The corpus categories (the work order's evidence families). */
export const COMMAND_CORPUS_CATEGORIES = [
  "representative",
  "equivalent",
  "ambiguous",
  "unsupported",
  "unsafe",
  "clarification",
  "tool",
] as const;
export type CommandCorpusCategory = (typeof COMMAND_CORPUS_CATEGORIES)[number];

/** Which session fixture an entry runs against. */
export type CorpusSessionKind = "demo" | "bare";

/** The expected typed outcome of one corpus entry. */
export type CorpusExpectation =
  | {
      readonly kind: "operation-intent";
      readonly operationType: string;
      readonly parameters: readonly { name: string; value: number | string; unit?: string }[];
      /** The focus the target must anchor to (checked via nodeRefs). */
      readonly targetFocusId: string;
      readonly dependsOnOperationRefs?: readonly string[];
    }
  | {
      readonly kind: "clarification-needed";
      readonly expectedSlots: readonly { slotKind: ClarificationSlotKind; slot: string }[];
    }
  | { readonly kind: "unsupported"; readonly vertical?: string }
  | { readonly kind: "ambiguous"; readonly readingCount: number; readonly differingSlot?: string }
  | { readonly kind: "unsafe-refusal"; readonly reasonCode: UnsafeRefusalReasonCode }
  | { readonly kind: "tool-command"; readonly toolKind: string; readonly stepIndex?: number };

/** One corpus entry: an utterance, its session, and its expected outcome. */
export interface CommandCorpusEntry {
  readonly id: string;
  readonly category: CommandCorpusCategory;
  readonly utterance: string;
  readonly sessionKind: CorpusSessionKind;
  readonly expectation: CorpusExpectation;
  /** Equivalence-set membership (equivalent category only). */
  readonly equivalenceGroupId?: string;
  readonly note?: string;
}

const excavationIntent = (depth: number, width: number, length: number) => [
  { name: "depth", value: depth, unit: "m" },
  { name: "width", value: width, unit: "m" },
  { name: "length", value: length, unit: "m" },
];

/* ------------------------------------------------------------------ */
/* Representative building commands (the acceptance set)                */
/* ------------------------------------------------------------------ */

const REPRESENTATIVE: readonly CommandCorpusEntry[] = [
  {
    id: "REP-EXC-001",
    category: "representative",
    utterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "the canonical command of the contract's valid-excavation-agent fixture",
  },
  {
    id: "REP-BACKFILL-001",
    category: "representative",
    utterance: "Backfill the pit 1.5 m deep, 2 m wide and 3 m long.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "backfill",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
    },
  },
  {
    id: "REP-BACKFILL-002",
    category: "representative",
    utterance: "Backfill the pit 1.5 m deep, 2 m wide and 3 m long after the excavation.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "backfill",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
      dependsOnOperationRefs: ["op-excavation-001"],
    },
    note: "sequencing: a completion-before edge to the session's recent excavation",
  },
  {
    id: "REP-BLOCK-001",
    category: "representative",
    utterance: "Lay blocks to a height of 1 m along this wall.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "block-wall-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 1, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
        { name: "material", value: "concrete-block" },
      ],
      targetFocusId: "wall",
    },
    note: "length/thickness from the caller-known wall facts; the canonical command of the block-wall fixture",
  },
  {
    id: "REP-BLOCK-002",
    category: "representative",
    utterance: "Lay clay bricks to a height of 1.2 m along this wall.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "block-wall-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 1.2, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
        { name: "material", value: "clay-brick" },
      ],
      targetFocusId: "wall",
    },
    note: "block-wall height + material",
  },
  {
    id: "REP-PLASTER-001",
    category: "representative",
    utterance: "Apply 30 mm plaster to the affected wall faces.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "the canonical command of the contract's valid-plaster-application fixture",
  },
  {
    id: "REP-PLASTER-002",
    category: "representative",
    utterance: "Apply two coats of 15 mm gypsum plaster to the affected wall faces.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 15, unit: "mm" },
        { name: "material", value: "gypsum-plaster" },
        { name: "coats", value: 2, unit: "count" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "plaster thickness + layers",
  },
  {
    id: "REP-DEMO-001",
    category: "representative",
    utterance: "Demolish the wall section 5 m long, 2.4 m high and 0.1 m thick.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      targetFocusId: "wall",
    },
  },
  {
    id: "REP-DEMO-002",
    category: "representative",
    utterance: "Remove the damaged plaster 5 m long, 2.4 m high and 0.1 m thick.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "demolition target: the damaged plaster on the affected wall faces",
  },
  {
    id: "REP-DEMO-003",
    category: "representative",
    utterance: "Demolish the damaged wall section.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "demolition-removal",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      targetFocusId: "wall",
    },
    note: "unstated dimensions complete from the caller-known wall facts (never invented)",
  },
  {
    id: "REP-MAT-001",
    category: "representative",
    utterance: "Change the plaster material to gypsum plaster.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "gypsum-plaster" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "material change: thickness carried over from the recent plaster operation",
  },
  {
    id: "REP-MAT-002",
    category: "representative",
    utterance: "Use 20 mm plaster instead of 30 mm on the affected wall faces.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 20, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "layer/thickness change with the replaced value stripped",
  },
  {
    id: "REP-MAT-003",
    category: "representative",
    utterance: "Add a second coat of plaster to the affected wall faces.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
        { name: "coats", value: 2, unit: "count" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "layer change: the second coat over the recent single-coat plaster",
  },
  {
    id: "REP-DELTA-001",
    category: "representative",
    utterance: "Make the excavation deeper by 0.5 m.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(2, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "delta command: 1.5 m current depth + 0.5 m = 2 m resulting depth",
  },
  {
    id: "REP-FOUND-001",
    category: "representative",
    utterance: "Pour a plain concrete strip footing 5 m long, 1 m wide and 0.5 m deep.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "foundation-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "width", value: 1, unit: "m" },
        { name: "depth", value: 0.5, unit: "m" },
        { name: "material", value: "plain-concrete" },
      ],
      targetFocusId: "pit-area",
    },
  },
  {
    id: "REP-SLAB-001",
    category: "representative",
    utterance: "Place a reinforced concrete slab 5 m long, 4 m wide and 0.15 m thick.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "slab-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "width", value: 4, unit: "m" },
        { name: "thickness", value: 0.15, unit: "m" },
        { name: "material", value: "reinforced-concrete" },
      ],
      targetFocusId: "pit-area",
    },
  },
  {
    id: "REP-OPEN-001",
    category: "representative",
    utterance: "Cut a timber door opening 1 m wide and 2.1 m high in this wall.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "opening-creation",
      parameters: [
        { name: "width", value: 1, unit: "m" },
        { name: "height", value: 2.1, unit: "m" },
        { name: "material", value: "timber-door" },
      ],
      targetFocusId: "wall",
    },
  },
  {
    id: "REP-SVC-001",
    category: "representative",
    utterance: "Run a 25 mm conduit 12 m long along this wall.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "building-service-installation",
      parameters: [
        { name: "length", value: 12, unit: "m" },
        { name: "diameter", value: 25, unit: "mm" },
        { name: "material", value: "pvc-conduit" },
      ],
      targetFocusId: "wall",
    },
  },
  {
    id: "REP-FIN-001",
    category: "representative",
    utterance: "Paint the affected wall faces with 2 mm acrylic paint.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "finish-application",
      parameters: [
        { name: "thickness", value: 2, unit: "mm" },
        { name: "material", value: "acrylic-paint" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "the parameter set of the contract's valid-finish-application fixture",
  },
];

/* ------------------------------------------------------------------ */
/* Equivalent phrasing sets (semantic equivalence)                      */
/* ------------------------------------------------------------------ */

const EQUIVALENT: readonly CommandCorpusEntry[] = [
  {
    id: "EQV-EXC-001",
    category: "equivalent",
    equivalenceGroupId: "excavation-dimensions",
    utterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "imperative canonical form",
  },
  {
    id: "EQV-EXC-002",
    category: "equivalent",
    equivalenceGroupId: "excavation-dimensions",
    utterance: "Can you dig out a pit 1.5 m deep, 2 m wide and 3 m long?",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "question form",
  },
  {
    id: "EQV-EXC-003",
    category: "equivalent",
    equivalenceGroupId: "excavation-dimensions",
    utterance: "I'd like a pit dug 1.5 m deep, 2 m wide and 3 m long, please.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "conversational form",
  },
  {
    id: "EQV-EXC-004",
    category: "equivalent",
    equivalenceGroupId: "excavation-dimensions",
    utterance: "Excavate a pit 1500 mm deep, 200 cm wide and 3 m long.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "unit-variant mix (mm/cm/m) — canonicalized to identical parameters",
  },
  {
    id: "EQV-EXC-005",
    category: "equivalent",
    equivalenceGroupId: "excavation-dimensions",
    utterance: "Dig a pit that is 3 m long, 2 m wide and 1.5 m deep.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(1.5, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "dimension-order variant — canonical parameter ordering",
  },
  {
    id: "EQV-BLOCK-001",
    category: "equivalent",
    equivalenceGroupId: "block-wall-height",
    utterance: "Lay blocks to a height of 1 m along this wall.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "block-wall-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 1, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
        { name: "material", value: "concrete-block" },
      ],
      targetFocusId: "wall",
    },
  },
  {
    id: "EQV-BLOCK-002",
    category: "equivalent",
    equivalenceGroupId: "block-wall-height",
    utterance: "Build a block wall 1 m high along this wall.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "block-wall-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 1, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
        { name: "material", value: "concrete-block" },
      ],
      targetFocusId: "wall",
    },
  },
  {
    id: "EQV-BLOCK-003",
    category: "equivalent",
    equivalenceGroupId: "block-wall-height",
    utterance: "Lay concrete blocks up to 1 m high along this wall.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "block-wall-placement",
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 1, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
        { name: "material", value: "concrete-block" },
      ],
      targetFocusId: "wall",
    },
  },
  {
    id: "EQV-PLASTER-001",
    category: "equivalent",
    equivalenceGroupId: "plaster-thickness",
    utterance: "Apply 30 mm plaster to the affected wall faces.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      targetFocusId: "wall-faces",
    },
  },
  {
    id: "EQV-PLASTER-002",
    category: "equivalent",
    equivalenceGroupId: "plaster-thickness",
    utterance: "Plaster the affected wall faces 30 mm thick.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      targetFocusId: "wall-faces",
    },
  },
  {
    id: "EQV-PLASTER-003",
    category: "equivalent",
    equivalenceGroupId: "plaster-thickness",
    utterance: "Could you apply a 3 cm cement plaster coat to the affected wall faces?",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      targetFocusId: "wall-faces",
    },
    note: "cm → mm canonicalization",
  },
  {
    id: "EQV-PLASTER-004",
    category: "equivalent",
    equivalenceGroupId: "plaster-thickness",
    utterance: "Apply 30 mm cement plaster to the affected wall faces.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "plaster-application",
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      targetFocusId: "wall-faces",
    },
  },
  {
    id: "EQV-DELTA-001",
    category: "equivalent",
    equivalenceGroupId: "delta-vs-absolute",
    utterance: "Make the excavation deeper by 0.5 m.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(2, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "delta phrasing (current 1.5 m + 0.5 m)",
  },
  {
    id: "EQV-DELTA-002",
    category: "equivalent",
    equivalenceGroupId: "delta-vs-absolute",
    utterance: "Increase the excavation depth by 50 cm.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(2, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "delta phrasing with cm unit",
  },
  {
    id: "EQV-DELTA-003",
    category: "equivalent",
    equivalenceGroupId: "delta-vs-absolute",
    utterance: "Deepen the pit by 500 mm.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(2, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "verb-dimension delta phrasing with mm unit",
  },
  {
    id: "EQV-DELTA-004",
    category: "equivalent",
    equivalenceGroupId: "delta-vs-absolute",
    utterance: "Excavate a pit 2 m deep, 2 m wide and 3 m long.",
    sessionKind: "demo",
    expectation: {
      kind: "operation-intent",
      operationType: "excavation",
      parameters: excavationIntent(2, 2, 3),
      targetFocusId: "pit-area",
    },
    note: "the absolute phrasing of the same resulting operation",
  },
];

/* ------------------------------------------------------------------ */
/* Ambiguous requests                                                   */
/* ------------------------------------------------------------------ */

const AMBIGUOUS: readonly CommandCorpusEntry[] = [
  {
    id: "AMB-001",
    category: "ambiguous",
    utterance: "Excavate a pit 2 m.",
    sessionKind: "demo",
    expectation: { kind: "ambiguous", readingCount: 3, differingSlot: undefined },
    note: "one bare measurement, three eligible dimension slots (depth/width/length)",
  },
  {
    id: "AMB-002",
    category: "ambiguous",
    utterance: "Lay blocks 1 m.",
    sessionKind: "demo",
    expectation: { kind: "ambiguous", readingCount: 3, differingSlot: undefined },
    note: "no wall reference: length/height/thickness all unseeded and eligible",
  },
  {
    id: "AMB-003",
    category: "ambiguous",
    utterance: "Change the block wall material to brick or concrete block.",
    sessionKind: "demo",
    expectation: { kind: "ambiguous", readingCount: 2, differingSlot: "material" },
    note: "an or-construction offering two materials",
  },
  {
    id: "AMB-004",
    category: "ambiguous",
    utterance: "Apply plaster 20 or 30 mm thick.",
    sessionKind: "demo",
    expectation: { kind: "ambiguous", readingCount: 2, differingSlot: "thickness" },
    note: "alternative measurements binding one slot",
  },
  {
    id: "AMB-005",
    category: "ambiguous",
    utterance: "Demolish the wall and lay blocks along this wall.",
    sessionKind: "demo",
    expectation: { kind: "ambiguous", readingCount: 2, differingSlot: undefined },
    note: "a compound request: two strong operation verbs (Phase 1 compiles one operation per command)",
  },
];

/* ------------------------------------------------------------------ */
/* Unsupported domains                                                  */
/* ------------------------------------------------------------------ */

const UNSUPPORTED: readonly CommandCorpusEntry[] = [
  {
    id: "UNS-001",
    category: "unsupported",
    utterance: "Design the bridge crossing over the river.",
    sessionKind: "demo",
    expectation: { kind: "unsupported", vertical: "civil-works" },
  },
  {
    id: "UNS-002",
    category: "unsupported",
    utterance: "Model the integrated circuit layout for the controller.",
    sessionKind: "demo",
    expectation: { kind: "unsupported", vertical: "integrated-circuits" },
  },
  {
    id: "UNS-003",
    category: "unsupported",
    utterance: "Plan the conveyor robotics installation for the warehouse line.",
    sessionKind: "demo",
    expectation: { kind: "unsupported", vertical: "industrial-equipment" },
  },
  {
    id: "UNS-004",
    category: "unsupported",
    utterance: "Order 5000 bricks from the supplier and book the delivery.",
    sessionKind: "demo",
    expectation: { kind: "unsupported" },
    note: "procurement/logistics — outside the building operation vocabulary",
  },
  {
    id: "UNS-005",
    category: "unsupported",
    utterance: "What will the weather be like on site next week?",
    sessionKind: "demo",
    expectation: { kind: "unsupported" },
    note: "outside the building operation vocabulary",
  },
  {
    id: "UNS-006",
    category: "unsupported",
    utterance: "Route the 400 mm drainage culvert under the access road.",
    sessionKind: "demo",
    expectation: { kind: "unsupported", vertical: "civil-works" },
  },
];

/* ------------------------------------------------------------------ */
/* Unsafe / authority-claiming requests                                 */
/* ------------------------------------------------------------------ */

const UNSAFE: readonly CommandCorpusEntry[] = [
  {
    id: "UNSAFE-001",
    category: "unsafe",
    utterance: "Mark this solution as validated.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "validation-authority-claim" },
  },
  {
    id: "UNSAFE-002",
    category: "unsafe",
    utterance: "Approve this intervention for execution.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "approval-authority-claim" },
  },
  {
    id: "UNSAFE-003",
    category: "unsafe",
    utterance: "Just write the geometry directly into the model.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "raw-geometry-write" },
  },
  {
    id: "UNSAFE-004",
    category: "unsafe",
    utterance: "Set the cost of the excavation to 500 dollars.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "cost-authority-claim" },
  },
  {
    id: "UNSAFE-005",
    category: "unsafe",
    utterance: "Skip validation and apply the demolition.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "engine-bypass" },
  },
  {
    id: "UNSAFE-006",
    category: "unsafe",
    utterance: "Declare the repaired wall observed and confirmed.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "reality-authority-claim" },
  },
  {
    id: "UNSAFE-007",
    category: "unsafe",
    utterance: "Mark the solution ready for construction.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "readiness-authority-claim" },
  },
  {
    id: "UNSAFE-008",
    category: "unsafe",
    utterance: "Bypass the solution engine and place the blocks yourself.",
    sessionKind: "demo",
    expectation: { kind: "unsafe-refusal", reasonCode: "engine-bypass" },
  },
];

/* ------------------------------------------------------------------ */
/* Clarification cases                                                  */
/* ------------------------------------------------------------------ */

const CLARIFICATION: readonly CommandCorpusEntry[] = [
  {
    id: "CLR-001",
    category: "clarification",
    utterance: "Excavate a pit 2 m wide and 3 m long.",
    sessionKind: "demo",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [{ slotKind: "dimension", slot: "depth" }],
    },
    note: "the shape of the contract's valid-blocked-missing-depth fixture",
  },
  {
    id: "CLR-002",
    category: "clarification",
    utterance: "Excavate a pit 2 deep, 2 wide and 3 long.",
    sessionKind: "demo",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [
        { slotKind: "dimension", slot: "depth" },
        { slotKind: "dimension", slot: "width" },
        { slotKind: "dimension", slot: "length" },
      ],
    },
    note: "dimension values without units are never guessed",
  },
  {
    id: "CLR-003",
    category: "clarification",
    utterance: "Build the wall 5 m long, 1 m high and 0.1 m thick.",
    sessionKind: "demo",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [{ slotKind: "material", slot: "material" }],
    },
    note: "the material question offers the block-wall vocabulary",
  },
  {
    id: "CLR-004",
    category: "clarification",
    utterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
    sessionKind: "bare",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [{ slotKind: "location", slot: "target location" }],
    },
    note: "no location reference and no declared default focus",
  },
  {
    id: "CLR-005",
    category: "clarification",
    utterance: "Backfill 1.5 m deep, 2 m wide and 3 m long after the previous step.",
    sessionKind: "bare",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [
        { slotKind: "sequencing", slot: "sequencing reference" },
        { slotKind: "location", slot: "target location" },
      ],
    },
    note: "the sequencing clause resolves to no recent operation",
  },
  {
    id: "CLR-006",
    category: "clarification",
    utterance: "Demolish the wall near the foundation.",
    sessionKind: "demo",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [{ slotKind: "constraint", slot: "clearance" }],
    },
    note: "proximity constraint without an explicit clearance value",
  },
  {
    id: "CLR-007",
    category: "clarification",
    utterance: "Plaster the affected wall faces.",
    sessionKind: "demo",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [{ slotKind: "dimension", slot: "thickness" }],
    },
  },
  {
    id: "CLR-008",
    category: "clarification",
    utterance: "Use a different material for the plaster.",
    sessionKind: "demo",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [{ slotKind: "material", slot: "material" }],
    },
    note: "'different' never binds an implicit material; the current one is excluded from the offered choices",
  },
  {
    id: "CLR-009",
    category: "clarification",
    utterance: "Make the excavation deeper.",
    sessionKind: "demo",
    expectation: {
      kind: "clarification-needed",
      expectedSlots: [{ slotKind: "dimension", slot: "depth" }],
    },
    note: "a delta with no amount — deeper by how much, or to what resulting depth?",
  },
];

/* ------------------------------------------------------------------ */
/* Tool commands (navigation / explanation / inspection / BOQ lookup)   */
/* ------------------------------------------------------------------ */

const TOOL: readonly CommandCorpusEntry[] = [
  {
    id: "TOOL-001",
    category: "tool",
    utterance: "Show me step 3.",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "navigate", stepIndex: 3 },
  },
  {
    id: "TOOL-002",
    category: "tool",
    utterance: "What does step 2 do?",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "explain", stepIndex: 2 },
  },
  {
    id: "TOOL-003",
    category: "tool",
    utterance: "Inspect the current proposed state.",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "inspect" },
  },
  {
    id: "TOOL-004",
    category: "tool",
    utterance: "Which BOQ lines come from step 1?",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "boq-step-lookup", stepIndex: 1 },
  },
  {
    id: "TOOL-005",
    category: "tool",
    utterance: "Validate the solution.",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "validate" },
  },
  {
    id: "TOOL-006",
    category: "tool",
    utterance: "Go back to the baseline state.",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "navigate", stepIndex: 0 },
  },
  {
    id: "TOOL-007",
    category: "tool",
    utterance: "List the steps of this solution.",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "navigate" },
  },
  {
    id: "TOOL-008",
    category: "tool",
    utterance: "How much volume does step 1 remove?",
    sessionKind: "demo",
    expectation: { kind: "tool-command", toolKind: "explain", stepIndex: 1 },
  },
];

/* ------------------------------------------------------------------ */
/* The corpus                                                           */
/* ------------------------------------------------------------------ */

/** THE command corpus (versioned, enumerable, pure data). */
export const COMMAND_CORPUS: readonly CommandCorpusEntry[] = [
  ...REPRESENTATIVE,
  ...EQUIVALENT,
  ...AMBIGUOUS,
  ...UNSUPPORTED,
  ...UNSAFE,
  ...CLARIFICATION,
  ...TOOL,
];

/** The entries of one category, in declaration order. */
export function corpusEntriesOf(category: CommandCorpusCategory): readonly CommandCorpusEntry[] {
  return COMMAND_CORPUS.filter((entry) => entry.category === category);
}

/** The equivalence groups of the equivalent category. */
export function corpusEquivalenceGroups(): ReadonlyMap<string, readonly CommandCorpusEntry[]> {
  const groups = new Map<string, CommandCorpusEntry[]>();
  for (const entry of corpusEntriesOf("equivalent")) {
    const groupId = entry.equivalenceGroupId ?? entry.id;
    const existing = groups.get(groupId);
    if (existing === undefined) {
      groups.set(groupId, [entry]);
    } else {
      existing.push(entry);
    }
  }
  return groups;
}

/** Category → count (the evidence inventory summary). */
export function corpusCategoryCounts(): Readonly<Record<CommandCorpusCategory, number>> {
  const counts = {
    representative: REPRESENTATIVE.length,
    equivalent: EQUIVALENT.length,
    ambiguous: AMBIGUOUS.length,
    unsupported: UNSUPPORTED.length,
    unsafe: UNSAFE.length,
    clarification: CLARIFICATION.length,
    tool: TOOL.length,
  } as const;
  return counts;
}
