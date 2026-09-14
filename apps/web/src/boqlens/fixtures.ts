/**
 * AISE-024 deterministic test fixtures — TEST SUPPORT ONLY, never imported
 * by the rendering modules (mirrors the AISE-021 workspace/fixtures.ts
 * convention).
 *
 * apps/web CANNOT import backend sources (boundary matrix: apps →
 * apps/packages only), so this file hand-builds a STRUCTURAL fixture that
 * mirrors what the AISE-011 → AISE-014 → AISE-017 pipeline would emit for a
 * small GHS bill of quantities with two sections:
 *
 *  - Substructure: rows 12–14 (plaster walls → 4 mapped walls; concrete
 *    blinding → 1 mapped slab on a storey-less path; an UNCERTAIN excavation
 *    line that stays honestly unmapped);
 *  - Finishes: rows 4–6 (ambiguous vinyl tiles with two competing location
 *    clusters; paint with an abbreviation expansion and 5 mapped elements;
 *    a scaffold hire line with NO stated numbers — excluded from totals,
 *    never assumed zero).
 *
 * All ids/timestamps fixed; no clock, no randomness. `sourceCellRefs` is the
 * provenance-resolution universe (every non-empty cell the fixture cites).
 */

import type {
  BoqLensInput,
  BoqLensItem,
  LensItemInterpretation,
  LensMappingEntry,
} from "./model";

export const FIXTURE_IMPORT_ID = "imp-2024-boq-001";
export const FIXTURE_SOURCE_NAME = "haccra-boq-2024-05.xlsx";
export const FIXTURE_DICTIONARY_VERSION = "1.0.0";
export const FIXTURE_MAPPING_VERSION = 1;
export const FIXTURE_RECORDED_AT = "2024-05-02T09:15:00Z";

/** Every non-empty source cell in the fixture document (doc order). */
export const FIXTURE_SOURCE_CELL_REFS: readonly string[] = [
  "Substructure!B12",
  "Substructure!C12",
  "Substructure!D12",
  "Substructure!E12",
  "Substructure!F12",
  "Substructure!B13",
  "Substructure!C13",
  "Substructure!D13",
  "Substructure!E13",
  "Substructure!F13",
  "Substructure!B14",
  "Substructure!C14",
  "Substructure!D14",
  "Substructure!E14",
  "Substructure!F14",
  "Finishes!B4",
  "Finishes!C4",
  "Finishes!D4",
  "Finishes!E4",
  "Finishes!F4",
  "Finishes!B5",
  "Finishes!C5",
  "Finishes!D5",
  "Finishes!E5",
  "Finishes!F5",
  "Finishes!B6",
  "Finishes!C6",
];

const GROUND_FLOOR = ["Site A", "Building 1", "Ground Floor"] as const;
const BUILDING_ONLY = ["Site A", "Building 1"] as const;

function walls(): { nodeId: string; spacePath: readonly string[]; nodeVersionId: string }[] {
  return ["wall-e", "wall-n", "wall-s", "wall-w"].map((nodeId) => ({
    nodeId,
    spacePath: GROUND_FLOOR,
    nodeVersionId: "v002",
  }));
}

type CoreItem = Omit<BoqLensItem, "mapping">;

/** Attach a mapping entry whose boqItem mirrors the item's source identity. */
function withMapping(core: CoreItem, entryId: string, entry: Omit<LensMappingEntry, "entryId" | "boqItem">): BoqLensItem {
  return {
    ...core,
    mapping: {
      entryId,
      boqItem: {
        sectionTitle: core.sectionTitle,
        rowNumber: core.rowNumber,
        descriptionCellRef: core.descriptionCellRef,
        unitCellRef: core.unitCellRef,
        originalText: core.originalText,
      },
      ...entry,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The six fixture items                                               */
/* ------------------------------------------------------------------ */

const SUB_R12 = withMapping(
  {
    itemId: "sub-r12",
    rowNumber: 12,
    sectionTitle: "Substructure",
    originalText: "Plaster to internal walls",
    descriptionCellRef: "Substructure!B12",
    unitCellRef: "Substructure!C12",
    unitText: "m2",
    currency: "GHS",
    quantity: { cellRef: "Substructure!D12", value: 220 },
    rate: { cellRef: "Substructure!E12", value: 12.5 },
    amount: { cellRef: "Substructure!F12", value: 2750 },
    interpretation: {
      sectionTitle: "Substructure",
      rowNumber: 12,
      description: {
        field: "description",
        originalText: "Plaster to internal walls",
        normalizedText: "Plaster to internal walls",
        conceptCode: "PLASTERING",
        confidence: "medium",
        method: "dictionary_synonym",
        sourceRefs: ["Substructure!B12"],
        notes: "matched on keyword 'plaster'",
      },
      unit: {
        field: "unit",
        originalText: "m2",
        normalizedText: "m2",
        unitCode: "SQM",
        confidence: "high",
        method: "dictionary_exact",
        sourceRefs: ["Substructure!C12"],
      },
    },
  },
  "entry-sub-r12",
  {
    targets: walls(),
    status: "mapped",
    confidence: "medium",
    method: "normalized_concept_match",
    provenance: {
      dictionaryVersion: FIXTURE_DICTIONARY_VERSION,
      normalizerVersion: "aise-boq-normalizer/1.0",
      matchedOn: "concept PLASTERING → wall elements via semantic.kind=wall",
      recordedAt: FIXTURE_RECORDED_AT,
    },
  },
);

const SUB_R13 = withMapping(
  {
    itemId: "sub-r13",
    rowNumber: 13,
    sectionTitle: "Substructure",
    originalText: "Concrete blinding to foundations",
    descriptionCellRef: "Substructure!B13",
    unitCellRef: "Substructure!C13",
    unitText: "m3",
    currency: "GHS",
    quantity: { cellRef: "Substructure!D13", value: 35 },
    rate: { cellRef: "Substructure!E13", value: 420 },
    amount: { cellRef: "Substructure!F13", value: 14700 },
    interpretation: {
      sectionTitle: "Substructure",
      rowNumber: 13,
      description: {
        field: "description",
        originalText: "Concrete blinding to foundations",
        normalizedText: "Concrete blinding to foundations",
        conceptCode: "CONCRETE",
        confidence: "high",
        method: "dictionary_exact",
        sourceRefs: ["Substructure!B13"],
        notes: "matched dictionary entry 'concrete'",
      },
      unit: {
        field: "unit",
        originalText: "m3",
        normalizedText: "m3",
        unitCode: "CBM",
        confidence: "high",
        method: "dictionary_exact",
        sourceRefs: ["Substructure!C13"],
      },
    },
  },
  "entry-sub-r13",
  {
    targets: [{ nodeId: "foundation-slab-1", spacePath: BUILDING_ONLY, nodeVersionId: "v002" }],
    status: "mapped",
    confidence: "high",
    method: "location_match",
    provenance: {
      dictionaryVersion: FIXTURE_DICTIONARY_VERSION,
      normalizerVersion: "aise-boq-normalizer/1.0",
      matchedOn: "location hint 'foundations' discriminated cluster Site A / Building 1",
      recordedAt: FIXTURE_RECORDED_AT,
    },
  },
);

const SUB_R14 = withMapping(
  {
    itemId: "sub-r14",
    rowNumber: 14,
    sectionTitle: "Substructure",
    // Deliberately messy spacing — VERBATIM preservation is byte-tested.
    originalText: "Excavate reduced level dig  S/b  (see note 3)",
    descriptionCellRef: "Substructure!B14",
    unitCellRef: "Substructure!C14",
    unitText: "m3",
    currency: "GHS",
    quantity: { cellRef: "Substructure!D14", value: 180 },
    rate: { cellRef: "Substructure!E14", value: 55 },
    amount: { cellRef: "Substructure!F14", value: 9900 },
    interpretation: {
      sectionTitle: "Substructure",
      rowNumber: 14,
      description: {
        field: "description",
        originalText: "Excavate reduced level dig  S/b  (see note 3)",
        confidence: "uncertain",
        method: "unresolved",
        sourceRefs: ["Substructure!B14"],
        alternatives: [
          { code: "EXCAVATION", reason: "near-miss token 'excavate'" },
          { code: "EARTHWORKS", reason: "competing reading for 'reduced level dig'" },
        ],
      },
      unit: {
        field: "unit",
        originalText: "m3",
        normalizedText: "m3",
        unitCode: "CBM",
        confidence: "high",
        method: "dictionary_exact",
        sourceRefs: ["Substructure!C14"],
      },
    },
  },
  "entry-sub-r14",
  {
    targets: [],
    status: "unmapped",
    confidence: "uncertain",
    method: "unresolved",
    provenance: { recordedAt: FIXTURE_RECORDED_AT },
    reason: "interpretation uncertain — no concept resolved, no mapping attempted",
  },
);

const FIN_R4 = withMapping(
  {
    itemId: "fin-r4",
    rowNumber: 4,
    sectionTitle: "Finishes",
    originalText: "Vinyl floor tiles to lobby area",
    descriptionCellRef: "Finishes!B4",
    unitCellRef: "Finishes!C4",
    unitText: "m2",
    currency: "GHS",
    quantity: { cellRef: "Finishes!D4", value: 48 },
    rate: { cellRef: "Finishes!E4", value: 38 },
    amount: { cellRef: "Finishes!F4", value: 1824 },
    interpretation: {
      sectionTitle: "Finishes",
      rowNumber: 4,
      description: {
        field: "description",
        originalText: "Vinyl floor tiles to lobby area",
        normalizedText: "Vinyl floor tiles to lobby area",
        conceptCode: "FLOOR_FINISH",
        confidence: "high",
        method: "dictionary_synonym",
        sourceRefs: ["Finishes!B4"],
        notes: "matched on keyword 'vinyl'",
      },
      unit: {
        field: "unit",
        originalText: "m2",
        normalizedText: "m2",
        unitCode: "SQM",
        confidence: "high",
        method: "dictionary_exact",
        sourceRefs: ["Finishes!C4"],
      },
    },
  },
  "entry-fin-r4",
  {
    targets: [],
    status: "ambiguous",
    confidence: "low",
    method: "normalized_concept_match",
    provenance: { recordedAt: FIXTURE_RECORDED_AT },
    alternatives: [
      { targetNodeId: "floor-lobby-ground", reason: "cluster Site A / Building 1 / Ground Floor" },
      { targetNodeId: "floor-lobby-first", reason: "cluster Site A / Building 1 / First Floor" },
    ],
    reason: "two location clusters compete; no hint discriminated",
  },
);

const FIN_R5 = withMapping(
  {
    itemId: "fin-r5",
    rowNumber: 5,
    sectionTitle: "Finishes",
    // Deliberate '&' + double space — escaping and verbatim tests.
    originalText: "Paint walls & ceil.  emulsion",
    descriptionCellRef: "Finishes!B5",
    unitCellRef: "Finishes!C5",
    unitText: "m2",
    currency: "GHS",
    quantity: { cellRef: "Finishes!D5", value: 210 },
    rate: { cellRef: "Finishes!E5", value: 9.25 },
    amount: { cellRef: "Finishes!F5", value: 1942.5 },
    interpretation: {
      sectionTitle: "Finishes",
      rowNumber: 5,
      description: {
        field: "description",
        originalText: "Paint walls & ceil.  emulsion",
        normalizedText: "Paint walls and ceiling emulsion",
        conceptCode: "PAINTING",
        confidence: "medium",
        method: "abbreviation_expansion",
        sourceRefs: ["Finishes!B5"],
        notes: "expanded 'ceil.' → 'ceiling'",
      },
      unit: {
        field: "unit",
        originalText: "m2",
        normalizedText: "m2",
        unitCode: "SQM",
        confidence: "high",
        method: "dictionary_exact",
        sourceRefs: ["Finishes!C5"],
      },
    },
  },
  "entry-fin-r5",
  {
    targets: [
      ...walls(),
      { nodeId: "ceiling-1", spacePath: GROUND_FLOOR, nodeVersionId: "v002" },
    ],
    status: "mapped",
    confidence: "medium",
    method: "normalized_concept_match",
    provenance: {
      dictionaryVersion: FIXTURE_DICTIONARY_VERSION,
      normalizerVersion: "aise-boq-normalizer/1.0",
      matchedOn: "concept PAINTING → wall and ceiling elements",
      recordedAt: FIXTURE_RECORDED_AT,
    },
  },
);

const FIN_R6 = withMapping(
  {
    itemId: "fin-r6",
    rowNumber: 6,
    sectionTitle: "Finishes",
    originalText: "Scaffold hire (preliminary item)",
    descriptionCellRef: "Finishes!B6",
    unitCellRef: "Finishes!C6",
    unitText: "lot",
    currency: "GHS",
    quantity: null,
    rate: null,
    amount: null,
    interpretation: {
      sectionTitle: "Finishes",
      rowNumber: 6,
      description: {
        field: "description",
        originalText: "Scaffold hire (preliminary item)",
        normalizedText: "Scaffold hire (preliminary item)",
        conceptCode: "SCAFFOLDING",
        confidence: "high",
        method: "dictionary_exact",
        sourceRefs: ["Finishes!B6"],
        notes: "matched dictionary entry 'scaffold'",
      },
      unit: {
        field: "unit",
        originalText: "lot",
        confidence: "uncertain",
        method: "unresolved",
        sourceRefs: ["Finishes!C6"],
      },
    },
  },
  "entry-fin-r6",
  {
    targets: [],
    status: "unmapped",
    confidence: "low",
    method: "unresolved",
    provenance: { recordedAt: FIXTURE_RECORDED_AT },
    reason: "concept resolved (SCAFFOLDING) but no candidates in the graph snapshot — scaffolding is deliberately not modelled",
  },
);

/* ------------------------------------------------------------------ */
/* Input assembly + helpers                                            */
/* ------------------------------------------------------------------ */

export const FIXTURE_ITEMS: readonly BoqLensItem[] = [
  SUB_R12,
  SUB_R13,
  SUB_R14,
  FIN_R4,
  FIN_R5,
  FIN_R6,
];

/** The clean fixture input (fresh object identity on every call). */
export function boqLensInput(): BoqLensInput {
  return {
    importId: FIXTURE_IMPORT_ID,
    sourceName: FIXTURE_SOURCE_NAME,
    dictionaryVersion: FIXTURE_DICTIONARY_VERSION,
    mappingVersion: FIXTURE_MAPPING_VERSION,
    sourceCellRefs: [...FIXTURE_SOURCE_CELL_REFS],
    items: JSON.parse(JSON.stringify(FIXTURE_ITEMS)) as BoqLensItem[],
  };
}

/** One fixture item by id (deep clone — tests may mutate freely). */
export function fixtureItem(itemId: string): BoqLensItem {
  const item = FIXTURE_ITEMS.find((candidate) => candidate.itemId === itemId);
  if (item === undefined) {
    throw new Error(`fixture item not found: ${itemId}`);
  }
  return JSON.parse(JSON.stringify(item)) as BoqLensItem;
}

/** The fixture item's interpretation record (deep clone). */
export function fixtureInterpretation(itemId: string): LensItemInterpretation | null {
  return fixtureItem(itemId).interpretation ?? null;
}

/** The fixture item's mapping entry (deep clone). */
export function fixtureMapping(itemId: string): LensMappingEntry | null {
  return fixtureItem(itemId).mapping ?? null;
}

/** Deep-freeze helper (purity tests). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
