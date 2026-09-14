/**
 * AISE-015 merge tests — the no-overwrite invariant. Protected-key
 * collisions are typed refusals (including the reserved geometry dimension
 * keys); everything else is strictly additive; inputs are never mutated.
 */

import { describe, expect, test } from "bun:test";
import {
  SEMANTIC_MERGE_REFUSAL_CODE,
  SemanticMergeRefusal,
  mergeSemantics,
  type ElementGeometry,
  type SemanticElement,
  type SemanticProperty,
} from "./index";

function makeProperty(key: string, value: string | number | boolean): SemanticProperty {
  return { key, value, epistemicStatus: "INFERRED" };
}

function makeElement(
  elementId: string,
  overrides?: {
    kind?: SemanticElement["kind"];
    geometry?: ElementGeometry;
    properties?: SemanticProperty[];
    sourceArtifactIds?: string[];
    epistemicStatus?: SemanticElement["epistemicStatus"];
  },
): SemanticElement {
  return {
    elementId,
    kind: overrides?.kind ?? "wall",
    geometry: overrides?.geometry ?? {},
    epistemicStatus: overrides?.epistemicStatus ?? "INFERRED",
    provenance: {
      sourceArtifactIds: overrides?.sourceArtifactIds ?? ["art-x"],
      extractorVersion: "aise-semantics/1.0",
    },
    properties: overrides?.properties ?? [],
  };
}

function protectedMap(
  entries: [string, string[]][],
): Map<string, Set<string>> {
  return new Map(entries.map(([id, keys]) => [id, new Set(keys)]));
}

describe("protected-key refusals (no-overwrite invariant)", () => {
  test("extracted property colliding with a protected key → typed refusal", () => {
    const existing = [makeElement("el-1")];
    const extracted = [makeElement("el-1", { properties: [makeProperty("height", 2.7)] })];
    let caught: unknown;
    try {
      mergeSemantics(existing, extracted, protectedMap([["el-1", ["height"]]]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SemanticMergeRefusal);
    const refusal = caught as SemanticMergeRefusal;
    expect(refusal.code).toBe(SEMANTIC_MERGE_REFUSAL_CODE);
    expect(refusal.code).toBe("PROTECTED_PROPERTY_COLLISION");
    expect(refusal.elementId).toBe("el-1");
    expect(refusal.propertyKey).toBe("height");
    expect(refusal.extractedValue).toBe(2.7);
    expect(refusal.message).toContain("el-1");
    expect(refusal.message).toContain("height");
    expect(refusal.message).toContain("NOT merged");
  });

  test("refusal also fires when the existing element already carries the key", () => {
    const existing = [makeElement("el-1", { properties: [makeProperty("height", 2.5)] })];
    const extracted = [makeElement("el-1", { properties: [makeProperty("height", 2.7)] })];
    expect(() =>
      mergeSemantics(existing, extracted, protectedMap([["el-1", ["height"]]])),
    ).toThrow(SemanticMergeRefusal);
  });

  test("reserved dimension key 'geometry.height' protects the height fill-in", () => {
    const existing = [makeElement("el-1")];
    const extracted = [
      makeElement("el-1", { geometry: { height: { value: 2.7, uncertainty: null } } }),
    ];
    let caught: unknown;
    try {
      mergeSemantics(existing, extracted, protectedMap([["el-1", ["geometry.height"]]]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SemanticMergeRefusal);
    expect((caught as SemanticMergeRefusal).propertyKey).toBe("geometry.height");
    expect((caught as SemanticMergeRefusal).extractedValue).toBe(2.7);
  });

  test("reserved dimension key 'geometry.width' protects the width fill-in", () => {
    const existing = [makeElement("el-1")];
    const extracted = [
      makeElement("el-1", { geometry: { width: { value: 4.2, uncertainty: null } } }),
    ];
    expect(() =>
      mergeSemantics(existing, extracted, protectedMap([["el-1", ["geometry.width"]]])),
    ).toThrow(SemanticMergeRefusal);
  });

  test("protected keys of an elementId absent from the extracted set never refuse", () => {
    const existing = [makeElement("el-1")];
    const extracted = [makeElement("el-2", { properties: [makeProperty("height", 2.7)] })];
    const merged = mergeSemantics(existing, extracted, protectedMap([["el-9", ["height"]]]));
    expect(merged).toHaveLength(2);
  });

  test("a protected key the extracted element does not touch never refuses", () => {
    const existing = [makeElement("el-1")];
    const extracted = [makeElement("el-1", { properties: [makeProperty("color", "white") ] })];
    const merged = mergeSemantics(existing, extracted, protectedMap([["el-1", ["height"]]]));
    expect(merged[0]?.properties).toEqual([makeProperty("color", "white")]);
  });
});

describe("additive merge semantics", () => {
  test("new elementIds are appended verbatim (unprotected merge succeeds)", () => {
    const existing = [makeElement("el-1")];
    const appended = makeElement("el-2", { kind: "door" });
    const merged = mergeSemantics(existing, [appended], new Map());
    expect(merged).toHaveLength(2);
    expect(merged[1]).toBe(appended);
    expect(merged[1]?.kind).toBe("door");
  });

  test("extracted values fill gaps: missing height and properties are added", () => {
    const existing = [
      makeElement("el-1", { properties: [makeProperty("note", "kept")] }),
    ];
    const extracted = [
      makeElement("el-1", {
        kind: "door",
        geometry: { height: { value: 2.7, uncertainty: null } },
        properties: [makeProperty("height", 2.7)],
      }),
    ];
    const merged = mergeSemantics(existing, extracted, new Map());
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind).toBe("wall"); // kind is NEVER overwritten
    expect(merged[0]?.geometry.height).toEqual({ value: 2.7, uncertainty: null });
    expect(merged[0]?.properties).toEqual([
      makeProperty("note", "kept"),
      makeProperty("height", 2.7),
    ]);
  });

  test("existing property values are never overwritten, even unprotected", () => {
    const existing = [makeElement("el-1", { properties: [makeProperty("height", 2.5)] })];
    const extracted = [makeElement("el-1", { properties: [makeProperty("height", 2.7)] })];
    const merged = mergeSemantics(existing, extracted, new Map());
    expect(merged[0]?.properties).toEqual([makeProperty("height", 2.5)]);
  });

  test("existing geometry dimensions are never overwritten", () => {
    const existing = [
      makeElement("el-1", { geometry: { height: { value: 2.5, uncertainty: 0.01 } } }),
    ];
    const extracted = [
      makeElement("el-1", { geometry: { height: { value: 2.7, uncertainty: null } } }),
    ];
    const merged = mergeSemantics(existing, extracted, new Map());
    expect(merged[0]?.geometry.height).toEqual({ value: 2.5, uncertainty: 0.01 });
  });

  test("provenance is the ordered, de-duplicated union of source artifact ids", () => {
    const existing = [makeElement("el-1", { sourceArtifactIds: ["a", "b"] })];
    const extracted = [makeElement("el-1", { sourceArtifactIds: ["b", "c"] })];
    const merged = mergeSemantics(existing, extracted, new Map());
    expect(merged[0]?.provenance.sourceArtifactIds).toEqual(["a", "b", "c"]);
    expect(merged[0]?.provenance.extractorVersion).toBe("aise-semantics/1.0");
  });

  test("epistemic status of the surviving element is kept", () => {
    const existing = [
      makeElement("el-1", { epistemicStatus: "PROPOSED", properties: [makeProperty("p", 1)] }),
    ];
    const extracted = [makeElement("el-1", { properties: [makeProperty("q", 2)] })];
    const merged = mergeSemantics(existing, extracted, new Map());
    expect(merged[0]?.epistemicStatus).toBe("PROPOSED");
    expect(merged[0]?.properties).toHaveLength(2);
  });
});

describe("purity", () => {
  test("merge never mutates the existing or extracted arrays/elements", () => {
    const existing = [
      makeElement("el-1", { properties: [makeProperty("height", 2.5)] }),
      makeElement("el-keep"),
    ];
    const extracted = [
      makeElement("el-1", { geometry: { height: { value: 2.7, uncertainty: null } } }),
      makeElement("el-2"),
    ];
    const existingSnapshot = JSON.stringify(existing);
    const extractedSnapshot = JSON.stringify(extracted);
    const merged = mergeSemantics(existing, extracted, new Map());
    expect(JSON.stringify(existing)).toBe(existingSnapshot);
    expect(JSON.stringify(extracted)).toBe(extractedSnapshot);
    expect(merged).toHaveLength(3);
    // Untouched existing elements are reused by reference (immutable reuse).
    expect(merged[1]).toBe(existing[1]);
    // The result is a fresh array, not the caller's.
    expect(merged === existing).toBe(false);
  });

  test("a refusal leaves both inputs untouched", () => {
    const existing = [makeElement("el-1")];
    const extracted = [makeElement("el-1", { properties: [makeProperty("height", 2.7)] })];
    const existingSnapshot = JSON.stringify(existing);
    const extractedSnapshot = JSON.stringify(extracted);
    expect(() =>
      mergeSemantics(existing, extracted, protectedMap([["el-1", ["height"]]])),
    ).toThrow(SemanticMergeRefusal);
    expect(JSON.stringify(existing)).toBe(existingSnapshot);
    expect(JSON.stringify(extracted)).toBe(extractedSnapshot);
  });
});
