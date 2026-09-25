/**
 * HFX-302 — the geometry/validation technology substitution benchmark
 * CHECK RUNNER test (the tools/ pickup wired into the root
 * `bun run verify` — the equivalence-eval convention).
 *
 * Exercises `./runner.ts` over the COMMITTED ARTIFACTS as data (the
 * boundary matrix forbids tools → packages/backend imports): the full
 * check report must be clean, and the mandated three-cell,
 * honest-difference, designed-unsupported and tolerance assertions are
 * additionally asserted test-by-test from the committed data.
 *
 * Determinism: pure reads of committed files + pure logic; no clock, no
 * randomness, no network, no engine import.
 */

import { describe, expect, test } from "bun:test";
import { loadGeometryArtifacts, verifyGeometryArtifacts } from "./runner";

const report = verifyGeometryArtifacts();

describe("HFX-302 geometry-eval: the committed artifacts are coherent", () => {
  test("the full check report is clean", () => {
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(22);
  });

  test("every named check passes (failures list the gap)", () => {
    const failed = report.checks.filter((check) => !check.passed).map((check) => check.id);
    expect(failed).toEqual([]);
  });

  test("the suite is the committed 31-sequence corpus across the three cells", () => {
    expect(report.summary.total).toBe(31);
    expect(report.summary.byExpectation).toEqual({
      compatible: 22,
      "declared-incompatible": 5,
      "unsupported-by-substitute": 4,
    });
    expect(report.summary.byObserved).toEqual(report.summary.byExpectation);
    expect(report.summary.expectationMatches).toBe(31);
  });

  test("the artifact identities are pinned (suite, benchmark, code version, corpus digest)", () => {
    const { scenarioSuite, outcomesSuite } = loadGeometryArtifacts();
    expect(scenarioSuite["suiteId"]).toBe("geometry-eval-suite/1");
    expect(scenarioSuite["version"]).toBe("1.0.0");
    expect(scenarioSuite["benchmarkId"]).toBe("geometry-eval-suite/1");
    expect(scenarioSuite["codeVersion"]).toBe("hfx-302/geometry-eval/1");
    expect(scenarioSuite["sequenceCount"]).toBe(31);
    expect(outcomesSuite["suiteId"]).toBe("geometry-eval-suite/1");
    expect(outcomesSuite["sequenceCount"]).toBe(31);
    const pins = scenarioSuite["pins"] as Record<string, string>;
    expect(pins["engineKind"]).toBe("aise-solution-engine");
    expect(pins["engineCodeVersion"]).toBe("1.0.0");
    expect(pins["substituteImplementationVersion"]).toBe(
      "geometry-substitute/discretized-accumulation/1",
    );
    expect(pins["toleranceModelVersion"]).toBe("hfx-302/quantity-tolerance/1");
    expect(pins["corpusDigest"]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("HFX-302 geometry-eval: CELL 1 — the substitution proof (the checkpoint)", () => {
  const { outcomes, sequences } = loadGeometryArtifacts();
  const compatible = outcomes.filter((outcome) => outcome.observed === "compatible");

  test("every compatible outcome is canonically compatible across ALL five comparison kinds", () => {
    expect(compatible.length).toBe(22);
    for (const outcome of compatible) {
      expect(outcome.comparison?.verdict).toBe("compatible");
      expect(outcome.comparison?.equalPoints).toBe(outcome.comparison?.totalPoints);
      expect(outcome.comparison?.divergentPoints ?? []).toEqual([]);
      expect(outcome.comparison?.failureKind).toBeUndefined();
      for (const point of outcome.comparison?.points ?? []) {
        expect(point.equal).toBe(true);
        expect(point.divergenceKind).toBeUndefined();
      }
    }
  });

  test("ALL TEN operation families are covered by the compatible cells", () => {
    const families = new Set<string>();
    for (const outcome of compatible) {
      const entry = sequences.find((candidate) => candidate.sequenceId === outcome.sequenceId);
      for (const operation of entry?.operations ?? []) {
        families.add(operation.operationType);
      }
    }
    expect([...families].sort()).toEqual([
      "backfill",
      "block-wall-placement",
      "building-service-installation",
      "demolition-removal",
      "excavation",
      "finish-application",
      "foundation-placement",
      "opening-creation",
      "plaster-application",
      "slab-placement",
    ]);
  });

  test("both lanes executed through the same adapter call with content-addressed identities", () => {
    for (const outcome of compatible) {
      expect(outcome.referenceLane.providerId).toBe("aise-engine-reference");
      expect(outcome.referenceLane.technologyVersion).toBe("1.0.0");
      expect(outcome.substituteLane.executed).toBe(true);
      expect(outcome.substituteLane.unsupportedFamily).toBeUndefined();
      expect(outcome.referenceLane.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
      expect(outcome.substituteLane.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the non-aligned compatible sequences show the declared tolerance working (margins recorded)", () => {
    const excavation = outcomes.find((o) => o.sequenceId === "gs-excavation-nonaligned");
    const volume = excavation?.comparison?.points.find(
      (point) => point.subjectId === "excavated-soil-volume#1",
    );
    expect(volume?.referenceValue).toBe(9.06);
    expect(volume?.candidateValue).toBe(9);
    expect(volume?.declaredTolerance).toEqual({ absolute: 0.05, relative: 0.01 });
    expect(volume?.allowedBy).toBe("relative");
    expect(volume?.equal).toBe(true);

    const plaster = outcomes.find((o) => o.sequenceId === "gs-plaster-nonaligned");
    const plasterVolume = plaster?.comparison?.points.find(
      (point) => point.subjectId === "plaster-volume#1",
    );
    expect(plasterVolume?.absoluteDelta).toBeCloseTo(0.025, 12);
    expect(plasterVolume?.allowedBy).toBe("absolute");
    expect(plasterVolume?.equal).toBe(true);
  });

  test("per-check validation outcomes and topology constraints are compared (not just quantities)", () => {
    const wallOpenings = outcomes.find((o) => o.sequenceId === "gs-block-wall-openings");
    const checkPoints = wallOpenings?.comparison?.points.filter(
      (point) => point.pointKind === "validation-check",
    );
    expect(checkPoints).toHaveLength(7);
    for (const point of checkPoints ?? []) {
      expect(point.referenceResult).toBe(point.candidateResult);
    }
    const topologyPoints = wallOpenings?.comparison?.points.filter(
      (point) => point.pointKind === "topology-constraint",
    );
    expect(toponomy(topologyPoints)).toContain("opening-hosted-by-element::node-wall-002");

    const pair = outcomes.find((o) => o.sequenceId === "gs-excavation-backfill-pair");
    const pairTopology = pair?.comparison?.points.filter(
      (point) => point.pointKind === "topology-constraint",
    );
    expect(toponomy(pairTopology)).toContain("backfill-pairs-excavation::geo-pit-outline-001");

    const coat = outcomes.find((o) => o.sequenceId === "gs-plaster-baseline");
    const coatTopology = coat?.comparison?.points.filter(
      (point) => point.pointKind === "topology-constraint",
    );
    expect(toponomy(coatTopology)).toContain("coat-anchors-baseline-surface::geo-wall-faces-002");
  });

  test("the BOQ legs flowed through the shared derivation (grouped lines with cited methods)", () => {
    const wallOpenings = outcomes.find((o) => o.sequenceId === "gs-block-wall-openings");
    const boqPoints = wallOpenings?.comparison?.points.filter(
      (point) => point.pointKind === "boq-line",
    );
    expect((boqPoints ?? []).length).toBeGreaterThanOrEqual(4);
    for (const point of boqPoints ?? []) {
      expect(point.equal).toBe(true);
      expect(point.detail).toContain("SAME deriveSolutionBoq derivation");
    }
  });
});

describe("HFX-302 geometry-eval: CELL 2 — the honest declared differences", () => {
  const { outcomes, sequences } = loadGeometryArtifacts();

  test("every declared difference records the closed kind + the tolerance breach, never hidden", () => {
    for (const outcome of outcomes.filter((o) => o.observed === "declared-incompatible")) {
      expect(outcome.comparison?.verdict).toBe("declared-incompatible");
      expect(outcome.comparison?.failureKind).toBe("operation-semantic-failure");
      expect(outcome.comparison?.failureKinds).toEqual(["operation-semantic-failure"]);
      expect(outcome.expectationMet).toBe(true);
      expect(outcome.substituteProfileId).toBe("geometry-substitute-coarse");
      const entry = sequences.find((candidate) => candidate.sequenceId === outcome.sequenceId);
      expect(entry?.declaredDifferenceKind).toBe("operation-semantic-failure");
      const breachedLegs = (outcome.comparison?.points ?? []).filter(
        (point) =>
          !point.equal &&
          (point.pointKind === "quantity-value" || point.pointKind === "boq-line") &&
          (point.absoluteDelta ?? 0) > (point.allowedAbsolute ?? 0),
      );
      expect(breachedLegs.length).toBeGreaterThan(0);
    }
  });

  test("the coarse excavation breach is itemized exactly (volume 9.3 vs 9.0, allowed 0.093)", () => {
    const outcome = outcomes.find((o) => o.sequenceId === "gdi-excavation-coarse");
    const volume = outcome?.comparison?.points.find(
      (point) => point.subjectId === "excavated-soil-volume#1",
    );
    expect(volume?.equal).toBe(false);
    expect(volume?.referenceValue).toBe(9.3);
    expect(volume?.candidateValue).toBe(9);
    expect(volume?.absoluteDelta).toBeCloseTo(0.3, 12);
    expect(volume?.allowedAbsolute).toBeCloseTo(0.093, 12);
  });

  test("the coarse block-wall breach keeps the integer block count equal (156 = 156)", () => {
    const outcome = outcomes.find((o) => o.sequenceId === "gdi-block-wall-coarse");
    const blockCount = outcome?.comparison?.points.find(
      (point) => point.subjectId === "block-count#1",
    );
    expect(blockCount?.equal).toBe(true);
    expect(blockCount?.referenceValue).toBe(156);
    expect(blockCount?.candidateValue).toBe(156);
    expect(blockCount?.absoluteDelta).toBe(0);
    const wallVolume = outcome?.comparison?.points.find(
      (point) => point.subjectId === "wall-volume#1",
    );
    expect(wallVolume?.equal).toBe(false);
  });
});

describe("HFX-302 geometry-eval: CELL 3 — the designed unsupported outcomes", () => {
  const { outcomes } = loadGeometryArtifacts();

  test("every unsupported outcome names the undeclared family with the reference lane still executed", () => {
    const unsupported = outcomes.filter((o) => o.observed === "unsupported-by-substitute");
    expect(unsupported).toHaveLength(4);
    const families = new Set<string>();
    for (const outcome of unsupported) {
      expect(outcome.substituteLane.executed).toBe(false);
      expect(outcome.comparison).toBeNull();
      expect(outcome.referenceLane.executed).toBe(true);
      families.add(outcome.substituteLane.unsupportedFamily ?? "");
    }
    expect([...families].sort()).toEqual([
      "building-service-installation",
      "demolition-removal",
      "finish-application",
    ]);
  });

  test("the mixed sequence names the FIRST undeclared family in sequence order", () => {
    const mixed = outcomes.find((o) => o.sequenceId === "gus-mixed-unsupported");
    expect(mixed?.substituteLane.unsupportedFamily).toBe("demolition-removal");
  });
});

describe("HFX-302 geometry-eval: the tolerance report data + the control-plane digests", () => {
  test("the per-dimension observed extremes are committed (the compatibility margins made auditable)", () => {
    const extremes = report.summary.toleranceExtremes;
    expect(Object.keys(extremes).sort()).toEqual(["area", "count", "length", "volume"]);
    expect(extremes.count?.breaches).toBe(0);
    expect(extremes.count?.maxAbsoluteDelta).toBe(0);
    expect(extremes.volume?.breaches).toBe(8);
    expect(extremes.area?.breaches).toBe(6);
    expect(extremes.length?.breaches).toBe(2);
  });

  test("the aggregate digests are 64-hex and re-derived from the outcome rows alone", () => {
    expect(report.summary.provenanceManifestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(report.summary.benchmarkRecordDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the historical-replay anchors ride every outcome (the reference projection digests)", () => {
    for (const outcome of loadGeometryArtifacts().outcomes) {
      expect(outcome.referenceProjectionDigest).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

function toponomy(points: readonly { subjectId: string }[] | undefined): string[] {
  return (points ?? []).map((point) => point.subjectId);
}
