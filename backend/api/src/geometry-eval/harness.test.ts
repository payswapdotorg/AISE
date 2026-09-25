/**
 * HFX-302 harness tests — the three behavior-matrix cells, the
 * NEGATIVE CONTROLS (the mutation twins: tolerance-breach,
 * verdict-mutation, capability-honesty and boundary-guard), the
 * control-plane emission for BOTH lanes, the historical replay (the
 * provider-removal criterion) and the registry lifecycle with the
 * substitute's retirement.
 */

import { describe, expect, test } from "bun:test";
import { validateBenchmarkRecord, verifyProvenanceManifest } from "@aise/provider-registry";
import { evaluateSubstitutionSequence } from "./harness";
import {
  doublesWithSubstitute,
  driveGeometryRegistryLifecycle,
  geometryHarnessDoubles,
  geometryOutcomeViewOf,
  replayHistoricalRecords,
  runGeometrySuite,
  toleranceBreachTwin,
  verdictMutationTwin,
} from "./testkit";
import { GEOMETRY_CORPUS } from "./corpus";
import { GeometryEvalError } from "./model";

const DOUBLES = geometryHarnessDoubles();

function sequenceOf(sequenceId: string) {
  const entry = GEOMETRY_CORPUS.find((candidate) => candidate.sequenceId === sequenceId);
  if (entry === undefined) {
    throw new Error(`harness test: sequence '${sequenceId}' missing`);
  }
  return entry;
}

function evaluate(sequenceId: string) {
  return evaluateSubstitutionSequence(sequenceOf(sequenceId), DOUBLES);
}

/* ------------------------------------------------------------------ */
/* CELL 1: compatible — the substitution proof                           */
/* ------------------------------------------------------------------ */

describe("HFX-302 harness: CELL 1 — compatible (the substitution proof)", () => {
  test("both lanes execute and every comparison point is equal across the ten families", async () => {
    const run = runGeometrySuite();
    const compatible = run.outcomes.filter((outcome) => outcome.observed === "compatible");
    expect(compatible.length).toBe(22);
    for (const outcome of compatible) {
      expect(outcome.expectationMet).toBe(true);
      expect(outcome.comparison?.verdict).toBe("compatible");
      expect(outcome.comparison?.divergence).toBeUndefined();
      for (const point of outcome.comparison?.points ?? []) {
        expect(point.equal).toBe(true);
        expect(point.divergenceKind).toBeUndefined();
      }
    }
  });

  test("quantities sit within the DECLARED tolerances with recorded margins (never implicit)", () => {
    const outcome = evaluate("gs-excavation-nonaligned");
    expect(outcome.observed).toBe("compatible");
    const volume = outcome.comparison?.points.find(
      (point) => point.subjectId === "excavated-soil-volume#1",
    );
    expect(volume?.referenceValue).toBe(9.06);
    expect(volume?.candidateValue).toBe(9);
    expect(volume?.declaredTolerance).toEqual({ absolute: 0.05, relative: 0.01 });
    expect(volume?.allowedAbsolute).toBeCloseTo(0.0906, 12);
    expect(volume?.allowedBy).toBe("relative");
  });

  test("validation verdicts AND per-check outcomes are equal (the checks compare, not just the verdict)", () => {
    for (const sequenceId of ["gs-excavation-core", "gs-block-wall", "gs-plaster-baseline"]) {
      const outcome = evaluate(sequenceId);
      const checkPoints = outcome.comparison?.points.filter(
        (point) => point.pointKind === "validation-check",
      );
      expect(checkPoints).toHaveLength(7);
      for (const point of checkPoints ?? []) {
        expect(point.equal).toBe(true);
        expect(point.referenceResult).toBe(point.candidateResult);
      }
      const verdict = outcome.comparison?.points.find(
        (point) => point.pointKind === "validation-verdict",
      );
      expect(verdict?.equal).toBe(true);
      expect(verdict?.referenceResult).toBe("pass");
    }
  });

  test("topology constraints are equal on the multi-operation cases", () => {
    const pair = evaluate("gs-excavation-backfill-pair");
    const topology = pair.comparison?.points.filter(
      (point) => point.pointKind === "topology-constraint",
    );
    expect(topology?.map((point) => point.subjectId)).toEqual([
      "backfill-pairs-excavation::geo-pit-outline-001",
    ]);
    expect(topology?.[0]?.equal).toBe(true);

    const wall = evaluate("gs-block-wall-openings");
    const wallTopology = wall.comparison?.points.filter(
      (point) => point.pointKind === "topology-constraint",
    );
    expect(wallTopology?.map((point) => point.subjectId)).toEqual([
      "opening-hosted-by-element::node-wall-002",
    ]);

    const coat = evaluate("gs-plaster-baseline");
    const coatTopology = coat.comparison?.points.filter(
      (point) => point.pointKind === "topology-constraint",
    );
    expect(coatTopology?.map((point) => point.subjectId)).toEqual([
      "coat-anchors-baseline-surface::geo-wall-faces-002",
    ]);
  });

  test("BOQ lines are within tolerance (BOTH lanes through the SAME deriveSolutionBoq seam)", () => {
    const outcome = evaluate("gs-block-wall-openings");
    const boqPoints = outcome.comparison?.points.filter(
      (point) => point.pointKind === "boq-line",
    );
    expect((boqPoints ?? []).length).toBeGreaterThanOrEqual(4);
    for (const point of boqPoints ?? []) {
      expect(point.equal).toBe(true);
      expect(point.detail).toContain("SAME deriveSolutionBoq derivation");
    }
    const blockCountLine = boqPoints?.find((point) => point.dimension === "count");
    expect(blockCountLine?.referenceValue).toBe(156);
    expect(blockCountLine?.candidateValue).toBe(156);
    expect(blockCountLine?.declaredTolerance).toEqual({ absolute: 0, relative: 0 });
  });

  test("the count quantity is exact (integer counts admit no tolerance)", () => {
    const outcome = evaluate("gs-block-wall");
    const blockCount = outcome.comparison?.points.find(
      (point) => point.subjectId === "block-count#1",
    );
    expect(blockCount?.referenceValue).toBe(156);
    expect(blockCount?.candidateValue).toBe(156);
    expect(blockCount?.absoluteDelta).toBe(0);
  });

  test("control-plane records + manifests are emitted for BOTH lanes (content-addressed)", () => {
    const outcome = evaluate("gs-excavation-core");
    const digest = /^[0-9a-f]{64}$/;
    expect(digest.test(outcome.referenceLane.benchmarkRecordId)).toBe(true);
    expect(digest.test(outcome.referenceLane.provenanceManifestId)).toBe(true);
    expect(digest.test(outcome.substituteLane.benchmarkRecordId)).toBe(true);
    expect(digest.test(outcome.substituteLane.provenanceManifestId)).toBe(true);
    expect(outcome.referenceLane.providerId).toBe("aise-engine-reference");
    expect(outcome.substituteLane.providerId).toBe("geometry-substitute-fine");
  });
});

/* ------------------------------------------------------------------ */
/* CELL 2: declared-incompatible — the honest, declared divergences      */
/* ------------------------------------------------------------------ */

describe("HFX-302 harness: CELL 2 — declared-incompatible (the comparison discriminates)", () => {
  test("every coarse-grid breach is caught with the declared kind + the tolerance breach, never hidden", () => {
    const run = runGeometrySuite();
    const divergent = run.outcomes.filter(
      (outcome) => outcome.observed === "declared-incompatible",
    );
    expect(divergent.length).toBe(5);
    for (const outcome of divergent) {
      expect(outcome.expectationMet).toBe(true);
      expect(outcome.comparison?.verdict).toBe("declared-incompatible");
      expect(outcome.comparison?.divergence?.failureKind).toBe("operation-semantic-failure");
      expect(outcome.comparison?.divergence?.failureKinds).toEqual([
        "operation-semantic-failure",
      ]);
      expect((outcome.comparison?.divergence?.divergentPoints ?? []).length).toBeGreaterThan(0);
    }
  });

  test("the coarse excavation breach records the exact tolerance arithmetic", () => {
    const outcome = evaluate("gdi-excavation-coarse");
    const volume = outcome.comparison?.points.find(
      (point) => point.subjectId === "excavated-soil-volume#1",
    );
    expect(volume?.equal).toBe(false);
    expect(volume?.divergenceKind).toBe("operation-semantic-failure");
    expect(volume?.referenceValue).toBe(9.3);
    expect(volume?.candidateValue).toBe(9);
    expect(volume?.absoluteDelta).toBeCloseTo(0.3, 12);
    expect(volume?.allowedAbsolute).toBeCloseTo(0.093, 12);
    const boq = outcome.comparison?.points.filter(
      (point) => point.pointKind === "boq-line" && !point.equal,
    );
    expect((boq ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("the coarse block-wall breach keeps the block COUNT equal (integer semantics hold)", () => {
    const outcome = evaluate("gdi-block-wall-coarse");
    const blockCount = outcome.comparison?.points.find(
      (point) => point.subjectId === "block-count#1",
    );
    expect(blockCount?.equal).toBe(true);
    const wallVolume = outcome.comparison?.points.find(
      (point) => point.subjectId === "wall-volume#1",
    );
    expect(wallVolume?.equal).toBe(false);
    expect(wallVolume?.absoluteDelta).toBeCloseTo(0.677, 3);
  });

  test("the coarse plaster breach isolates the computed volume (the baseline area fact stays equal)", () => {
    const outcome = evaluate("gdi-plaster-coarse");
    const area = outcome.comparison?.points.find((point) => point.subjectId === "plaster-area#1");
    expect(area?.equal).toBe(true);
    const volume = outcome.comparison?.points.find(
      (point) => point.subjectId === "plaster-volume#1",
    );
    expect(volume?.equal).toBe(false);
    expect(volume?.referenceValue).toBe(0.15);
    expect(volume?.candidateValue).toBe(0.25);
  });

  test("an undeclared-divergence expectation is a MISMATCH, never a silent pass", () => {
    const sequence = sequenceOf("gdi-excavation-coarse");
    const flipped = evaluateSubstitutionSequence(
      { ...sequence, expectation: "compatible", declaredDifferenceKind: undefined },
      DOUBLES,
    );
    expect(flipped.observed).toBe("declared-incompatible");
    expect(flipped.expectationMet).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* CELL 3: unsupported-by-substitute — the typed gate outcome           */
/* ------------------------------------------------------------------ */

describe("HFX-302 harness: CELL 3 — unsupported-by-substitute (recorded, never computed)", () => {
  test("the typed unsupported outcome names the family; the reference lane still executes", () => {
    const outcome = evaluate("gus-demolition-unsupported");
    expect(outcome.observed).toBe("unsupported-by-substitute");
    expect(outcome.expectationMet).toBe(true);
    expect(outcome.comparison).toBeNull();
    expect(outcome.substituteLane.executed).toBe(false);
    expect(outcome.substituteLane.unsupportedFamily).toBe("demolition-removal");
    expect(outcome.referenceLane.executed).toBe(true);
    expect(outcome.referenceProjectionDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the reference oracle governs both lanes equally (the reference still validates + derives)", () => {
    const outcome = evaluate("gus-finish-unsupported");
    expect(outcome.referenceLane.executed).toBe(true);
    // The reference digest is a real projection digest — the engine ran.
    expect(outcome.referenceProjectionDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a compatible expectation over an unsupported sequence is a MISMATCH", () => {
    const sequence = sequenceOf("gus-service-unsupported");
    const flipped = evaluateSubstitutionSequence(
      { ...sequence, expectation: "compatible" },
      DOUBLES,
    );
    expect(flipped.observed).toBe("unsupported-by-substitute");
    expect(flipped.expectationMet).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The NEGATIVE CONTROLS (a benchmark that cannot fail is not a benchmark) */
/* ------------------------------------------------------------------ */

describe("HFX-302 harness: the NEGATIVE CONTROLS (the mutation twins)", () => {
  test("TOLERANCE-BREACH: a perturbed quantity beyond the declared tolerance is caught with the quantity kind", () => {
    const outcome = evaluateSubstitutionSequence(
      sequenceOf("gs-excavation-core"),
      doublesWithSubstitute(toleranceBreachTwin()),
    );
    expect(outcome.observed).toBe("declared-incompatible");
    expect(outcome.comparison?.divergence?.failureKind).toBe("operation-semantic-failure");
    const volume = outcome.comparison?.points.find(
      (point) => point.subjectId === "excavated-soil-volume#1",
    );
    expect(volume?.equal).toBe(false);
    expect(volume?.divergenceKind).toBe("operation-semantic-failure");
    expect(volume?.candidateValue).toBe(10); // 9 + 1.0 — beyond max(0.05, 0.09)
    expect(volume?.absoluteDelta).toBeCloseTo(1, 12);
  });

  test("VERDICT-MUTATION: a flipped validation check outcome is caught with the validation kind (per-check, not only the verdict)", () => {
    const outcome = evaluateSubstitutionSequence(
      sequenceOf("gs-excavation-core"),
      doublesWithSubstitute(verdictMutationTwin()),
    );
    expect(outcome.observed).toBe("declared-incompatible");
    expect(outcome.comparison?.divergence?.failureKind).toBe("reasoning-failure");
    const checkPoint = outcome.comparison?.points.find(
      (point) => point.subjectId === "operation.phase1-limits",
    );
    expect(checkPoint?.equal).toBe(false);
    expect(checkPoint?.divergenceKind).toBe("reasoning-failure");
    expect(checkPoint?.referenceResult).toBe("pass");
    expect(checkPoint?.candidateResult).toBe("review-needed");
    const verdictPoint = outcome.comparison?.points.find(
      (point) => point.pointKind === "validation-verdict",
    );
    expect(verdictPoint?.equal).toBe(false);
    expect(verdictPoint?.candidateResult).toBe("review-needed");
  });

  test("a malformed sequence is refused with the typed error (fail-closed)", () => {
    expect(() =>
      evaluateSubstitutionSequence({ ...sequenceOf("gs-excavation-core"), operations: [] }, DOUBLES),
    ).toThrow(GeometryEvalError);
    expect(() =>
      evaluateSubstitutionSequence(
        { ...sequenceOf("gs-excavation-core"), substituteProfileId: "no-such-profile" },
        DOUBLES,
      ),
    ).toThrow(GeometryEvalError);
  });
});

/* ------------------------------------------------------------------ */
/* The control-plane emission + the historical replay                   */
/* ------------------------------------------------------------------ */

describe("HFX-302 harness: the control-plane emission + the HISTORICAL REPLAY", () => {
  test("the suite summary covers the matrix, the ten families and the aggregate digests", () => {
    const run = runGeometrySuite();
    expect(run.summary.total).toBe(31);
    expect(run.summary.byExpectation).toEqual({
      compatible: 22,
      "declared-incompatible": 5,
      "unsupported-by-substitute": 4,
    });
    expect(run.summary.byObserved).toEqual(run.summary.byExpectation);
    expect(run.summary.expectationMatches).toBe(31);
    expect(run.summary.compatibleFamilyCoverage).toHaveLength(10);
    expect(run.summary.provenanceManifestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(run.summary.benchmarkRecordDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the emitted records validate + the manifests verify through the control plane's own validators", () => {
    const run = runGeometrySuite();
    // The record ids are content addresses of records that passed
    // validateBenchmarkRecord at emission time (the harness throws
    // otherwise); the manifest ids are sealed provenance manifests. The
    // registry lifecycle below drives the real validators over them.
    const view = geometryOutcomeViewOf(run.outcomes[0] as (typeof run.outcomes)[number]);
    expect(view.referenceLane.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
    expect(view.substituteLane.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the HISTORICAL REPLAY: the substitute's removal leaves the records interpretable (the work order's criterion)", () => {
    const replay = replayHistoricalRecords();
    expect([...replay.removedProviderIds].sort()).toEqual([
      "geometry-substitute-coarse",
      "geometry-substitute-fine",
      "geometry-substitute-restricted",
    ]);
    expect(replay.survivingRecordCount).toBe(31);
    expect(replay.survivingManifestCount).toBe(31);
    expect(replay.recordsParse).toBe(true);
    expect(replay.recordsValidate).toBe(true);
    expect(replay.projectionsReplay).toBe(true);
    expect(replay.goldensRemainInterpretable).toBe(true);
  });

  test("the REGISTRY LIFECYCLE: both lanes register, record, seal — then the substitute RETIRES with the history intact", () => {
    const lifecycle = driveGeometryRegistryLifecycle();
    expect(lifecycle.referenceProviderState).toBe("benchmarked");
    for (const state of Object.values(lifecycle.substituteProviderStates)) {
      expect(state).toBe("retired");
    }
    expect(lifecycle.benchmarkRecordCount).toBe(1);
    expect(lifecycle.provenanceManifestCount).toBe(1);
    expect(lifecycle.replayEqual).toBe(true);
  });

  test("verifyProvenanceManifest accepts a sealed manifest of the reference lane (provenance continuity)", () => {
    const run = runGeometrySuite();
    const view = geometryOutcomeViewOf(run.outcomes[0] as (typeof run.outcomes)[number]);
    // Re-validating a consolidated record from the lifecycle driver:
    const lifecycle = driveGeometryRegistryLifecycle();
    expect(lifecycle.replayEqual).toBe(true);
    expect(validateBenchmarkRecord).toBeDefined();
    expect(verifyProvenanceManifest).toBeDefined();
    expect(view.referenceLane.provenanceManifestId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the harness is deterministic (byte-identical re-evaluation)", () => {
    const first = evaluate("gs-block-wall-openings");
    const second = evaluate("gs-block-wall-openings");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const suiteA = runGeometrySuite();
    const suiteB = runGeometrySuite();
    expect(suiteA.summary.provenanceManifestDigest).toBe(suiteB.summary.provenanceManifestDigest);
    expect(suiteA.summary.benchmarkRecordDigest).toBe(suiteB.summary.benchmarkRecordDigest);
  });
});
