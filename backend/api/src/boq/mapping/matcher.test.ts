/**
 * Matcher tests (AISE-017) — the deterministic mapping policy over synthetic
 * AISE-014 interpretations x reality-graph snapshot nodes: happy paths (one
 * storey of plaster walls), one-to-many / many-to-one, ambiguity
 * discrimination + its mutation, unmapped discipline + its mutation,
 * provenance verbatim source identity, purity/determinism, manual revisions
 * and the single input-validation path.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type {
  Interpretation,
  InterpretationAlternative,
  InterpretationConfidence,
  InterpretationMethod,
  ItemInterpretation,
} from "../normalization/types";
import {
  MappingError,
  computeMappingStats,
  mappingIdentity,
  parseGraphSnapshot,
  parseManualMappingInput,
  type BoqMapping,
  type MappingEntry,
  type MappingStatus,
  type SnapshotNode,
} from "./model";
import { applyManualMapping, mapBoqToReality } from "./matcher";

const NOW = "2026-02-01T09:00:00.000Z";
const NOW2 = "2026-02-02T09:00:00.000Z";
const IMPORT_ID = `cd`.repeat(32);

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function descriptionInterp(options: {
  originalText: string;
  conceptCode?: string;
  confidence: InterpretationConfidence;
  method: InterpretationMethod;
  ref?: string;
  alternatives?: readonly InterpretationAlternative[];
}): Interpretation {
  return {
    field: "description",
    originalText: options.originalText,
    ...(options.conceptCode !== undefined ? { conceptCode: options.conceptCode } : {}),
    confidence: options.confidence,
    method: options.method,
    sourceRefs: [options.ref ?? "Finishes!B4"],
    ...(options.alternatives !== undefined ? { alternatives: options.alternatives } : {}),
  };
}

function unitInterp(text: string, ref = "Finishes!C4"): Interpretation {
  return {
    field: "unit",
    originalText: text,
    unitCode: "m2",
    confidence: "high",
    method: "dictionary_exact",
    sourceRefs: [ref],
  };
}

function item(
  rowNumber: number,
  description: Interpretation | null,
  unit: Interpretation | null,
  sectionTitle: string | null = null,
): ItemInterpretation {
  return { sectionTitle, rowNumber, description, unit };
}

function node(
  nodeId: string,
  options: {
    semanticKind?: string;
    material?: string;
    spacePath?: string[];
    nodeVersionId?: string;
    kind?: string;
  } = {},
): SnapshotNode {
  const properties: { key: string; value: string }[] = [];
  if (options.semanticKind !== undefined) {
    properties.push({ key: "semantic.kind", value: options.semanticKind });
  }
  if (options.material !== undefined) {
    properties.push({ key: "element.material", value: options.material });
  }
  return {
    nodeId,
    kind: options.kind ?? "element",
    ...(properties.length > 0 ? { properties } : {}),
    ...(options.spacePath !== undefined ? { spacePath: options.spacePath } : {}),
    ...(options.nodeVersionId !== undefined ? { nodeVersionId: options.nodeVersionId } : {}),
  };
}

function plasterRow(sectionTitle: string | null = null): ItemInterpretation {
  return item(
    4,
    descriptionInterp({
      originalText: "Plaster to internal walls",
      conceptCode: "PLASTERING",
      confidence: "high",
      method: "dictionary_exact",
    }),
    unitInterp("m2"),
    sectionTitle,
  );
}

function run(
  interpretations: readonly ItemInterpretation[],
  nodes: readonly SnapshotNode[],
  now: string = NOW,
): MappingEntry[] {
  return mapBoqToReality({ interpretations, graphSnapshot: { nodes }, now });
}

const UNRESOLVED_ALTERNATIVES: readonly InterpretationAlternative[] = [
  { code: "STEELWORK", reason: "bare 'steel' competes between STEELWORK and REINFORCEMENT" },
  { code: "REINFORCEMENT", reason: "bare 'steel' competes between STEELWORK and REINFORCEMENT" },
];

/* ------------------------------------------------------------------ */
/* Concept matching                                                    */
/* ------------------------------------------------------------------ */

describe("concept matching without location context", () => {
  test("plaster walls: mapped, medium, one target per wall (one-to-many)", () => {
    const walls = [node("wall-1"), node("wall-2"), node("wall-3")].map((candidate) =>
      node(candidate.nodeId, { semanticKind: "wall" }),
    );
    const entries = run([plasterRow()], walls);
    expect(entries.length).toBe(1);
    const entry = entries[0]!;
    expect(entry.status).toBe("mapped");
    expect(entry.confidence).toBe("medium");
    expect(entry.method).toBe("normalized_concept_match");
    expect(entry.targets.map((target) => target.nodeId).sort()).toEqual([
      "wall-1",
      "wall-2",
      "wall-3",
    ]);
    expect(entry.targets[0]!.matchNote).toContain("concept PLASTERING");
    expect(entry.targets[0]!.matchNote).toContain("semantic.kind=wall");
    expect(entry.provenance.recordedAt).toBe(NOW);
    expect(entry.provenance.matchedOn).toContain("no location context");
  });

  test("concept matches via element.material token", () => {
    const skimmed = node("surf-1", { material: "Plaster skim coat" });
    const entries = run([plasterRow()], [skimmed, node("door-1", { semanticKind: "door" })]);
    expect(entries[0]!.status).toBe("mapped");
    expect(entries[0]!.targets.map((target) => target.nodeId)).toEqual(["surf-1"]);
    expect(entries[0]!.targets[0]!.matchNote).toContain("element.material");
  });

  test("word boundary: 'waterproofing' material does NOT match ROOFING ('roof' token)", () => {
    const wet = node("wp-1", { material: "waterproofing membrane" });
    const row = item(
      6,
      descriptionInterp({
        originalText: "Roof coverings",
        conceptCode: "ROOFING",
        confidence: "high",
        method: "dictionary_exact",
      }),
      unitInterp("m2"),
    );
    const entries = run([row], [wet]);
    expect(entries[0]!.status).toBe("unmapped");
    expect(entries[0]!.reason).toContain("no reality nodes matched concept ROOFING");
  });

  test("resolved concept with zero candidates stays unmapped (mismatch reported)", () => {
    const row = item(
      7,
      descriptionInterp({
        originalText: "Scaffolding to elevations",
        conceptCode: "SCAFFOLDING",
        confidence: "medium",
        method: "dictionary_synonym",
      }),
      unitInterp("m2"),
    );
    const entries = run([row], [node("wall-1", { semanticKind: "wall" })]);
    const entry = entries[0]!;
    expect(entry.status).toBe("unmapped");
    expect(entry.confidence).toBe("low");
    expect(entry.method).toBe("normalized_concept_match");
    expect(entry.targets).toEqual([]);
    expect(entry.reason).toContain("no reality nodes matched concept SCAFFOLDING");
  });
});

/* ------------------------------------------------------------------ */
/* Location refinement                                                 */
/* ------------------------------------------------------------------ */

describe("location refinement (section title x space paths)", () => {
  const groundWalls = [
    node("wall-g1", { semanticKind: "wall", spacePath: ["Site A", "Building 1", "Ground Floor", "Room 101"] }),
    node("wall-g2", { semanticKind: "wall", spacePath: ["Site A", "Building 1", "Ground Floor", "Room 102"] }),
  ];

  test("ground-floor section title + matching space paths -> high + location_match", () => {
    const entries = run([plasterRow("GROUND FLOOR FINISHES")], groundWalls);
    const entry = entries[0]!;
    expect(entry.status).toBe("mapped");
    expect(entry.confidence).toBe("high");
    expect(entry.method).toBe("location_match");
    expect(entry.targets.map((target) => target.nodeId).sort()).toEqual(["wall-g1", "wall-g2"]);
    expect(entry.provenance.matchedOn).toContain("location hint 'ground floor'");
    expect(entry.targets[0]!.spacePath).toEqual([
      "Site A",
      "Building 1",
      "Ground Floor",
      "Room 101",
    ]);
  });

  test("title case/whitespace variants still match (normalized containment)", () => {
    const entries = run([plasterRow("  ground    floor  finishes ")], groundWalls);
    expect(entries[0]!.confidence).toBe("high");
    expect(entries[0]!.method).toBe("location_match");
  });

  test("hint matching nothing among candidates: mapped medium + reported mismatch", () => {
    const entries = run([plasterRow("FIRST FLOOR FINISHES")], groundWalls);
    const entry = entries[0]!;
    expect(entry.status).toBe("mapped");
    expect(entry.confidence).toBe("medium");
    expect(entry.method).toBe("normalized_concept_match");
    expect(entry.reason).toContain("mismatch reported");
    expect(entry.reason).toContain("first floor");
  });

  test("two hints matching two clusters stays ambiguous (no discrimination)", () => {
    const firstFloorWalls = [node("wall-f1", { semanticKind: "wall", spacePath: ["Building 1", "First Floor"] })];
    const entries = run([plasterRow("GROUND FLOOR AND FIRST FLOOR FINISHES")], [...groundWalls, ...firstFloorWalls]);
    const entry = entries[0]!;
    expect(entry.status).toBe("ambiguous");
    expect(entry.targets).toEqual([]);
    expect(entry.alternatives?.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Ambiguity discrimination + mutation                                 */
/* ------------------------------------------------------------------ */

describe("ambiguity discrimination (mutation evidence)", () => {
  const blockworkRow = item(
    5,
    descriptionInterp({
      originalText: "Blockwork to walls",
      conceptCode: "MASONRY",
      confidence: "high",
      method: "dictionary_synonym",
    }),
    unitInterp("m2"),
  );
  const groundCluster = [
    node("wall-g1", { semanticKind: "wall", spacePath: ["Building 1", "Ground Floor"] }),
    node("wall-g2", { semanticKind: "wall", spacePath: ["Building 1", "Ground Floor"] }),
  ];
  const firstCluster = [
    node("wall-f1", { semanticKind: "wall", spacePath: ["Building 1", "First Floor"] }),
    node("wall-f2", { semanticKind: "wall", spacePath: ["Building 1", "First Floor"] }),
  ];

  test("two spatially-distinct clusters -> ambiguous with alternatives naming both", () => {
    const entries = run([blockworkRow], [...groundCluster, ...firstCluster]);
    const entry = entries[0]!;
    expect(entry.status).toBe("ambiguous");
    expect(entry.confidence).toBe("low");
    expect(entry.targets).toEqual([]);
    const alternatives = entry.alternatives ?? [];
    expect(alternatives.length).toBe(2);
    const reasons = alternatives.map((alternative) => alternative.reason).join(" | ");
    expect(reasons).toContain("ground floor");
    expect(reasons).toContain("first floor");
    expect(alternatives.map((alternative) => alternative.targetNodeId).sort()).toEqual([
      "wall-f1",
      "wall-g1",
    ]);
    expect(entry.reason).toContain("2 spatially distinct clusters");
  });

  test("MUTATION: removing one cluster's semantic property -> mapped (discrimination)", () => {
    const strippedFirstCluster = firstCluster.map((candidate) =>
      node(candidate.nodeId, {
        spacePath: candidate.spacePath !== undefined ? [...candidate.spacePath] : undefined,
      }),
    );
    const entries = run([blockworkRow], [...groundCluster, ...strippedFirstCluster]);
    const entry = entries[0]!;
    expect(entry.status).toBe("mapped");
    expect(entry.confidence).toBe("medium");
    expect(entry.targets.map((target) => target.nodeId).sort()).toEqual(["wall-g1", "wall-g2"]);
    expect(entry.alternatives).toBeUndefined();
  });

  test("located + unlocated candidates compete -> ambiguous (honest)", () => {
    const unlocated = node("wall-x", { semanticKind: "wall" });
    const entries = run([blockworkRow], [groundCluster[0]!, unlocated]);
    const entry = entries[0]!;
    expect(entry.status).toBe("ambiguous");
    expect((entry.alternatives ?? []).length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Unmapped discipline + mutation                                      */
/* ------------------------------------------------------------------ */

describe("unmapped discipline (mutation evidence)", () => {
  const uncertainRow = item(
    8,
    descriptionInterp({
      originalText: "Steel work",
      confidence: "uncertain",
      method: "unresolved",
      alternatives: UNRESOLVED_ALTERNATIVES,
    }),
    unitInterp("m2"),
  );
  const walls = [node("wall-1", { semanticKind: "wall" })];

  test("uncertain interpretation -> unmapped, never guessed, reason records alternatives", () => {
    const entries = run([uncertainRow], walls);
    const entry = entries[0]!;
    expect(entry.status).toBe("unmapped");
    expect(entry.confidence).toBe("uncertain");
    expect(entry.method).toBe("unresolved");
    expect(entry.targets).toEqual([]);
    expect(entry.reason).toContain("unresolved");
    expect(entry.reason).toContain("2 recorded alternative reading(s)");
  });

  test("MUTATION: making the interpretation resolve -> mapped", () => {
    const resolvedRow = item(
      8,
      descriptionInterp({
        originalText: "Steel work",
        conceptCode: "STEELWORK",
        confidence: "medium",
        method: "dictionary_synonym",
      }),
      unitInterp("m2"),
    );
    const steelNode = node("beam-1", { material: "structural steel" });
    const entries = run([resolvedRow], [steelNode]);
    expect(entries[0]!.status).toBe("mapped");
    expect(entries[0]!.targets.map((target) => target.nodeId)).toEqual(["beam-1"]);
  });

  test("row without any description cell -> unmapped with explicit reason", () => {
    const entries = run([item(9, null, unitInterp("m2"))], walls);
    const entry = entries[0]!;
    expect(entry.status).toBe("unmapped");
    expect(entry.method).toBe("unresolved");
    expect(entry.reason).toContain("no interpretable description cell");
    expect(entry.boqItem.originalText).toBe("m2");
  });
});

/* ------------------------------------------------------------------ */
/* One-to-many / many-to-one                                           */
/* ------------------------------------------------------------------ */

describe("cardinality", () => {
  test("one BOQ row maps to N wall nodes (targets.length === N)", () => {
    const walls = [1, 2, 3, 4].map((index) => node(`wall-${index}`, { semanticKind: "wall" }));
    const entries = run([plasterRow()], walls);
    expect(entries[0]!.targets.length).toBe(4);
  });

  test("many-to-one: two rows both map to the same floor node", () => {
    const floor = node("floor-1", { semanticKind: "floor", material: "concrete" });
    const concreteRow = item(
      3,
      descriptionInterp({
        originalText: "Concrete blinding",
        conceptCode: "CONCRETE_WORK",
        confidence: "high",
        method: "dictionary_exact",
      }),
      unitInterp("m3"),
    );
    const tilingRow = item(
      4,
      descriptionInterp({
        originalText: "Ceramic floor tiling",
        conceptCode: "TILING",
        confidence: "high",
        method: "dictionary_exact",
      }),
      unitInterp("m2"),
    );
    const entries = run([concreteRow, tilingRow], [floor]);
    expect(entries[0]!.targets[0]!.nodeId).toBe("floor-1");
    expect(entries[1]!.targets[0]!.nodeId).toBe("floor-1");
  });
});

/* ------------------------------------------------------------------ */
/* Provenance + source identity                                        */
/* ------------------------------------------------------------------ */

describe("provenance and verbatim source identity", () => {
  test("entries carry originalText verbatim + cell refs + method + confidence", () => {
    const entries = run([plasterRow("Finishes Section")], [node("wall-1", { semanticKind: "wall", nodeVersionId: "v003" })]);
    const entry = entries[0]!;
    expect(entry.boqItem.originalText).toBe("Plaster to internal walls");
    expect(entry.boqItem.sectionTitle).toBe("Finishes Section");
    expect(entry.boqItem.rowNumber).toBe(4);
    expect(entry.boqItem.descriptionCellRef).toBe("Finishes!B4");
    expect(entry.boqItem.unitCellRef).toBe("Finishes!C4");
    expect(entry.method).toBe("normalized_concept_match");
    expect(entry.confidence).toBe("medium");
    expect(entry.targets[0]!.nodeVersionId).toBe("v003");
  });

  test("normalizedView provenance is carried; absent view -> absent keys", () => {
    const withView = mapBoqToReality({
      interpretations: [plasterRow()],
      normalizedView: { dictionaryVersion: "1.0.0", generatedBy: "aise-boq-normalizer/1.0" },
      graphSnapshot: { nodes: [node("wall-1", { semanticKind: "wall" })] },
      now: NOW,
    });
    expect(withView[0]!.provenance.dictionaryVersion).toBe("1.0.0");
    expect(withView[0]!.provenance.normalizerVersion).toBe("aise-boq-normalizer/1.0");
    const withoutView = run([plasterRow()], [node("wall-1", { semanticKind: "wall" })]);
    expect(withoutView[0]!.provenance.dictionaryVersion).toBeUndefined();
    expect(withoutView[0]!.provenance.normalizerVersion).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Purity + determinism                                                */
/* ------------------------------------------------------------------ */

describe("purity and determinism", () => {
  const items = [plasterRow(), item(5, null, unitInterp("m2"))];
  const nodes = [
    node("wall-1", { semanticKind: "wall", spacePath: ["Ground Floor"] }),
    node("wall-2", { semanticKind: "wall" }),
  ];

  test("inputs are never mutated (byte-compare interpretations + snapshot nodes)", () => {
    const itemsBefore = canonicalJsonStringify(items);
    const nodesBefore = canonicalJsonStringify(nodes);
    run(items, nodes);
    expect(canonicalJsonStringify(items)).toBe(itemsBefore);
    expect(canonicalJsonStringify(nodes)).toBe(nodesBefore);
  });

  test("deep-frozen inputs do not break the matcher", () => {
    const frozenNodes = nodes.map((candidate) =>
      Object.freeze({
        ...candidate,
        ...(candidate.properties !== undefined
          ? { properties: candidate.properties.map((property) => Object.freeze({ ...property })) }
          : {}),
        ...(candidate.spacePath !== undefined ? { spacePath: Object.freeze([...candidate.spacePath]) } : {}),
      }),
    );
    Object.freeze(frozenNodes);
    const entries = run([plasterRow()], frozenNodes);
    expect(entries[0]!.status).toBe("ambiguous");
  });

  test("same inputs -> byte-identical entries (two fresh runs)", () => {
    const first = canonicalJsonStringify(run(items, nodes));
    const second = canonicalJsonStringify(run(items, nodes));
    expect(first).toBe(second);
  });

  test("entryIds are stable across runs and unique per sheet+row", () => {
    const rowA = item(4, descriptionInterp({
      originalText: "Plaster",
      conceptCode: "PLASTERING",
      confidence: "high",
      method: "dictionary_exact",
      ref: "SheetA!B4",
    }), unitInterp("m2", "SheetA!C4"));
    const rowB = item(4, descriptionInterp({
      originalText: "Plaster",
      conceptCode: "PLASTERING",
      confidence: "high",
      method: "dictionary_exact",
      ref: "SheetB!B4",
    }), unitInterp("m2", "SheetB!C4"));
    const first = run([rowA, rowB], [node("wall-1", { semanticKind: "wall" })]);
    const second = run([rowA, rowB], [node("wall-1", { semanticKind: "wall" })]);
    expect(first[0]!.entryId).not.toBe(first[1]!.entryId);
    expect(first.map((entry) => entry.entryId)).toEqual(second.map((entry) => entry.entryId));
  });
});

/* ------------------------------------------------------------------ */
/* Manual mapping (pure revisions)                                     */
/* ------------------------------------------------------------------ */

describe("applyManualMapping (append-only revision builder)", () => {
  function mappingOf(version: number, entries: readonly MappingEntry[]): BoqMapping {
    return { mappingId: mappingIdentity(IMPORT_ID), importId: IMPORT_ID, version, entries };
  }
  const entries = run(
    [plasterRow(), item(5, null, unitInterp("m2"))],
    [node("wall-1", { semanticKind: "wall" })],
  );
  const v1 = mappingOf(1, entries);

  test("creates v2: manual entry records targets + note; others byte-identical", () => {
    const v2 = applyManualMapping(
      v1,
      { entryId: entries[1]!.entryId, targets: [{ nodeId: "wall-9", spacePath: ["Ground Floor"] }], note: "row is the ground-floor blockwork" },
      NOW2,
    );
    expect(v2.version).toBe(2);
    expect(v2.importId).toBe(IMPORT_ID);
    expect(v2.mappingId).toBe(mappingIdentity(IMPORT_ID));
    const manual = v2.entries[1]!;
    expect(manual.status).toBe("mapped");
    expect(manual.confidence).toBe("high");
    expect(manual.method).toBe("manual");
    expect(manual.targets[0]!.nodeId).toBe("wall-9");
    expect(manual.targets[0]!.matchNote).toBe("row is the ground-floor blockwork");
    expect(manual.targets[0]!.spacePath).toEqual(["Ground Floor"]);
    expect(manual.provenance.matchedOn).toBe("manual: row is the ground-floor blockwork");
    expect(manual.provenance.recordedAt).toBe(NOW2);
    // The BOQ source identity is preserved VERBATIM on the manual entry.
    expect(manual.boqItem).toEqual(v1.entries[1]!.boqItem);
    // Untouched entries stay byte-identical; the old version stays intact.
    expect(canonicalJsonStringify(v2.entries[0])).toBe(canonicalJsonStringify(v1.entries[0]));
    expect(v1.version).toBe(1);
    expect(v1.entries[1]!.method).toBe("unresolved");
  });

  test("manual without note: matchedOn 'manual mapping'; note-less target keeps its matchNote", () => {
    const v2 = applyManualMapping(
      v1,
      { entryId: entries[1]!.entryId, targets: [{ nodeId: "wall-9", matchNote: "site visit" }] },
      NOW2,
    );
    expect(v2.entries[1]!.provenance.matchedOn).toBe("manual mapping");
    expect(v2.entries[1]!.targets[0]!.matchNote).toBe("site visit");
  });

  test("unknown entryId -> typed entry_not_found; existing mapping unchanged", () => {
    expect(() =>
      applyManualMapping(v1, { entryId: "missing", targets: [{ nodeId: "wall-9" }] }, NOW2),
    ).toThrow(MappingError);
    try {
      applyManualMapping(v1, { entryId: "missing", targets: [{ nodeId: "wall-9" }] }, NOW2);
    } catch (error) {
      expect((error as MappingError).code).toBe("entry_not_found");
    }
    expect(canonicalJsonStringify(v1)).toBe(canonicalJsonStringify(mappingOf(1, entries)));
  });
});

/* ------------------------------------------------------------------ */
/* Input validation (single path) + stats                              */
/* ------------------------------------------------------------------ */

describe("input validation", () => {
  test("parseGraphSnapshot rejects non-objects, missing nodes, bad node shapes", () => {
    expect(() => parseGraphSnapshot(null)).toThrow(MappingError);
    expect(() => parseGraphSnapshot({ nodes: "nope" })).toThrow(MappingError);
    expect(() => parseGraphSnapshot({ nodes: ["nope"] })).toThrow(MappingError);
    expect(() => parseGraphSnapshot({ nodes: [{ nodeId: "" }] })).toThrow(MappingError);
    expect(() => parseGraphSnapshot({ nodes: [{ nodeId: "a", properties: "x" }] })).toThrow(MappingError);
    expect(() =>
      parseGraphSnapshot({ nodes: [{ nodeId: "a", properties: [{ key: "k", value: {} }] }] }),
    ).toThrow(MappingError);
    expect(() => parseGraphSnapshot({ nodes: [{ nodeId: "a", spacePath: [1] }] })).toThrow(MappingError);
    expect(() => parseGraphSnapshot({ nodes: [{ nodeId: "a", kind: 5 }] })).toThrow(MappingError);
    const good = parseGraphSnapshot({ nodes: [{ nodeId: "a", kind: "element" }] });
    expect(good.nodes.length).toBe(1);
  });

  test("mapBoqToReality re-validates garbage snapshots (typed error)", () => {
    expect(() =>
      mapBoqToReality({
        interpretations: [plasterRow()],
        graphSnapshot: { nodes: [{ bad: true }] } as unknown as { nodes: readonly SnapshotNode[] },
        now: NOW,
      }),
    ).toThrow(MappingError);
  });

  test("parseManualMappingInput rejects missing ids, empty targets, bad targets", () => {
    expect(() => parseManualMappingInput({})).toThrow(MappingError);
    expect(() => parseManualMappingInput({ entryId: "e" })).toThrow(MappingError);
    expect(() => parseManualMappingInput({ entryId: "e", targets: [] })).toThrow(MappingError);
    expect(() => parseManualMappingInput({ entryId: "e", targets: [{ nodeId: "" }] })).toThrow(MappingError);
    expect(() => parseManualMappingInput({ entryId: "e", targets: [{ nodeId: "n", spacePath: [1] }] })).toThrow(MappingError);
    expect(() => parseManualMappingInput({ entryId: "e", targets: [{ nodeId: "n" }], note: 5 })).toThrow(MappingError);
    const good = parseManualMappingInput({ entryId: "e", targets: [{ nodeId: "n" }] });
    expect(good.entryId).toBe("e");
  });
});

describe("computeMappingStats", () => {
  test("counts statuses and confidences over a mixed mapping", () => {
    function entryOf(status: MappingStatus, confidence: string): MappingEntry {
      return {
        entryId: `e-${status}-${confidence}`,
        boqItem: { sectionTitle: null, rowNumber: 1, descriptionCellRef: null, unitCellRef: null, originalText: "x" },
        targets: [],
        status,
        confidence: confidence as MappingEntry["confidence"],
        method: "unresolved",
        provenance: { recordedAt: NOW },
      };
    }
    const mapping: BoqMapping = {
      mappingId: mappingIdentity(IMPORT_ID),
      importId: IMPORT_ID,
      version: 1,
      entries: [
        entryOf("mapped", "high"),
        entryOf("mapped", "medium"),
        entryOf("ambiguous", "low"),
        entryOf("unmapped", "uncertain"),
      ],
    };
    const stats = computeMappingStats(mapping);
    expect(stats).toEqual({
      mapped: 2,
      ambiguous: 1,
      unmapped: 1,
      byConfidence: { high: 1, medium: 1, low: 1, uncertain: 1 },
    });
  });
});
