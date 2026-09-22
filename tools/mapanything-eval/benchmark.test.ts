/**
 * HFX-101 — the MapAnything PROVIDER BENCHMARK check runner test (the
 * tools/pickup wired into the root `bun run verify` — the tools/
 * reality-eval + tools/vlm-eval convention).
 *
 * Three parts:
 *
 *  1. THE CHECKS — every committed artifact is coherent as DATA: the
 *     pinned suite identity, the registered candidate + the reference-path
 *     providers, the corpus coverage, the run coherence, the outcome
 *     alignment, the content addressing (records + manifests + input
 *     digests), the closed failure vocabulary, the comparability join with
 *     the recomputed metric deltas, the lawful registry lifecycle and the
 *     summary recomputation;
 *  2. THE BEHAVIOR MATRIX — the four mandated cells asserted test-by-test
 *     from the committed data — THESE TESTS FAIL IF THE MANDATED BEHAVIOR
 *     REGRESSES (grounded-pass / degraded-evidence / failed-invocation /
 *     unsupported-task-combination);
 *  3. DISCRIMINATION OF THE CHECKS THEMSELVES — the checks are real, not
 *     vacuous: a sabotaged record (a mutated metric value) no longer
 *     re-derives its content address, a smeared failure kind fails the
 *     closed-vocabulary doctrine, and the committed files are canonical.
 *
 * The boundary matrix forbids tools → packages/backend imports, so this
 * runner consumes the COMMITTED ARTIFACTS as data; the LIVE byte-for-byte
 * reproduction (the freshly computed suite equals the committed goldens)
 * lives in `backend/api/src/mapanything-eval/golden.test.ts`.
 *
 * Determinism: pure reads of committed files + pure arithmetic; no clock,
 * no randomness, no network, no engine import.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  CLOSED_FAILURE_KINDS,
  DECLARED_FALLBACK,
  loadExpectedOutcomes,
  loadScenarioSuite,
  verifyMapAnythingEvalArtifacts,
} from "./runner";

const report = verifyMapAnythingEvalArtifacts();

/** Sort one parsed JSON value's object keys recursively (the canonical form). */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortValue(record[key]);
    }
    return out;
  }
  return value;
}

/** sha-256 over the canonical JSON (the same arithmetic the checks perform). */
function digestOf(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8")
    .digest("hex");
}

function expectCheck(id: string): void {
  const found = report.checks.find((entry) => entry.check === id);
  expect(found, `the check '${id}' must exist`).toBeDefined();
  expect(found?.ok, `${id}: ${found?.detail}`).toBe(true);
}

/* ------------------------------------------------------------------ */
/* 1. The committed artifacts are coherent (as data)                    */
/* ------------------------------------------------------------------ */

describe("HFX-101 mapanything-eval: the committed artifacts are coherent", () => {
  test("the full check report is clean (every named check green)", () => {
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBe(14);
    for (const entry of report.checks) {
      expect(entry.ok, `${entry.check}: ${entry.detail}`).toBe(true);
    }
  });

  test("the suite identity is pinned (suite, code version, execution mode, license)", () => {
    expectCheck("suite-identity");
    const { suite } = loadScenarioSuite();
    expect(suite["suiteId"]).toBe("mapanything-recon-benchmark/1");
    expect(suite["version"]).toBe("1.0.0");
    expect(suite["codeVersion"]).toBe("hfx-101/mapanything-eval/1");
    expect(suite["executionMode"]).toBe("deterministic-in-repo-doubles");
    expect(suite["licenseStatus"]).toBe("evaluation-only");
    expect(suite["providerFamily"]).toBe("mapanything");
  });

  test("the registered candidate + the two reference-path providers carry 64-hex digests", () => {
    expectCheck("providers-registered");
    const { providers } = loadScenarioSuite();
    expect(providers.map((provider) => String(provider["providerId"])).sort()).toEqual([
      "fixture-reality-depth-provider",
      "fixture-reconstruction-provider",
      "mapanything",
    ]);
    for (const provider of providers) {
      expect(String(provider["profileDigest"])).toMatch(/^[0-9a-f]{64}$/);
    }
    const candidate = providers.find((provider) => provider["variant"] === "mapanything");
    expect(candidate?.["technologyVersion"]).toBe("eval-doubles-1");
    expect(candidate?.["licenseStatus"]).toBe("evaluation-only");
  });

  test("the corpus covers the mandated cells and all three task kinds", () => {
    expectCheck("corpus-coverage");
    expect(report.summary.byCell).toEqual({
      "degraded-evidence": 2,
      "failed-invocation": 1,
      "grounded-pass": 8,
      "unsupported-task-combination": 1,
    });
    expect(report.summary.byVariant).toEqual({
      mapanything: 8,
      "reference-depth": 1,
      "reference-reconstruction": 3,
    });
  });

  test("every record re-derives its content address; every manifest re-derives and chains its record", () => {
    expectCheck("record-content-addressing");
    expectCheck("manifest-content-addressing");
    const { runOutcomes } = loadExpectedOutcomes();
    for (const outcome of runOutcomes) {
      const record = outcome["record"] as Record<string, unknown>;
      const recordId = record["recordId"] as string;
      const rest = { ...record } as Record<string, unknown>;
      delete rest["recordId"];
      const identityInput = {
        kind: "provider-benchmark-record",
        providerId: rest["providerId"],
        technologyVersion: rest["technologyVersion"],
        benchmarkId: rest["benchmarkId"],
        capability: rest["capability"],
        metrics: rest["metrics"],
        failureObservations: rest["failureObservations"],
        resourceObservations: rest["resourceObservations"],
        reproduction: rest["reproduction"],
      };
      expect(digestOf(identityInput)).toBe(recordId);
    }
  });

  test("every input digest re-derives from the run's own input fixture (capture sets included)", () => {
    expectCheck("input-digests");
  });

  test("the registry lifecycle is lawful: no promotion for the references, license-blocked for the candidate", () => {
    expectCheck("registry-lifecycle");
    const { variants } = loadExpectedOutcomes();
    const candidate = variants.find((variant) => variant["variant"] === "mapanything");
    expect(candidate?.["registryState"]).toBe("rejected");
    expect(candidate?.["promotionRefusalKinds"]).toEqual(["license-blocked"]);
    for (const variant of variants.filter((entry) => entry["variant"] !== "mapanything")) {
      expect(variant["registryState"]).toBe("benchmarked");
      expect(variant["promotionRefusalKinds"]).toEqual([]);
    }
    expect(loadExpectedOutcomes().outcomes["replayEqual"]).toBe(true);
  });

  test("the summary recomputes from the outcomes alone (independent arithmetic)", () => {
    expectCheck("summary-recomputes");
    expect(report.summary.expectedMatches).toBe(12);
    expect(report.summary.byFailureKind).toEqual({
      "resource-exhaustion": 1,
      "unsupported-data": 3,
    });
  });
});

/* ------------------------------------------------------------------ */
/* 2. The behavior matrix (the mandated cells — these FAIL on regression) */
/* ------------------------------------------------------------------ */

describe("HFX-101 mapanything-eval: the behavior matrix (the mandated cells)", () => {
  const { runOutcomes } = loadExpectedOutcomes();
  const outcomeOf = (runId: string): Record<string, unknown> => {
    const found = runOutcomes.find((outcome) => outcome["runId"] === runId);
    if (found === undefined) {
      throw new Error(`no committed outcome for '${runId}'`);
    }
    return found as Record<string, unknown>;
  };

  test("grounded-pass: content within thresholds, the declared per-answer uncertainty, provenance bound", () => {
    expectCheck("behavior-matrix");
    for (const runId of [
      "recon-multiimage-flagship-grounded-001@mapanything",
      "recon-multiimage-midrange-grounded-002@mapanything",
      "recon-registration-twopass-grounded-003@mapanything",
      "depth-metric-wall-grounded-004@mapanything",
    ]) {
      const outcome = outcomeOf(runId);
      expect(outcome["verdict"]).toBe("pass");
      expect(outcome["normalizedStatus"]).toBe("ok");
      expect(outcome["failureObservationKinds"]).toEqual([]);
      const uncertainty = outcome["uncertainty"] as Record<string, unknown>;
      expect(uncertainty["surfaced"]).toBe(true);
      expect(uncertainty["declaredSigmaM"]).toBe(uncertainty["expectedSigmaM"]);
    }
    // the flagship sigma is the capture noise envelope; the depth sigma is the deviation bound:
    const flagship = outcomeOf("recon-multiimage-flagship-grounded-001@mapanything");
    expect((flagship["uncertainty"] as Record<string, unknown>)["declaredSigmaM"]).toBe(0.002);
    const depth = outcomeOf("depth-metric-wall-grounded-004@mapanything");
    expect((depth["uncertainty"] as Record<string, unknown>)["declaredSigmaM"]).toBe(0.005);
    // the derived reconstruction version is addressed and the evidence revisions bound:
    expect(String(flagship["derivedVersionId"])).toMatch(/^drv-[0-9a-f]{24}$/);
    expect(flagship["evidenceRevisions"]).toEqual(["r1", "r2"]);
  });

  test("degraded-evidence: bounded refusals with the capture requirements surfaced (never downgraded geometry)", () => {
    for (const runId of [
      "recon-registration-degraded-overlap-005@mapanything",
      "recon-multiimage-degraded-coverage-006@mapanything",
    ]) {
      const outcome = outcomeOf(runId);
      expect(outcome["verdict"]).toBe("pass");
      expect(outcome["normalizedStatus"]).toBe("failed");
      const failure = outcome["normalizedFailure"] as Record<string, unknown>;
      expect(failure["kind"]).toBe("unsupported-data");
      expect(String(failure["detail"])).toContain("capture requirement");
      expect(String(failure["detail"])).toContain("bounded uncertainty: sigma >= 0.05");
      expect(String(failure["detail"])).toContain("never silently-downgraded geometry");
      const uncertainty = outcome["uncertainty"] as Record<string, unknown>;
      expect(uncertainty["refusalBoundSigmaM"]).toBe(0.05);
    }
    // the coverage refusal names the uncovered surfaces:
    const coverage = outcomeOf("recon-multiimage-degraded-coverage-006@mapanything");
    expect(String((coverage["normalizedFailure"] as Record<string, unknown>)["detail"])).toContain(
      "box_cabinet::zmax",
    );
  });

  test("failed-invocation: the typed resource-exhaustion failure + the explicit non-ready/fallback state, no fabrication", () => {
    const outcome = outcomeOf("recon-multiimage-failed-resource-007@mapanything");
    expect(outcome["verdict"]).toBe("pass");
    expect(outcome["normalizedStatus"]).toBe("failed");
    const failure = outcome["normalizedFailure"] as Record<string, unknown>;
    expect(failure["kind"]).toBe("resource-exhaustion");
    expect(String(failure["detail"])).toContain("non-ready");
    expect(String(failure["detail"])).toContain(DECLARED_FALLBACK);
    expect(String(failure["detail"])).toContain("never fabricated geometry");
    const fallback = outcome["fallbackState"] as Record<string, unknown>;
    expect(fallback["nonReady"]).toBe(true);
    expect(fallback["declaredFallback"]).toBe(DECLARED_FALLBACK);
    expect(fallback["surfaced"]).toBe(true);
    // NO outputs crossed the boundary (the record still carries the failure observation, never silent):
    expect(outcome["failureObservationKinds"]).toEqual(["resource-exhaustion"]);
  });

  test("unsupported-task-combination: the explicit unsupported refusal for an out-of-set task", () => {
    const outcome = outcomeOf("recon-unsupported-novelview-008@mapanything");
    expect(outcome["verdict"]).toBe("pass");
    expect(outcome["normalizedStatus"]).toBe("failed");
    const failure = outcome["normalizedFailure"] as Record<string, unknown>;
    expect(failure["kind"]).toBe("unsupported-data");
    expect(String(failure["detail"])).toContain("novel-view-synthesis");
    expect(String(failure["detail"])).toContain("outside the declared capability set");
    expect(String(failure["detail"])).toContain("never a guess");
  });

  test("the closed vocabulary mirrored here is the frozen 9-kind set", () => {
    expect(CLOSED_FAILURE_KINDS.length).toBe(9);
    expect(CLOSED_FAILURE_KINDS).toContain("unsupported-data");
    expect(CLOSED_FAILURE_KINDS).toContain("resource-exhaustion");
  });
});

/* ------------------------------------------------------------------ */
/* 3. The comparability join (the provider-comparison evidence)         */
/* ------------------------------------------------------------------ */

describe("HFX-101 mapanything-eval: the comparability join", () => {
  test("the per-lane comparisons join the candidate with the reference path on benchmarkId|capability", () => {
    expectCheck("comparability-join");
    const { comparisons } = loadExpectedOutcomes();
    expect(comparisons.length).toBe(2);
    const reconstruction = comparisons.find((entry) => entry["lane"] === "reconstruction") as Record<string, unknown>;
    expect(reconstruction["comparabilityKey"]).toBe("reality-eval-reconstruction/1|reconstruction");
    const depth = comparisons.find((entry) => entry["lane"] === "depth") as Record<string, unknown>;
    expect(depth["comparabilityKey"]).toBe("reality-eval-depth/1|depth");
    for (const comparison of [reconstruction, depth]) {
      const rows = comparison["rows"] as Record<string, unknown>[];
      expect(rows.length).toBe(2);
      expect(rows[0]?.["role"]).toBe("registered-candidate");
      expect(rows[1]?.["role"]).toBe("reference-path");
      expect(rows[0]?.["comparabilityKey"]).toBe(comparison["comparabilityKey"]);
      expect(rows[1]?.["comparabilityKey"]).toBe(comparison["comparabilityKey"]);
      // the declared latency/resource + uncertainty profiles ride along on every row:
      for (const row of rows) {
        const resource = row["resourceProfile"] as Record<string, unknown>;
        expect(typeof resource["latencyMsP50"]).toBe("number");
        expect(typeof resource["memoryMiB"]).toBe("number");
        const uncertainty = row["uncertaintyCharacteristics"] as Record<string, unknown>;
        expect(typeof uncertainty["calibration"]).toBe("string");
      }
    }
  });

  test("the reconstruction-lane metric deltas are EXACTLY 0 (the shared deterministic core)", () => {
    const { comparisons } = loadExpectedOutcomes();
    const reconstruction = comparisons.find((entry) => entry["lane"] === "reconstruction") as Record<string, unknown>;
    const deltas = reconstruction["metricDeltas"] as Record<string, unknown>[];
    expect(deltas.length).toBe(18); // 3 shared tasks × 6 metric names
    for (const delta of deltas) {
      expect(Number(delta["delta"])).toBe(0);
    }
    expect((reconstruction["sharedContentTaskIds"] as string[]).sort()).toEqual([
      "recon-multiimage-flagship-grounded-001",
      "recon-multiimage-midrange-grounded-002",
      "recon-registration-twopass-grounded-003",
    ]);
  });

  test("the depth-lane metric deltas are the documented deviation (non-zero, within thresholds)", () => {
    const { comparisons } = loadExpectedOutcomes();
    const depth = comparisons.find((entry) => entry["lane"] === "depth") as Record<string, unknown>;
    const aggregates = depth["aggregateDeltas"] as Record<string, unknown>[];
    const mae = aggregates.find((entry) => String(entry["metric"]) === "depth_mae_m");
    const max = aggregates.find((entry) => String(entry["metric"]) === "depth_max_error_m");
    expect(Number(mae?.["delta"])).toBeCloseTo(0.00395625, 10);
    expect(Number(max?.["delta"])).toBeCloseTo(0.005, 12);
    expect(Number(mae?.["referenceMean"])).toBe(0);
    expect(Number(max?.["referenceMean"])).toBe(0);
    // both variants' criteria were satisfied (the deviation is within the committed thresholds):
    const criteria = aggregates.find((entry) => String(entry["metric"]) === "criteria_satisfied");
    expect(Number(criteria?.["mapAnythingMean"])).toBe(1);
    expect(Number(criteria?.["referenceMean"])).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 4. The checks are real (sabotage fails loudly)                       */
/* ------------------------------------------------------------------ */

describe("HFX-101 mapanything-eval: the checks discriminate (sabotage fails)", () => {
  test("a sabotaged record (mutated metric value) no longer re-derives its content address", () => {
    const { runOutcomes } = loadExpectedOutcomes();
    const record = structuredClone(runOutcomes[0]!["record"]) as Record<string, unknown>;
    const metrics = record["metrics"] as { value: number }[];
    metrics[0]!.value = metrics[0]!.value + 0.001; // drift the score
    const recordId = record["recordId"] as string;
    const rest = { ...record } as Record<string, unknown>;
    delete rest["recordId"];
    const identityInput = {
      kind: "provider-benchmark-record",
      providerId: rest["providerId"],
      technologyVersion: rest["technologyVersion"],
      benchmarkId: rest["benchmarkId"],
      capability: rest["capability"],
      metrics: rest["metrics"],
      failureObservations: rest["failureObservations"],
      resourceObservations: rest["resourceObservations"],
      reproduction: rest["reproduction"],
    };
    // the committed id re-derives BEFORE the sabotage (the check's own arithmetic):
    const committedRecord = runOutcomes[0]!["record"] as Record<string, unknown>;
    const committedRest = { ...committedRecord };
    delete committedRest["recordId"];
    expect(
      digestOf({
        kind: "provider-benchmark-record",
        providerId: committedRest["providerId"],
        technologyVersion: committedRest["technologyVersion"],
        benchmarkId: committedRest["benchmarkId"],
        capability: committedRest["capability"],
        metrics: committedRest["metrics"],
        failureObservations: committedRest["failureObservations"],
        resourceObservations: committedRest["resourceObservations"],
        reproduction: committedRest["reproduction"],
      }),
    ).toBe(recordId);
    expect(digestOf(identityInput)).not.toBe(recordId);
  });

  test("a smeared failure kind fails the closed-vocabulary doctrine", () => {
    const { runOutcomes } = loadExpectedOutcomes();
    const failed = runOutcomes.find(
      (outcome) => outcome["matrixCell"] === "failed-invocation",
    )!;
    const observations = (failed["record"] as Record<string, unknown>)["failureObservations"] as {
      kind: string;
    }[];
    const original = observations.map((observation) => observation.kind);
    // smear: invent a failure kind on a record that carries a real one:
    const smeared = [...observations, { kind: "hallucinated-geometry", detail: "invented" }];
    const vocabulary = new Set<string>(CLOSED_FAILURE_KINDS);
    expect(smeared.some((observation) => !vocabulary.has(observation.kind))).toBe(true);
    expect(original.every((kind) => vocabulary.has(kind))).toBe(true);
  });

  test("both committed artifacts are canonical (byte-stable, idempotent under the sorted-keys form)", () => {
    expectCheck("canonical-form");
    const { suite, outcomes } = { suite: loadScenarioSuite().suite, outcomes: loadExpectedOutcomes().outcomes };
    for (const value of [suite, outcomes]) {
      const text = JSON.stringify(sortValue(value), null, 2) + "\n";
      expect(digestOf(value)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });
});
