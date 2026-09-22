/**
 * PROD-029 harness tests — the substitution matrix (the day-26/27 gates):
 * every equal substitution is PROVEN canonically equal; every divergent
 * substitution is CAUGHT with the RIGHT closed-vocabulary failure kind;
 * every refusal path is typed; the control-plane emission (record +
 * manifest + registry events) is valid and lawful; the whole harness is
 * deterministic.
 */

import { describe, expect, test } from "bun:test";
import {
  applyRegistryEvent,
  benchmarkRecordDigestOf,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
  replayRegistry,
} from "@aise/provider-registry";
import { evaluateSubstitution } from "./harness";
import type { SubstitutionEvaluation } from "./harness";
import { canonicalRegistryLog, committedScenarioMatrix } from "./fixtures";
import {
  crossSeamSubstituteScenario,
  missingExecutionScenario,
  registeredOnlyLog,
  smuggledProviderFieldScenario,
  unknownOutputFieldScenario,
  unknownSubstituteScenario,
  unlawfulLog,
} from "./testkit";

const LOG = canonicalRegistryLog();

function scenarioOf(scenarioId: string) {
  const scenario = committedScenarioMatrix().find((entry) => entry.scenarioId === scenarioId);
  if (scenario === undefined) {
    throw new Error(`harness test: scenario '${scenarioId}' missing`);
  }
  return scenario;
}

async function evaluate(scenarioId: string): Promise<SubstitutionEvaluation> {
  return evaluateSubstitution(scenarioOf(scenarioId), LOG);
}

async function evaluateScenario(scenario: Parameters<typeof evaluateSubstitution>[0]) {
  return evaluateSubstitution(scenario, LOG);
}

/* ------------------------------------------------------------------ */
/* The equal substitutions (substitution-proven)                          */
/* ------------------------------------------------------------------ */

describe("solution-eval harness: equal substitutions are PROVEN", () => {
  test("the faithful compiler substitution proves every operation identity equal", async () => {
    const evaluation = await evaluate("layer3-compiler-faithful-001");
    expect(evaluation.verdict).toBe("substitution-proven");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.comparisonPoints).toHaveLength(3);
    for (const point of evaluation.comparisonPoints) {
      expect(point.pointKind).toBe("operation-identity");
      expect(point.equal).toBe(true);
      expect(typeof point.baselineValue).toBe("string");
      expect(typeof point.substitutedValue).toBe("string");
    }
    expect(evaluation.divergence).toBeUndefined();
    expect(evaluation.refusal).toBeUndefined();
  });

  test("the faithful engine substitution proves state digests AND quantities equal", async () => {
    const evaluation = await evaluate("layer3-engine-faithful-001");
    expect(evaluation.verdict).toBe("substitution-proven");
    expect(evaluation.expectationSatisfied).toBe(true);
    const digests = evaluation.comparisonPoints.filter((p) => p.pointKind === "state-digest");
    const quantities = evaluation.comparisonPoints.filter((p) => p.pointKind === "quantity-value");
    expect(digests).toHaveLength(3);
    expect(quantities).toHaveLength(7);
    for (const point of evaluation.comparisonPoints) {
      expect(point.equal).toBe(true);
    }
  });

  test("the faithful validation substitution proves the verdicts equal", async () => {
    const evaluation = await evaluate("layer3-validation-faithful-001");
    expect(evaluation.verdict).toBe("substitution-proven");
    expect(evaluation.expectationSatisfied).toBe(true);
    // 1 outcome point + 7 per-check points
    expect(evaluation.comparisonPoints).toHaveLength(8);
    for (const point of evaluation.comparisonPoints) {
      expect(point.pointKind).toBe("validation-verdict");
      expect(point.equal).toBe(true);
    }
  });

  test("the faithful BOQ substitution proves all seven lines equal", async () => {
    const evaluation = await evaluate("layer3-boq-faithful-001");
    expect(evaluation.verdict).toBe("substitution-proven");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.comparisonPoints).toHaveLength(7);
    for (const point of evaluation.comparisonPoints) {
      expect(point.pointKind).toBe("boq-line");
      expect(point.equal).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The divergent substitutions (CAUGHT with the right failure kind)       */
/* ------------------------------------------------------------------ */

describe("solution-eval harness: divergent substitutions are CAUGHT", () => {
  test("the compiler thickness misread is caught as operation-semantic-failure at the identity point", async () => {
    const evaluation = await evaluate("layer3-compiler-divergent-001");
    expect(evaluation.verdict).toBe("divergence-recorded");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.divergence?.failureKind).toBe("operation-semantic-failure");
    expect(evaluation.divergence?.failureKinds).toEqual(["operation-semantic-failure"]);
    const diverging = evaluation.comparisonPoints.filter((point) => !point.equal);
    expect(diverging).toHaveLength(1);
    expect(diverging[0]?.subjectId).toBe("REP-BLOCK-001");
    expect(diverging[0]?.pointKind).toBe("operation-identity");
    expect(diverging[0]?.divergenceKind).toBe("operation-semantic-failure");
    expect(diverging[0]?.baselineValue).not.toBe(diverging[0]?.substitutedValue);
    // the two faithful utterances stay equal — one divergence, not a blanket failure
    const equal = evaluation.comparisonPoints.filter((point) => point.equal);
    expect(equal.map((point) => point.subjectId)).toEqual(["REP-EXC-001", "REP-PLASTER-001"]);
  });

  test("the engine's subtly-divergent final state is caught at the state-digest point", async () => {
    const evaluation = await evaluate("layer3-engine-divergent-001");
    expect(evaluation.verdict).toBe("divergence-recorded");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.divergence?.failureKind).toBe("operation-semantic-failure");
    const diverging = evaluation.comparisonPoints.filter((point) => !point.equal);
    expect(diverging).toHaveLength(1);
    expect(diverging[0]?.pointKind).toBe("state-digest");
    expect(diverging[0]?.subjectId).toBe("step-3");
    // steps 1–2 and every quantity stay equal — the deviation is isolated and precise
    expect(evaluation.comparisonPoints.filter((p) => p.pointKind === "state-digest" && p.equal)).toHaveLength(2);
    expect(evaluation.comparisonPoints.filter((p) => p.pointKind === "quantity-value" && p.equal)).toHaveLength(7);
  });

  test("the validation disagreement is caught as reasoning-failure (verdict + check)", async () => {
    const evaluation = await evaluate("layer3-validation-divergent-001");
    expect(evaluation.verdict).toBe("divergence-recorded");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.divergence?.failureKind).toBe("reasoning-failure");
    expect(evaluation.divergence?.failureKinds).toEqual(["reasoning-failure"]);
    const diverging = evaluation.comparisonPoints.filter((point) => !point.equal);
    expect(diverging).toHaveLength(2);
    expect(diverging.map((point) => point.subjectId)).toEqual([
      "validation-outcome",
      "check:operation.phase1-limits",
    ]);
    expect(diverging[0]?.baselineValue).toBe("pass");
    expect(diverging[0]?.substitutedValue).toBe("review-needed");
  });

  test("the BOQ block-count deviation is caught as operation-semantic-failure (65 vs 64)", async () => {
    const evaluation = await evaluate("layer3-boq-divergent-001");
    expect(evaluation.verdict).toBe("divergence-recorded");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.divergence?.failureKind).toBe("operation-semantic-failure");
    const diverging = evaluation.comparisonPoints.filter((point) => !point.equal);
    expect(diverging).toHaveLength(1);
    expect(diverging[0]?.subjectId).toBe("block-wall-placement:count");
    expect(diverging[0]?.baselineValue).toBe(65);
    expect(diverging[0]?.substitutedValue).toBe(64);
  });
});

/* ------------------------------------------------------------------ */
/* The control-plane emission                                            */
/* ------------------------------------------------------------------ */

describe("solution-eval harness: the control-plane emission", () => {
  test("every evaluated scenario emits a valid, content-addressed BenchmarkRecord", async () => {
    for (const scenario of committedScenarioMatrix()) {
      const evaluation = await evaluateScenario(scenario);
      expect(evaluation.benchmarkRecord).toBeDefined();
      const record = evaluation.benchmarkRecord;
      if (record === undefined) {
        continue;
      }
      const validation = validateBenchmarkRecord(record);
      expect(validation.ok).toBe(true);
      expect(record.benchmarkId).toBe("layer3-substitution-eval/1");
      expect(record.capability).toBe(`layer3-${scenario.seam}`);
      expect(record.providerId).toBe(scenario.substitute.providerId);
      // the comparability key is stable per seam (the HFX-401 scorecard joins on it)
      expect(`${record.benchmarkId}|${record.capability}`).toBe(
        `layer3-substitution-eval/1|layer3-${scenario.seam}`,
      );
      expect(record.metrics.length).toBe(5);
      expect(record.reproduction.inputsDigest).toHaveLength(64);
      expect(benchmarkRecordDigestOf(record)).toHaveLength(64);
    }
  });

  test("a proven substitution emits NO failure observations (an empty list is honest)", async () => {
    const evaluation = await evaluate("layer3-compiler-faithful-001");
    expect(evaluation.benchmarkRecord?.failureObservations).toEqual([]);
    const provenMetric = evaluation.benchmarkRecord?.metrics.find(
      (metric) => metric.metric === "substitution_proven",
    );
    expect(provenMetric?.value).toBe(1);
  });

  test("a divergent substitution records its failure observations from the CLOSED vocabulary", async () => {
    const evaluation = await evaluate("layer3-validation-divergent-001");
    const observations = evaluation.benchmarkRecord?.failureObservations ?? [];
    expect(observations).toHaveLength(2);
    for (const observation of observations) {
      expect(observation.kind).toBe("reasoning-failure");
      expect(observation.detail.length).toBeGreaterThan(0);
    }
  });

  test("every evaluated scenario seals a digest-verifiable portable ProvenanceManifest", async () => {
    for (const scenario of committedScenarioMatrix()) {
      const evaluation = await evaluateScenario(scenario);
      expect(evaluation.provenanceManifest).toBeDefined();
      const manifest = evaluation.provenanceManifest;
      if (manifest === undefined) {
        continue;
      }
      const verification = verifyProvenanceManifest(manifest);
      expect(verification.ok).toBe(true);
      expect(manifest.profileReference.providerId).toBe(scenario.substitute.providerId);
      expect(manifest.consumerIdentity.surface).toBe("layer3-substitution-eval");
      expect(manifest.inputDigests.length).toBeGreaterThan(0);
      expect(manifest.benchmarkRecordReferences).toHaveLength(1);
    }
  });

  test("the derived registry events apply LAWFULLY to the replayed registry", async () => {
    const evaluation = await evaluate("layer3-engine-faithful-001");
    const replayed = replayRegistry(LOG);
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) {
      return;
    }
    let registry = replayed.registry;
    for (const event of evaluation.registryEvents) {
      const applied = applyRegistryEvent(registry, event);
      expect(applied.ok).toBe(true);
      if (applied.ok) {
        registry = applied.registry;
      }
    }
    // execution-normalized × inputs + benchmark-recorded + provenance-sealed
    expect(evaluation.registryEvents).toHaveLength(5);
    const entry = registry.entryOf(
      evaluation.substitute.providerId,
      evaluation.substitute.technologyVersion,
    );
    expect(entry?.state).toBe("benchmarked");
    expect(entry?.benchmarkRecords).toHaveLength(1);
    expect(entry?.provenanceManifests).toHaveLength(1);
  });

  test("a refused evaluation emits NO record, manifest or events", async () => {
    const evaluation = await evaluateScenario(unknownSubstituteScenario());
    expect(evaluation.verdict).toBe("substitution-refused");
    expect(evaluation.benchmarkRecord).toBeUndefined();
    expect(evaluation.provenanceManifest).toBeUndefined();
    expect(evaluation.registryEvents).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The refusal paths (typed, machine-readable)                           */
/* ------------------------------------------------------------------ */

describe("solution-eval harness: the typed refusal paths", () => {
  test("an unregistered substitute is refused (provider-not-registered)", async () => {
    const evaluation = await evaluateScenario(unknownSubstituteScenario());
    expect(evaluation.verdict).toBe("substitution-refused");
    expect(evaluation.refusal?.kind).toBe("provider-not-registered");
    expect(evaluation.refusal?.detail).toContain("9.9.9-fixture-unregistered");
    expect(evaluation.expectationSatisfied).toBe(false);
  });

  test("a lawful-but-incomplete registry log is refused (evaluation-not-started)", async () => {
    const scenario = scenarioOf("layer3-boq-faithful-001");
    const evaluation = await evaluateSubstitution(scenario, registeredOnlyLog());
    expect(evaluation.verdict).toBe("substitution-refused");
    expect(evaluation.refusal?.kind).toBe("evaluation-not-started");
  });

  test("an unlawful registry log is refused (registry-log-refused)", async () => {
    const scenario = scenarioOf("layer3-boq-faithful-001");
    const evaluation = await evaluateSubstitution(scenario, unlawfulLog() as never);
    expect(evaluation.verdict).toBe("substitution-refused");
    expect(evaluation.refusal?.kind).toBe("registry-log-refused");
  });

  test("a cross-seam substitute profile is refused (seam-capability-mismatch)", async () => {
    const evaluation = await evaluateScenario(crossSeamSubstituteScenario());
    expect(evaluation.verdict).toBe("substitution-refused");
    expect(evaluation.refusal?.kind).toBe("seam-capability-mismatch");
    expect(evaluation.refusal?.detail).toContain("layer3-boq-derivation");
  });

  test("a declared run missing an input's execution is refused (missing-declared-execution)", async () => {
    const evaluation = await evaluateScenario(missingExecutionScenario());
    expect(evaluation.verdict).toBe("substitution-refused");
    expect(evaluation.refusal?.kind).toBe("missing-declared-execution");
    expect(evaluation.refusal?.detail).toContain("REP-BLOCK-001");
  });
});

/* ------------------------------------------------------------------ */
/* The canonical-boundary guard in the harness (the D26 proof)           */
/* ------------------------------------------------------------------ */

describe("solution-eval harness: the canonical-boundary guard", () => {
  test("a provider-specific field smuggled inside the semantics is caught as contract-mismatch", async () => {
    const evaluation = await evaluateScenario(smuggledProviderFieldScenario());
    expect(evaluation.verdict).toBe("divergence-recorded");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.divergence?.failureKind).toBe("contract-mismatch");
    const diverging = evaluation.comparisonPoints.filter((point) => !point.equal);
    expect(diverging).toHaveLength(1);
    expect(diverging[0]?.substitutedValue).toBe("(shape-refused)");
    expect(diverging[0]?.divergenceKind).toBe("contract-mismatch");
    expect(diverging[0]?.detail).toContain("vendorOperationRef");
  });

  test("an undeclared provider output field is refused by the closed output contract", async () => {
    const evaluation = await evaluateScenario(unknownOutputFieldScenario());
    expect(evaluation.verdict).toBe("divergence-recorded");
    expect(evaluation.expectationSatisfied).toBe(true);
    expect(evaluation.divergence?.failureKind).toBe("contract-mismatch");
    const diverging = evaluation.comparisonPoints.filter((point) => !point.equal);
    expect(diverging[0]?.substitutedValue).toBe("(shape-refused)");
  });

  test("comparison points only ever carry canonical scalar values (string | number)", async () => {
    for (const scenario of committedScenarioMatrix()) {
      const evaluation = await evaluateScenario(scenario);
      for (const point of evaluation.comparisonPoints) {
        const baseline = point.baselineValue;
        const substituted = point.substitutedValue;
        expect(
          typeof baseline === "string" || typeof baseline === "number",
        ).toBe(true);
        expect(
          typeof substituted === "string" || typeof substituted === "number",
        ).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Determinism                                                          */
/* ------------------------------------------------------------------ */

describe("solution-eval harness: determinism", () => {
  test("the same scenario + log evaluate to the byte-identical outcome", async () => {
    const first = await evaluate("layer3-boq-divergent-001");
    const second = await evaluate("layer3-boq-divergent-001");
    expect(first).toEqual(second);
    expect(first.benchmarkRecord?.recordId).toBe(second.benchmarkRecord?.recordId);
    expect(first.provenanceManifest?.manifestId).toBe(second.provenanceManifest?.manifestId);
  });

  test("the compiler seam is deterministic (no clock leakage into identities)", async () => {
    const first = await evaluate("layer3-compiler-faithful-001");
    const second = await evaluate("layer3-compiler-faithful-001");
    expect(first.comparisonPoints).toEqual(second.comparisonPoints);
    expect(first.benchmarkRecord?.recordId).toBe(second.benchmarkRecord?.recordId);
  });

  test("the committed scenario inputs digest is stable", async () => {
    const first = await evaluate("layer3-engine-divergent-001");
    const second = await evaluate("layer3-engine-divergent-001");
    expect(first.benchmarkRecord?.reproduction.inputsDigest).toBe(
      second.benchmarkRecord?.reproduction.inputsDigest,
    );
  });
});
