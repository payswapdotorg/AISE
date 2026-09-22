/**
 * PROD-027 — the Layer-1 evaluation benchmark's LIVE LEG (the golden
 * reproduction gate — the building-benchmark pattern's apps-side discipline,
 * living in the backend zone because only backend may import the harness).
 *
 * The boundary matrix forbids tools → backend imports, so the tools-side
 * check runner (`tools/reality-eval/benchmark.test.ts`) verifies the
 * COMMITTED artifacts as data. THIS suite runs the suite LIVE — the real
 * harness over the committed scenario set (`tools/reality-eval/scenario.json`)
 * — and asserts:
 *
 *  1. FRESHNESS — the committed scenario set equals the freshly built set
 *     BYTE-FOR-BYTE (canonical JSON): any scenario/double/builder change
 *     without a regeneration (`bun backend/api/src/reality-eval/regenerate.ts`)
 *     fails the gate;
 *  2. the freshly computed golden outcomes equal the committed
 *     `fixtures/expected-outcomes.json` BYTE-FOR-BYTE — the golden records
 *     (BenchmarkRecords + ProvenanceManifests) and the registry event log
 *     are REPRODUCED BY TESTS;
 *  3. every record is a VALID control-plane record (content-addressed) and
 *     every manifest is digest-verifiable;
 *  4. the registry log REPLAYS deterministically (replayRegistry) and
 *     re-derives every evaluation's manifest;
 *  5. the class doctrine over the committed goldens: the discrimination
 *     scenario is CAUGHT (fail + recorded perception-failure observations),
 *     the negative scenarios are explicit-and-safe, the positives pass.
 *
 * Determinism: pure computation over committed files; no clock, no
 * randomness, no network.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  deriveBenchmarkRecordId,
  replayRegistry,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  EXPECTED_OUTCOMES_PATH,
  SCENARIO_SET_PATH,
  loadRealityEvalScenarioSet,
  realityEvalScenarioSet,
  runRealityEvalSuite,
} from "./testkit";
import { scenarioSetDigestOf } from "./model";

function readCanonical(path: string): string {
  return readFileSync(path, "utf8");
}

describe("PROD-027 golden records: byte-for-byte reproduction (the live leg)", () => {
  test("the committed scenario set equals the freshly built set BYTE-FOR-BYTE", () => {
    const fresh = canonicalJsonStringify(realityEvalScenarioSet());
    const committed = readCanonical(SCENARIO_SET_PATH);
    expect(committed).toBe(fresh);
  });

  test("the freshly computed golden outcomes equal the committed fixture BYTE-FOR-BYTE", () => {
    const fresh = canonicalJsonStringify(runRealityEvalSuite());
    const committed = readCanonical(EXPECTED_OUTCOMES_PATH);
    expect(committed).toBe(fresh);
  });

  test("the golden body's scenario-set digest re-derives from the committed scenario set", () => {
    const outcomes = runRealityEvalSuite();
    const set = loadRealityEvalScenarioSet();
    expect(outcomes.scenarioSetDigest).toBe(scenarioSetDigestOf(set));
    expect(outcomes.scenarioSetDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("two fresh runs produce the byte-identical golden body (suite determinism)", () => {
    const first = canonicalJsonStringify(runRealityEvalSuite());
    const second = canonicalJsonStringify(runRealityEvalSuite());
    expect(second).toBe(first);
  });
});

describe("PROD-027 golden records: the control-plane artifact invariants", () => {
  const outcomes = runRealityEvalSuite();

  test("every golden record is a valid, content-addressed control-plane BenchmarkRecord", () => {
    expect(outcomes.evaluations.length).toBe(6);
    for (const evaluation of outcomes.evaluations) {
      const validation = validateBenchmarkRecord(evaluation.record);
      expect(validation.ok, evaluation.scenarioId).toBe(true);
      if (validation.ok) {
        const { recordId, ...body } = evaluation.record;
        expect(recordId).toBe(deriveBenchmarkRecordId(body));
      }
    }
  });

  test("every golden manifest is digest-verifiable and chains its record", () => {
    for (const evaluation of outcomes.evaluations) {
      const validation = verifyProvenanceManifest(evaluation.manifest);
      expect(validation.ok, evaluation.scenarioId).toBe(true);
      expect(evaluation.manifest.benchmarkRecordReferences).toEqual([
        evaluation.record.recordId,
      ]);
      expect(evaluation.manifest.profileReference.providerId).toBe(
        evaluation.record.providerId,
      );
      expect(evaluation.manifest.profileReference.technologyVersion).toBe(
        evaluation.record.technologyVersion,
      );
    }
  });

  test("the records are comparable within their pinned lane benchmarks (2 comparability keys)", () => {
    const keys = new Set(
      outcomes.evaluations.map(
        (evaluation) => `${evaluation.record.benchmarkId}|${evaluation.record.capability}`,
      ),
    );
    expect(keys.size).toBe(2);
    expect(keys.has("reality-eval-reconstruction/1|reconstruction")).toBe(true);
    expect(keys.has("reality-eval-depth/1|depth")).toBe(true);
  });

  test("the registry log replays deterministically and re-derives every sealed manifest", () => {
    const replay = replayRegistry(outcomes.registryLog);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.registry.events.length).toBe(outcomes.registryLog.length);
      const sealed = replay.registry.entries.flatMap((entry) => entry.provenanceManifests);
      for (const evaluation of outcomes.evaluations) {
        expect(
          sealed.some((manifest) => manifest.manifestId === evaluation.manifest.manifestId),
          evaluation.scenarioId,
        ).toBe(true);
      }
      // all three providers end in the evaluation state (no self-promotion)
      for (const entry of replay.registry.entries) {
        expect(entry.state).toBe("evaluation");
      }
    }
  });

  test("the execution-normalized events pin every evaluation's input digest", () => {
    const executions = outcomes.registryLog.filter(
      (event) => event.kind === "execution-normalized",
    );
    expect(executions.length).toBe(6);
    const inputDigests = executions.map((event) =>
      event.kind === "execution-normalized" ? event.execution.inputDigest : "",
    );
    for (const evaluation of outcomes.evaluations) {
      expect(inputDigests).toContain(evaluation.record.reproduction.inputsDigest);
    }
  });
});

describe("PROD-027 golden records: the class doctrine over the committed goldens", () => {
  const outcomes = runRealityEvalSuite();
  const byId = new Map(outcomes.evaluations.map((entry) => [entry.scenarioId, entry]));

  test("the three POSITIVE scenarios pass with zero failure observations", () => {
    for (const scenarioId of [
      "recon-flagship-positive-001",
      "recon-midrange-positive-002",
      "depth-wall-positive-005",
    ]) {
      const evaluation = byId.get(scenarioId)!;
      expect(evaluation.verdict).toBe("pass");
      expect(evaluation.failureObservationKinds).toEqual([]);
      expect(evaluation.discriminationCaught).toBe(false);
    }
  });

  test("the DISCRIMINATION scenario is CAUGHT: verdict fail + recorded perception-failure observations", () => {
    const evaluation = byId.get("recon-flagship-discrimination-003")!;
    expect(evaluation.verdict).toBe("fail");
    expect(evaluation.discriminationCaught).toBe(true);
    expect(evaluation.failureObservationKinds.length).toBeGreaterThan(0);
    expect(
      evaluation.failureObservationKinds.every((kind) => kind === "perception-failure"),
    ).toBe(true);
    // the record carries the caught failure, not just low scores
    expect(
      evaluation.record.failureObservations.every(
        (observation) => observation.kind === "perception-failure",
      ),
    ).toBe(true);
  });

  test("the two NEGATIVE scenarios pass as explicit-and-safe with their expected failure kinds", () => {
    const timeout = byId.get("recon-timeout-negative-004")!;
    expect(timeout.verdict).toBe("pass");
    expect(timeout.failureObservationKinds).toEqual(["timeout"]);

    const unsupported = byId.get("depth-unsupported-negative-006")!;
    expect(unsupported.verdict).toBe("pass");
    expect(unsupported.failureObservationKinds).toEqual(["unsupported-data"]);
  });

  test("the negative records carry the explicit-failure-alignment metric (1 = the lawful path)", () => {
    for (const scenarioId of ["recon-timeout-negative-004", "depth-unsupported-negative-006"]) {
      const evaluation = byId.get(scenarioId)!;
      expect(
        evaluation.record.metrics.map((metric) => [metric.metric, metric.value]),
      ).toContainEqual(["explicit_failure_alignment", 1]);
    }
  });

  test("the committed split is 3 positive / 2 negative / 1 discrimination over 2 lanes", () => {
    const classes = outcomes.evaluations.map((entry) => entry.scenarioClass);
    expect(classes.filter((entry) => entry === "positive").length).toBe(3);
    expect(classes.filter((entry) => entry === "negative").length).toBe(2);
    expect(classes.filter((entry) => entry === "discrimination").length).toBe(1);
  });
});
