/**
 * HFX-302 corpus tests — the committed corpus's integrity: every sequence
 * validates, every expectation class is present, ALL TEN operation
 * families are covered by the compatible cells, the multi-operation
 * topology cases exist, and the corpus digest is stable.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { describe, expect, test } from "bun:test";
import {
  GEOMETRY_CORPUS,
  GEOMETRY_SCENE,
  OPERATION_FAMILY_VOCABULARY,
  geometryCorpus,
  geometrySequenceIds,
  COMMITTED_PROFILE_IDS,
  COMMITTED_SCENE_IDS,
} from "./corpus";
import { validateSubstitutionSequence } from "./model";

describe("HFX-302 corpus: the committed matrix", () => {
  test("the corpus carries 31 committed sequences (22 compatible / 5 declared-incompatible / 4 unsupported)", () => {
    expect(GEOMETRY_CORPUS).toHaveLength(31);
    const byExpectation: Record<string, number> = {};
    for (const entry of GEOMETRY_CORPUS) {
      byExpectation[entry.expectation] = (byExpectation[entry.expectation] ?? 0) + 1;
    }
    expect(byExpectation).toEqual({
      compatible: 22,
      "declared-incompatible": 5,
      "unsupported-by-substitute": 4,
    });
  });

  test("every sequence id is unique and validates through the fail-closed validator", () => {
    const ids = geometrySequenceIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of GEOMETRY_CORPUS) {
      const validation = validateSubstitutionSequence(
        entry,
        COMMITTED_PROFILE_IDS,
        COMMITTED_SCENE_IDS,
      );
      expect(validation.ok).toBe(true);
    }
  });

  test("ALL TEN documented v1 operation families appear in the compatible cells", () => {
    const compatibleFamilies = new Set<string>();
    for (const entry of GEOMETRY_CORPUS) {
      if (entry.expectation !== "compatible") {
        continue;
      }
      for (const operation of entry.operations) {
        compatibleFamilies.add(operation.operationType);
      }
    }
    expect([...compatibleFamilies].sort()).toEqual([...OPERATION_FAMILY_VOCABULARY].sort());
  });

  test("the multi-operation topology cases are committed (wall+openings, excavation+backfill, coat-over-baseline)", () => {
    const find = (sequenceId: string) => {
      const entry = GEOMETRY_CORPUS.find((candidate) => candidate.sequenceId === sequenceId);
      if (entry === undefined) {
        throw new Error(`corpus test: sequence '${sequenceId}' missing`);
      }
      return entry;
    };
    const wallOpenings = find("gs-block-wall-openings");
    expect(wallOpenings.operations).toHaveLength(3);
    expect(wallOpenings.operations.filter((op) => op.operationType === "opening-creation")).toHaveLength(2);

    const pair = find("gs-excavation-backfill-pair");
    expect(pair.operations.map((op) => op.operationType)).toEqual(["excavation", "backfill"]);
    expect(pair.operations[1]?.dependsOn?.[0]?.dependsOnOperationIndex).toBe(1);

    const coat = find("gs-plaster-baseline");
    expect(coat.operations[0]?.operationType).toBe("plaster-application");
    expect(coat.operations[0]?.targetGeometryRefs[0]?.ref).toBe("geo-wall-faces-002");
  });

  test("unit mixes (mm/cm/m) and non-grid-aligned dimensions are committed", () => {
    const units = find("gs-excavation-units");
    expect(units.operations[0]?.parameters.map((p) => p.unit)).toEqual(["mm", "cm", "m"]);
    expect(find("gs-excavation-nonaligned").operations[0]?.parameters.find((p) => p.name === "length")?.value).toBe(3.02);
    expect(find("gs-plaster-nonaligned").operations[0]?.parameters.find((p) => p.name === "thickness")?.value).toBe(0.012);
    expect(find("gs-service-run-nonaligned").operations[0]?.parameters.find((p) => p.name === "length")?.value).toBe(7.03);
  });

  test("every declared-incompatible sequence declares the closed-vocabulary difference kind", () => {
    for (const entry of GEOMETRY_CORPUS) {
      if (entry.expectation === "declared-incompatible") {
        expect(entry.declaredDifferenceKind).toBe("operation-semantic-failure");
        expect(entry.substituteProfileId).toBe("geometry-substitute-coarse");
      } else {
        expect(entry.declaredDifferenceKind).toBeUndefined();
      }
    }
  });

  test("the unsupported cells ride the restricted profile and declare the omitted families", () => {
    const unsupported = GEOMETRY_CORPUS.filter(
      (entry) => entry.expectation === "unsupported-by-substitute",
    );
    expect(unsupported).toHaveLength(4);
    const omitted = new Set<string>();
    for (const entry of unsupported) {
      expect(entry.substituteProfileId).toBe("geometry-substitute-restricted");
      expect(entry.notes).toContain("restricted profile");
      for (const operation of entry.operations) {
        if (
          operation.operationType === "demolition-removal" ||
          operation.operationType === "finish-application" ||
          operation.operationType === "building-service-installation"
        ) {
          omitted.add(operation.operationType);
        }
      }
    }
    expect([...omitted].sort()).toEqual([
      "building-service-installation",
      "demolition-removal",
      "finish-application",
    ]);
  });

  test("the scene mirrors the HFX-301 world (same solution identity + geometry table)", () => {
    expect(GEOMETRY_SCENE.solutionId).toBe("solution-demo-001");
    expect(GEOMETRY_SCENE.baselineRealityVersionId).toBe("rgv-demo-0007");
    expect(GEOMETRY_SCENE.baselineGeometry["geo-wall-faces-002"]).toEqual({ value: 12.5, unit: "m2" });
    expect(GEOMETRY_SCENE.baselineGeometry["geo-slab-region-005"]).toEqual({ value: 12, unit: "m2" });
  });

  test("the corpus digest is stable (byte-identical regeneration)", () => {
    const digest = (value: unknown): string =>
      createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
    expect(digest(geometryCorpus())).toBe(digest(GEOMETRY_CORPUS));
    expect(digest(geometryCorpus())).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the derivation provenance cites the HFX-301/PROD-029 source fixtures", () => {
    const cited = GEOMETRY_CORPUS.filter((entry) => entry.notes?.includes("HFX-301"));
    expect(cited.length).toBeGreaterThanOrEqual(6);
    expect(
      GEOMETRY_CORPUS.find((entry) => entry.sequenceId === "gs-excavation-core")?.notes,
    ).toContain("eq-excavation-core");
    expect(
      GEOMETRY_CORPUS.find((entry) => entry.sequenceId === "gs-plaster-baseline")?.notes,
    ).toContain("REP-PLASTER-001");
  });
});

function find(sequenceId: string) {
  const entry = GEOMETRY_CORPUS.find((candidate) => candidate.sequenceId === sequenceId);
  if (entry === undefined) {
    throw new Error(`corpus test: sequence '${sequenceId}' missing`);
  }
  return entry;
}
