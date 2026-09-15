/**
 * AISE-032 — Reality-vs-design comparison MODEL tests.
 *
 * Depth mandated by the work order: the status-vocabulary discrimination
 * matrix (UNKNOWN/NOT_OBSERVED/OCCLUDED never collapse, never absence),
 * tolerance-aware verdicts (within/exactly-on/strictly-beyond), the
 * evidence-linking discipline (unsubstantiated discrepancy = typed
 * refusal, never an emitted row), honest coverage (design-only,
 * reality-only, partial-overlap/geometry omissions), boundary-parser
 * rejection codes, deterministic ordering and digests.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  COMPARISON_ERROR_CODES,
  COMPARISON_OMISSION_CODES,
  COMPARISON_STATUSES,
  COVERAGE_OBSERVATION_STATUSES,
  ComparisonError,
  compareRealityToDesign,
  comparisonContentDigest,
  comparisonInputDigest,
  comparisonStatsOf,
  parseComparisonRecord,
  parseRunComparisonInput,
  validateComparisonId,
  validateProjectRefId,
  validateVersionRefId,
  type ComparisonEntry,
} from "./model";
import {
  CANONICAL_COVERAGE,
  CANONICAL_TOLERANCES,
  COMPARISON_ID,
  EV_DOOR_EAST,
  EV_DUCT_UNKNOWN,
  EV_PIPE,
  EV_SKYLIGHT_OCCLUDED,
  EV_WALL_NORTH_FIRE,
  EV_WALL_NORTH_LENGTH,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  PROJECT_ID,
  VERSION_ID,
  buildCanonicalInput,
  buildDesignReference,
  buildRealityVersion,
  buildRealityVersionWithoutDoorEvidence,
  evidenceIdOf,
} from "./testkit";

function entriesByStatus(
  entries: readonly ComparisonEntry[],
): Map<string, ComparisonEntry[]> {
  const byStatus = new Map<string, ComparisonEntry[]>();
  for (const entry of entries) {
    const list = byStatus.get(entry.status) ?? [];
    list.push(entry);
    byStatus.set(entry.status, list);
  }
  return byStatus;
}

function matrix(
  coverage: readonly { targetNodeId: string; observationStatus: string; evidenceIds: string[] }[] = CANONICAL_COVERAGE as unknown as readonly { targetNodeId: string; observationStatus: string; evidenceIds: string[] }[],
  realityVersion = buildRealityVersion(),
  tolerances = CANONICAL_TOLERANCES,
): readonly ComparisonEntry[] {
  return compareRealityToDesign({
    comparisonId: COMPARISON_ID,
    realityVersion: realityVersion as never,
    designReference: buildDesignReference(),
    tolerances,
    coverage: coverage as never,
  });
}

const entry = (entries: readonly ComparisonEntry[], designItemId: string, propertyKey: string | null): ComparisonEntry => {
  const found = entries.find(
    (row) => row.designItemId === designItemId && row.propertyKey === propertyKey,
  );
  if (found === undefined) {
    throw new Error(`entry not found: ${designItemId}/${String(propertyKey)}`);
  }
  return found;
};

describe("comparison vocabularies", () => {
  test("the status vocabulary keeps the uncertainty family FIRST-CLASS and disjoint from verdicts", () => {
    expect(COMPARISON_STATUSES).toContain("unknown");
    expect(COMPARISON_STATUSES).toContain("not_observed_in_reality");
    expect(COMPARISON_STATUSES).toContain("occluded_in_reality");
    expect(COMPARISON_STATUSES).toContain("unplanned_in_reality");
    // The uncertainty family is never collapsed into the verdict family:
    // no status means both, and each is a DISTINCT vocabulary member.
    expect(new Set(COMPARISON_STATUSES).size).toBe(COMPARISON_STATUSES.length);
    expect(COMPARISON_STATUSES).not.toContain("absent");
    expect(COMPARISON_STATUSES).not.toContain("missing");
  });

  test("the omission registry keeps every failure mode DISTINCT", () => {
    expect(COMPARISON_OMISSION_CODES.length).toBe(9);
    expect(new Set(COMPARISON_OMISSION_CODES).size).toBe(COMPARISON_OMISSION_CODES.length);
    expect(COMPARISON_OMISSION_CODES).toContain("numeric_comparison_without_tolerance");
    expect(COMPARISON_OMISSION_CODES).toContain("incompatible_units");
    expect(COMPARISON_OMISSION_CODES).toContain("geometry_not_comparable");
  });

  test("the coverage vocabulary is exactly UNKNOWN | NOT_OBSERVED | OCCLUDED", () => {
    expect([...COVERAGE_OBSERVATION_STATUSES]).toEqual(["UNKNOWN", "NOT_OBSERVED", "OCCLUDED"]);
  });

  test("every typed error code is distinct and the registry is frozen", () => {
    expect(new Set(COMPARISON_ERROR_CODES).size).toBe(COMPARISON_ERROR_CODES.length);
    expect(Object.isFrozen(COMPARISON_ERROR_CODES)).toBe(true);
    expect(Object.isFrozen(COMPARISON_STATUSES)).toBe(true);
    expect(Object.isFrozen(COMPARISON_OMISSION_CODES)).toBe(true);
  });
});

describe("comparison matrix: the discrimination matrix (statuses never collapse)", () => {
  test("the canonical fixture yields EXACTLY the expected status multiset", () => {
    const entries = matrix();
    const byStatus = entriesByStatus(entries);
    expect(byStatus.get("matches")).toHaveLength(2); // fireRating, thickness (exact)
    expect(byStatus.get("within_tolerance")).toHaveLength(2); // wall-north length, wall-south length
    expect(byStatus.get("deviation_beyond_tolerance")).toHaveLength(1); // door width
    expect(byStatus.get("differs") ?? []).toHaveLength(0);
    expect(byStatus.get("unknown")).toHaveLength(4); // canopy, duct, lobby, geometry
    expect(byStatus.get("not_observed_in_reality")).toHaveLength(1); // wall-west (tombstoned)
    expect(byStatus.get("occluded_in_reality")).toHaveLength(1); // skylight
    expect(byStatus.get("unplanned_in_reality")).toHaveLength(1); // pipe-service
    expect(entries).toHaveLength(12);
  });

  test("UNKNOWN rows carry their DISTINCT typed omission codes (never a bare unknown)", () => {
    const entries = matrix();
    expect(entry(entries, "canopy-dgn", null).omissionCode).toBe("proposed_reality_node");
    expect(entry(entries, "duct-dgn", null).omissionCode).toBe("coverage_unknown");
    expect(entry(entries, "lobby-dgn", null).omissionCode).toBe("unmapped_design_item");
    expect(entry(entries, "wall-north-dgn", null).omissionCode).toBe("geometry_not_comparable");
  });

  test("OCCLUDED is a positive, evidence-linked status — never absence, never differ", () => {
    const entries = matrix();
    const skylight = entry(entries, "skylight-dgn", null);
    expect(skylight.status).toBe("occluded_in_reality");
    expect(skylight.omissionCode).toBe("occluded_target");
    expect(skylight.coverageEvidenceIds).toEqual([EV_SKYLIGHT_OCCLUDED]);
    // NOT absence: the row exists and names its design substantiation.
    expect(skylight.designSourceRef?.sourceRecordId).toBe("IFC-MODEL-0042");
    expect(skylight.designValue).toBeUndefined();
  });

  test("NOT_OBSERVED is a positive claim about captured reality — distinct from OCCLUDED and from unknown", () => {
    const entries = matrix();
    const west = entry(entries, "wall-west-dgn", null);
    expect(west.status).toBe("not_observed_in_reality");
    expect(west.omissionCode).toBeUndefined();
    expect(west.note).toContain("tombstoned");
    expect(west.note).toContain("demolished");
  });

  test("coverage UNKNOWN (capture cannot confirm) yields unknown — verdicts omitted, never guessed", () => {
    const entries = matrix();
    const duct = entry(entries, "duct-dgn", null);
    expect(duct.status).toBe("unknown");
    expect(duct.omissionCode).toBe("coverage_unknown");
    expect(duct.coverageEvidenceIds).toEqual([EV_DUCT_UNKNOWN]);
  });

  test("a PROPOSED reality node is never compared to verdicts (proposals are not observed/modelled reality)", () => {
    const entries = matrix();
    const canopy = entry(entries, "canopy-dgn", null);
    expect(canopy.status).toBe("unknown");
    expect(canopy.omissionCode).toBe("proposed_reality_node");
    expect(canopy.realityValue?.epistemicStatus).toBe("PROPOSED");
  });

  test("an unmapped design item is unknown + unmapped — no fuzzy matching ever happens", () => {
    const entries = matrix();
    const lobby = entry(entries, "lobby-dgn", null);
    expect(lobby.status).toBe("unknown");
    expect(lobby.omissionCode).toBe("unmapped_design_item");
    expect(lobby.targetNodeId).toBeNull();
    // The lobby's seats property never yields a row: without a mapping
    // there is no comparison at all (not even not_observed).
    expect(entries.find((row) => row.propertyKey === "seats")).toBeUndefined();
  });

  test("unplanned_in_reality rows carry the reality node context and node-level evidence, no design source", () => {
    const entries = matrix();
    const pipe = entries.find((row) => row.status === "unplanned_in_reality");
    expect(pipe).toBeDefined();
    expect(pipe?.designItemId).toBeNull();
    expect(pipe?.designSourceRef).toBeNull();
    expect(pipe?.targetNodeId).toBe("pipe-service");
    expect(pipe?.realityNode).toEqual({ kind: "element", epistemicStatus: "OBSERVED" });
    expect(pipe?.realityEvidenceIds).toEqual([EV_PIPE]);
  });
});

describe("comparison matrix: tolerance-aware verdicts (uncertainty participates)", () => {
  test("within tolerance: |deviation| <= tolerance is within_tolerance, never differ", () => {
    const entries = matrix();
    const length = entry(entries, "wall-north-dgn", "length");
    expect(length.status).toBe("within_tolerance");
    expect(length.deviation).toBeCloseTo(0.05, 12);
    expect(length.tolerance).toBe(0.1);
    expect(length.realityValue?.value).toBe(5.2);
    expect(length.designValue?.value).toBe(5.15);
    expect(length.realityValue?.epistemicStatus).toBe("OBSERVED");
  });

  test("exactly ON the tolerance boundary is within (STRICTLY greater is beyond — the AISE-033 convention)", () => {
    const entries = matrix([{ targetNodeId: "skylight", observationStatus: "OCCLUDED", evidenceIds: [EV_SKYLIGHT_OCCLUDED] }]);
    // door width: reality 1.0 vs design 1.2 → deviation -0.2; boundary
    // tolerance 0.2 must be WITHIN (equal), 0.199999 must be BEYOND.
    const onBoundary = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: buildDesignReference() as never,
      tolerances: { byKey: { width: 0.2 }, default: null },
      coverage: [] as never,
    });
    expect(entry(onBoundary, "door-east-dgn", "width").status).toBe("within_tolerance");

    const beyond = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: buildDesignReference() as never,
      tolerances: { byKey: { width: 0.199999 }, default: null },
      coverage: [] as never,
    });
    expect(entry(beyond, "door-east-dgn", "width").status).toBe("deviation_beyond_tolerance");
    expect(entries.length).toBeGreaterThan(0);
  });

  test("beyond tolerance: deviation_beyond_tolerance carries deviation + tolerance + substantiating evidence", () => {
    const entries = matrix();
    const width = entry(entries, "door-east-dgn", "width");
    expect(width.status).toBe("deviation_beyond_tolerance");
    expect(width.deviation).toBeCloseTo(-0.2, 12);
    expect(width.tolerance).toBe(0.1);
    expect(width.realityEvidenceIds).toEqual([EV_DOOR_EAST]);
  });

  test("exact numeric equality is matches even without any tolerance (deviation 0)", () => {
    const entries = matrix();
    const thickness = entry(entries, "wall-north-dgn", "thickness");
    expect(thickness.status).toBe("matches");
    expect(thickness.deviation).toBe(0);
    expect(thickness.tolerance).toBeUndefined();
  });

  test("a NONZERO deviation with NO applicable tolerance is unknown — never match/differ", () => {
    const entries = matrix([{ targetNodeId: "skylight", observationStatus: "OCCLUDED", evidenceIds: [EV_SKYLIGHT_OCCLUDED] }]);
    const noTolerance = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: buildDesignReference() as never,
      tolerances: { byKey: {}, default: null },
      coverage: [] as never,
    });
    const length = entry(noTolerance, "wall-north-dgn", "length");
    expect(length.status).toBe("unknown");
    expect(length.omissionCode).toBe("numeric_comparison_without_tolerance");
    expect(length.deviation).toBeCloseTo(0.05, 12);
    expect(length.tolerance).toBeUndefined();
    // The default tolerance applies to keys without a byKey entry:
    const withDefault = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: buildDesignReference() as never,
      tolerances: { byKey: {}, default: 0.1 },
      coverage: [] as never,
    });
    expect(entry(withDefault, "wall-north-dgn", "length").status).toBe("within_tolerance");
    expect(entry(withDefault, "door-east-dgn", "width").status).toBe("deviation_beyond_tolerance");
    expect(entries.length).toBeGreaterThan(0);
  });

  test("incompatible units are unknown + incompatible_units — no conversion authority here", () => {
    const design = buildDesignReference() as unknown as {
      items: { designItemId: string; properties: { key: string; value: number; unit: string }[] }[];
    };
    const variant = {
      ...design,
      items: design.items.map((item) =>
        item.designItemId === "wall-south-dgn"
          ? { ...item, properties: [{ key: "length", value: 4750, unit: "mm" }] }
          : item,
      ),
    };
    const entries = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: variant as never,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [] as never,
    });
    const length = entry(entries, "wall-south-dgn", "length");
    expect(length.status).toBe("unknown");
    expect(length.omissionCode).toBe("incompatible_units");
    expect(length.deviation).toBeUndefined();
  });

  test("incomparable value types are unknown + incomparable_value_types — never coerced", () => {
    const design = buildDesignReference() as unknown as {
      items: { designItemId: string; properties: { key: string; value: unknown }[] }[];
    };
    const variant = {
      ...design,
      items: design.items.map((item) =>
        item.designItemId === "wall-north-dgn"
          ? { ...item, properties: [{ key: "fireRating", value: 90 }] }
          : item,
      ),
    };
    const entries = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: variant as never,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [] as never,
    });
    const fire = entry(entries, "wall-north-dgn", "fireRating");
    expect(fire.status).toBe("unknown");
    expect(fire.omissionCode).toBe("incomparable_value_types");
  });

  test("a differing string value is differs, substantiated by the reality-side evidence ids", () => {
    const design = buildDesignReference() as unknown as {
      items: { designItemId: string; properties: { key: string; value: unknown }[] }[];
    };
    const variant = {
      ...design,
      items: design.items.map((item) =>
        item.designItemId === "wall-north-dgn"
          ? { ...item, properties: [{ key: "fireRating", value: "REI60" }] }
          : item,
      ),
    };
    const entries = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: variant as never,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [] as never,
    });
    const fire = entry(entries, "wall-north-dgn", "fireRating");
    expect(fire.status).toBe("differs");
    expect(fire.realityEvidenceIds).toEqual([EV_WALL_NORTH_FIRE]);
    expect(fire.designSourceRef?.revision).toBe("C3");
  });

  test("geometry comparison is an honest typed omission: geometry_not_comparable, both refs verbatim", () => {
    const entries = matrix();
    const geometry = entry(entries, "wall-north-dgn", null);
    expect(geometry.aspect).toBe("geometry");
    expect(geometry.status).toBe("unknown");
    expect(geometry.omissionCode).toBe("geometry_not_comparable");
    expect(geometry.geometryRefs?.design).toEqual({ kind: "plane", ref: "geo-wall-north-design" });
    expect(geometry.geometryRefs?.reality).toEqual({ kind: "plane", ref: "geo-wall-north-reality" });
  });

  test("design geometry with NO reality geometry is not_observed_in_reality", () => {
    const design = buildDesignReference() as unknown as {
      items: { designItemId: string; targetNodeId?: string; properties: unknown[] }[];
    };
    const variant = {
      ...design,
      items: design.items.map((item) =>
        item.designItemId === "wall-south-dgn"
          ? { ...item, geometry: { kind: "plane", ref: "geo-wall-south-design" } }
          : item,
      ),
    };
    const entries = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: variant as never,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [] as never,
    });
    const geometry = entries.find(
      (row) => row.designItemId === "wall-south-dgn" && row.aspect === "geometry",
    );
    expect(geometry?.status).toBe("not_observed_in_reality");
    expect(geometry?.omissionCode).toBeUndefined();
  });
});

describe("comparison matrix: evidence-linking discipline (fail-closed)", () => {
  test("an unsubstantiated numeric discrepancy is a typed refusal — never an emitted row", () => {
    expect(() => matrix([], buildRealityVersionWithoutDoorEvidence())).toThrow(ComparisonError);
    try {
      matrix([], buildRealityVersionWithoutDoorEvidence());
      expect.unreachable();
    } catch (error) {
      const typed = error as ComparisonError;
      expect(typed.code).toBe("discrepancy_without_evidence");
      expect(typed.detail).toContain("width");
      expect(typed.detail).toContain("door-east");
    }
  });

  test("an unsubstantiated non-numeric discrepancy is the same typed refusal", () => {
    const reality = buildRealityVersion() as unknown as {
      nodes: {
        nodeId: string;
        properties: { key: string; value: unknown; provenance: unknown[] }[];
      }[];
    };
    const stripped = {
      ...reality,
      nodes: reality.nodes.map((node) =>
        node.nodeId === "wall-north"
          ? {
              ...node,
              properties: node.properties.map((property) =>
                property.key === "fireRating"
                  ? { ...property, provenance: [{ role: "DERIVED_FROM", derivationNote: "n", recordedAt: FIXED_NOW }] }
                  : property,
              ),
            }
          : node,
      ),
    };
    const design = buildDesignReference() as unknown as {
      items: { designItemId: string; properties: { key: string; value: unknown }[] }[];
    };
    const variant = {
      ...design,
      items: design.items.map((item) =>
        item.designItemId === "wall-north-dgn"
          ? { ...item, properties: [{ key: "fireRating", value: "REI60" }] }
          : item,
      ),
    };
    try {
      compareRealityToDesign({
        comparisonId: COMPARISON_ID,
        realityVersion: stripped as never,
        designReference: variant as never,
        tolerances: CANONICAL_TOLERANCES,
        coverage: [] as never,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as ComparisonError).code).toBe("discrepancy_without_evidence");
    }
  });

  test("property-level evidence takes precedence; node-level evidence is the fallback (deduped, ordered)", () => {
    const extraNodeEvidence = evidenceIdOf("node-fallback");
    const reality = buildRealityVersion() as unknown as {
      nodes: { nodeId: string; provenance: unknown[] }[];
    };
    const withNodeEvidence = {
      ...reality,
      nodes: reality.nodes.map((node) =>
        node.nodeId === "door-east"
          ? {
              ...node,
              provenance: [
                { role: "SUPPORTS", evidenceId: extraNodeEvidence, recordedAt: FIXED_NOW },
              ],
            }
          : node,
      ),
    };
    const entries = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: withNodeEvidence as never,
      designReference: buildDesignReference() as never,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [] as never,
    });
    const width = entry(entries, "door-east-dgn", "width");
    expect(width.realityEvidenceIds).toEqual([EV_DOOR_EAST, extraNodeEvidence]);
  });

  test("a coverage annotation contradicting the authoritative version is a typed refusal", () => {
    const contradictory = [
      { targetNodeId: "wall-north", observationStatus: "NOT_OBSERVED", evidenceIds: [EV_WALL_NORTH_LENGTH] },
    ];
    try {
      matrix(contradictory);
      expect.unreachable();
    } catch (error) {
      const typed = error as ComparisonError;
      expect(typed.code).toBe("coverage_contradicts_reality");
      expect(typed.detail).toContain("wall-north");
      expect(typed.detail).toContain("NOT_OBSERVED");
    }
    const occludedContradiction = [
      { targetNodeId: "door-east", observationStatus: "OCCLUDED", evidenceIds: [EV_DOOR_EAST] },
    ];
    try {
      matrix(occludedContradiction);
      expect.unreachable();
    } catch (error) {
      expect((error as ComparisonError).code).toBe("coverage_contradicts_reality");
    }
  });

  test("an evidence-backed NOT_OBSERVED annotation on an absent target SUBSTANTIATES the not-observed row", () => {
    const entries = matrix([
      { targetNodeId: "skylight", observationStatus: "OCCLUDED", evidenceIds: [EV_SKYLIGHT_OCCLUDED] },
      { targetNodeId: "duct-shaft", observationStatus: "UNKNOWN", evidenceIds: [EV_DUCT_UNKNOWN] },
      { targetNodeId: "wall-west", observationStatus: "NOT_OBSERVED", evidenceIds: [EV_WALL_NORTH_LENGTH] },
    ]);
    const west = entry(entries, "wall-west-dgn", null);
    expect(west.status).toBe("not_observed_in_reality");
    expect(west.coverageEvidenceIds).toEqual([EV_WALL_NORTH_LENGTH]);
  });
});

describe("comparison matrix: determinism and canonical ordering", () => {
  test("byte-identical recomputation: the same inputs yield identical canonical entries", () => {
    const first = matrix();
    const second = matrix();
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  test("input array order never leaks: shuffled design items yield identical entries", () => {
    const design = buildDesignReference() as unknown as { items: unknown[] };
    const shuffled = { ...design, items: [...design.items].reverse() };
    const first = matrix();
    const second = compareRealityToDesign({
      comparisonId: COMPARISON_ID,
      realityVersion: buildRealityVersion() as never,
      designReference: shuffled as never,
      tolerances: CANONICAL_TOLERANCES,
      coverage: CANONICAL_COVERAGE as never,
    });
    expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
  });

  test("canonical entry order: design items sorted by id, object → geometry → properties by key, unplanned last", () => {
    const entries = matrix();
    const keys = entries.map((row) => `${row.designItemId ?? "~unplanned"}:${row.aspect}:${row.propertyKey ?? ""}`);
    expect(keys).toEqual([
      "canopy-dgn:object:",
      "door-east-dgn:property:width",
      "duct-dgn:object:",
      "lobby-dgn:object:",
      "skylight-dgn:object:",
      "wall-north-dgn:geometry:",
      "wall-north-dgn:property:fireRating",
      "wall-north-dgn:property:length",
      "wall-north-dgn:property:thickness",
      "wall-south-dgn:property:length",
      "wall-west-dgn:object:",
      "~unplanned:object:",
    ]);
  });

  test("stats are ALWAYS consistent with the entries (recomputed independently)", () => {
    const entries = matrix();
    const stats = comparisonStatsOf(entries);
    expect(stats.totalEntries).toBe(12);
    expect(stats.matches).toBe(2);
    expect(stats.withinTolerance).toBe(2);
    expect(stats.deviationBeyondTolerance).toBe(1);
    expect(stats.differs).toBe(0);
    expect(stats.unknown).toBe(4);
    expect(stats.notObservedInReality).toBe(1);
    expect(stats.occludedInReality).toBe(1);
    expect(stats.unplannedInReality).toBe(1);
    expect(stats.discrepancies).toBe(1);
  });

  test("entry ids are content-derived and stable per (comparison, item, aspect, key, node)", () => {
    const entries = matrix();
    const ids = entries.map((row) => row.entryId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^ent-[0-9a-f]{16}$/.test(id))).toBe(true);
    // A different comparisonId changes every entry id.
    const other = compareRealityToDesign({
      comparisonId: "comparison-other",
      realityVersion: buildRealityVersion() as never,
      designReference: buildDesignReference() as never,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [] as never,
    });
    expect(other[0]?.entryId).not.toBe(entries[0]?.entryId);
  });

  test("neither source is altered: the frozen reality version survives the matrix build", () => {
    const version = buildRealityVersion();
    expect(Object.isFrozen(version)).toBe(true);
    expect(() => matrix()).not.toThrow();
    expect(canonicalJsonStringify(version)).toBe(canonicalJsonStringify(buildRealityVersion()));
  });
});

describe("boundary input parser: typed rejections", () => {
  const validBody = (): Record<string, unknown> => ({
    comparisonId: COMPARISON_ID,
    realityRef: { projectId: PROJECT_ID, versionId: VERSION_ID },
    designReference: {
      sourceOfRecord: {
        systemClass: "bim-ifc",
        systemInstanceId: "arch-cad-prod-01",
        sourceRecordId: "IFC-MODEL-0042",
        revision: "C3",
        retrievedAt: "2026-03-04T16:00:00.000Z",
      },
      items: [
        {
          designItemId: "wall-north-dgn",
          targetNodeId: "wall-north",
          properties: [{ key: "length", value: 5.15, unit: "m" }],
        },
      ],
    },
  });

  const rejectionOf = (body: unknown): string => {
    try {
      parseRunComparisonInput(body);
      return "accepted";
    } catch (error) {
      return (error as ComparisonError).code;
    }
  };

  test("the canonical input parses to the normalized form (defaults applied)", () => {
    const input = parseRunComparisonInput(validBody());
    expect(input.comparisonId).toBe(COMPARISON_ID);
    expect(input.realityRef).toEqual({ projectId: PROJECT_ID, versionId: VERSION_ID });
    expect(input.tolerances).toEqual({ byKey: {}, default: null });
    expect(input.coverage).toEqual([]);
    expect(input.designReference.items[0]?.properties[0]?.unit).toBe("m");
  });

  test("shape rejections are DISTINCT typed codes", () => {
    const base = validBody();
    const design = base["designReference"] as Record<string, unknown>;
    const sourceOfRecord = design["sourceOfRecord"] as Record<string, unknown>;
    const items = design["items"] as unknown[];
    expect(rejectionOf(null)).toBe("invalid_comparison");
    expect(rejectionOf({ ...base, comparisonId: "" })).toBe("invalid_comparison_id");
    expect(rejectionOf({ ...base, comparisonId: "x".repeat(257) })).toBe(
      "invalid_comparison_id",
    );
    expect(rejectionOf({ ...base, realityRef: { projectId: "", versionId: "v001" } })).toBe(
      "invalid_project_id",
    );
    expect(rejectionOf({ ...base, realityRef: { projectId: "p", versionId: "1" } })).toBe(
      "invalid_version_id",
    );
    expect(
      rejectionOf({
        ...base,
        designReference: { sourceOfRecord, items: [] },
      }),
    ).toBe("comparison_without_items");
    expect(
      rejectionOf({
        ...base,
        designReference: {
          sourceOfRecord: { ...sourceOfRecord, systemClass: "" },
          items,
        },
      }),
    ).toBe("invalid_source_of_record");
    expect(
      rejectionOf({
        ...base,
        designReference: {
          sourceOfRecord: { ...sourceOfRecord, retrievedAt: "not-a-timestamp" },
          items,
        },
      }),
    ).toBe("invalid_timestamp");
  });

  test("design item/property rejections: duplicates fail closed; numerics REQUIRE units", () => {
    const base = validBody();
    const design = base["designReference"] as Record<string, unknown>;
    expect(
      rejectionOf({
        ...base,
        designReference: {
          ...design,
          items: [
            { designItemId: "a", properties: [] },
            { designItemId: "a", properties: [] },
          ],
        },
      }),
    ).toBe("duplicate_design_item");
    expect(
      rejectionOf({
        ...base,
        designReference: {
          ...design,
          items: [{ designItemId: "a", properties: [{ key: "k", value: 1 }] }],
        },
      }),
    ).toBe("invalid_design_property");
    expect(
      rejectionOf({
        ...base,
        designReference: {
          ...design,
          items: [{ designItemId: "a", properties: [{ key: "k", value: 1, unit: "m" }, { key: "k", value: 2, unit: "m" }] }],
        },
      }),
    ).toBe("invalid_design_item");
    expect(
      rejectionOf({
        ...base,
        designReference: {
          ...design,
          items: [{ designItemId: "a", properties: [{ key: "k", value: "s", unit: "m" }] }],
        },
      }),
    ).toBe("invalid_design_property");
    expect(
      rejectionOf({
        ...base,
        designReference: {
          ...design,
          items: [{ designItemId: "a", properties: [{ key: "k", value: Number.NaN }] }],
        },
      }),
    ).toBe("invalid_design_property");
  });

  test("tolerance rejections: negative or non-finite tolerances are invalid_tolerance", () => {
    expect(rejectionOf({ ...validBody(), tolerances: { default: -0.1 } })).toBe("invalid_tolerance");
    expect(rejectionOf({ ...validBody(), tolerances: { byKey: { length: -1 } } })).toBe(
      "invalid_tolerance",
    );
    expect(rejectionOf({ ...validBody(), tolerances: { default: Number.POSITIVE_INFINITY } })).toBe(
      "invalid_tolerance",
    );
    expect(rejectionOf({ ...validBody(), tolerances: "none" })).toBe("invalid_tolerance");
  });

  test("coverage rejections: unknown status, missing evidence, malformed evidence ids, duplicates", () => {
    const base = validBody();
    const withCoverage = (coverage: unknown): unknown => ({ ...base, coverage });
    expect(rejectionOf(withCoverage([{ targetNodeId: "t", observationStatus: "MAYBE", evidenceIds: [KNOWN_EVIDENCE[0]!] }]))).toBe(
      "invalid_coverage",
    );
    expect(rejectionOf(withCoverage([{ targetNodeId: "t", observationStatus: "OCCLUDED", evidenceIds: [] }]))).toBe(
      "coverage_without_evidence",
    );
    expect(rejectionOf(withCoverage([{ targetNodeId: "t", observationStatus: "OCCLUDED", evidenceIds: ["not-hex"] }]))).toBe(
      "invalid_evidence_ref",
    );
    expect(
      rejectionOf(
        withCoverage([
          { targetNodeId: "t", observationStatus: "OCCLUDED", evidenceIds: [KNOWN_EVIDENCE[0]!] },
          { targetNodeId: "t", observationStatus: "UNKNOWN", evidenceIds: [KNOWN_EVIDENCE[1]!] },
        ]),
      ),
    ).toBe("invalid_coverage");
  });

  test("id validators: shapes with DISTINCT codes", () => {
    expect(() => validateComparisonId("")).toThrow();
    try {
      validateComparisonId("x".repeat(257));
      expect.unreachable();
    } catch (error) {
      expect((error as ComparisonError).code).toBe("invalid_comparison_id");
    }
    try {
      validateProjectRefId("");
      expect.unreachable();
    } catch (error) {
      expect((error as ComparisonError).code).toBe("invalid_project_id");
    }
    try {
      validateVersionRefId("version-1");
      expect.unreachable();
    } catch (error) {
      expect((error as ComparisonError).code).toBe("invalid_version_id");
    }
    expect(() => validateVersionRefId("v001")).not.toThrow();
    expect(() => validateVersionRefId("v000123")).not.toThrow();
  });
});

describe("digests", () => {
  test("inputDigest pins BOTH sources: changing either source changes the digest", () => {
    const version = buildRealityVersion();
    const design = buildDesignReference();
    const base = comparisonInputDigest({
      realityVersion: version,
      designReference: design,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [],
    });
    // Same inputs → same digest (pure).
    expect(
      comparisonInputDigest({
        realityVersion: buildRealityVersion(),
        designReference: buildDesignReference(),
        tolerances: CANONICAL_TOLERANCES,
        coverage: [],
      }),
    ).toBe(base);
    // Reality side changes → digest changes.
    const changedReality = comparisonInputDigest({
      realityVersion: buildRealityVersionWithoutDoorEvidence(),
      designReference: design,
      tolerances: CANONICAL_TOLERANCES,
      coverage: [],
    });
    expect(changedReality).not.toBe(base);
    // Design side changes → digest changes.
    const changedDesign = comparisonInputDigest({
      realityVersion: version,
      designReference: {
        ...design,
        sourceOfRecord: { ...design.sourceOfRecord, revision: "C4" },
      },
      tolerances: CANONICAL_TOLERANCES,
      coverage: [],
    });
    expect(changedDesign).not.toBe(base);
    // Parameters change → digest changes.
    expect(
      comparisonInputDigest({
        realityVersion: version,
        designReference: design,
        tolerances: { byKey: {}, default: 0.5 },
        coverage: [],
      }),
    ).not.toBe(base);
  });

  test("inputDigest is a 64-hex content address", () => {
    const digest = comparisonInputDigest({
      realityVersion: buildRealityVersion(),
      designReference: buildDesignReference(),
      tolerances: CANONICAL_TOLERANCES,
      coverage: [],
    });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("stored-record parser", () => {
  test("a canonical record round-trips byte-identically through the parser", async () => {
    const { ComparisonService } = await import("./service");
    const { InMemoryComparisonStore } = await import("./store");
    const { canonicalResolvers, fixedClock } = await import("./testkit");
    const store = new InMemoryComparisonStore();
    const service = new ComparisonService({
      store,
      clock: fixedClock,
      ...canonicalResolvers(),
    });
    const record = await service.runComparison(buildCanonicalInput());
    const parsed = parseComparisonRecord(JSON.parse(canonicalJsonStringify(record)));
    expect(canonicalJsonStringify(parsed)).toBe(canonicalJsonStringify(record));
  });

  test("garbage on disk is a typed invalid_comparison_record rejection (never a silent misparse)", () => {
    const cases: readonly [unknown, string][] = [
      [null, "comparison record is not a JSON object"],
      [{}, "comparisonId"],
      [
        { comparisonId: COMPARISON_ID, realityRef: { projectId: PROJECT_ID, versionId: "bad" } },
        "realityRef.versionId",
      ],
      [
        {
          comparisonId: COMPARISON_ID,
          realityRef: { projectId: PROJECT_ID, versionId: VERSION_ID },
          designReference: {
            sourceOfRecord: {
              systemClass: "bim-ifc",
              systemInstanceId: "i",
              sourceRecordId: "r",
              revision: "C",
              retrievedAt: FIXED_NOW,
            },
            items: [],
          },
        },
        "comparison_without_items",
      ],
    ];
    for (const [value, expectedDetail] of cases) {
      try {
        parseComparisonRecord(value);
        expect.unreachable();
      } catch (error) {
        const typed = error as ComparisonError;
        expect(typed.code).toBe("invalid_comparison_record");
        expect(typed.detail).toContain(expectedDetail);
      }
    }
  });

  test("an out-of-vocabulary persisted status is corruption", () => {
    const record = {
      comparisonId: COMPARISON_ID,
      realityRef: { projectId: PROJECT_ID, versionId: VERSION_ID },
      designReference: {
        sourceOfRecord: {
          systemClass: "bim-ifc",
          systemInstanceId: "i",
          sourceRecordId: "r",
          revision: "C",
          retrievedAt: FIXED_NOW,
        },
        items: [
          {
            designItemId: "a",
            targetNodeId: "wall-north",
            properties: [{ key: "length", value: 1, unit: "m" }],
          },
        ],
      },
      tolerances: { byKey: {}, default: null },
      coverage: [],
      entries: [
        {
          entryId: "ent-0123456789abcdef",
          designItemId: "a",
          targetNodeId: "wall-north",
          aspect: "property",
          propertyKey: "length",
          status: "sorta_matches",
          realityEvidenceIds: [],
          coverageEvidenceIds: [],
          designSourceRef: null,
        },
      ],
      stats: {
        totalEntries: 1,
        matches: 1,
        withinTolerance: 0,
        differs: 0,
        deviationBeyondTolerance: 0,
        unknown: 0,
        notObservedInReality: 0,
        occludedInReality: 0,
        unplannedInReality: 0,
        discrepancies: 0,
      },
      inputDigest: "0".repeat(64),
      computedAt: FIXED_NOW,
      history: [],
    };
    try {
      parseComparisonRecord(record);
      expect.unreachable();
    } catch (error) {
      expect((error as ComparisonError).code).toBe("invalid_comparison_record");
      expect((error as ComparisonError).detail).toContain("entry.status");
    }
  });

  test("contentDigest is pure and history-independent", async () => {
    const { ComparisonService } = await import("./service");
    const { InMemoryComparisonStore } = await import("./store");
    const { canonicalResolvers, fixedClock } = await import("./testkit");
    const service = new ComparisonService({
      store: new InMemoryComparisonStore(),
      clock: fixedClock,
      ...canonicalResolvers(),
    });
    const record = await service.runComparison(buildCanonicalInput());
    expect(comparisonContentDigest(record)).toBe(comparisonContentDigest(record));
    expect(record.history[0]?.recordDigest).toBe(comparisonContentDigest(record));
  });
});
