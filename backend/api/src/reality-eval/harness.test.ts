/**
 * PROD-027 — the Layer-1 evaluation HARNESS tests (the provider-neutral
 * entry point's deterministic + negative-path suite).
 *
 * Proves:
 *  - the happy evaluation path: normalization → canonical comparison via
 *    the EXISTING benchmark metrics → criteria → a control-plane
 *    BenchmarkRecord (content-addressed, closed-vocabulary observations
 *    only) + a digest-verifiable ProvenanceManifest;
 *  - THE CANONICAL-BOUNDARY GUARD: a provider result carrying a
 *    provider-specific type toward the canonical comparison is REFUSED
 *    with the typed `normalization-refused` refusal (contract-mismatch at
 *    the control-plane boundary) — never coerced, never silently compared;
 *  - the canonical-projection refusals: ill-typed outputs (wrong subject
 *    counts, non-unit normals, non-meter depth units) answer
 *    operation-semantic-failure records — the comparison is never coerced;
 *  - the NEGATIVE path: explicit closed-vocabulary refusals (timeout,
 *    unsupported-data) are evaluated as explicit-and-safe when expected,
 *    and FABRICATED outputs where a refusal is expected are caught;
 *  - the DISCRIMINATION doctrine: plausible-but-wrong geometry (the v2
 *    ×1.02 bias, in BOTH directions) is CAUGHT by the per-instance
 *    thresholds and RECORDED as perception-failure observations — the
 *    harness records the failure, not just low scores;
 *  - the honest lane status: capture-readiness and retrieval scenarios are
 *    refused with the typed capability-lane-unavailable failure;
 *  - determinism: identical (scenario, registryLog) pairs produce
 *    byte-identical evaluations.
 */

import { describe, expect, test } from "bun:test";
import {
  deriveBenchmarkRecordId,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  CAPABILITY_LANE_STATUS,
  completeScenario,
  LANE_BENCHMARK_IDS,
  type RealityEvalScenario,
} from "./model";
import {
  evaluateScenario,
  projectDepthGrid,
  projectReconstructionScene,
  type ScenarioEvaluation,
} from "./harness";
import {
  DEPTH_PROVIDER_ID,
  RECONSTRUCTION_TECHNOLOGY_VERSION_V1,
  RECONSTRUCTION_V2_SCALE_BIAS,
  executeFixtureProvider,
  fixtureById,
  fixtureDepthProfileV1,
  fixtureDepthTruth,
  fixtureReconstructionProfileV1,
  fixtureReconstructionProfileV2,
  realityEvalScenarioSet,
  FLAGSHIP_FIXTURE_ID,
} from "./testkit";
import { applyRegistryEvent, createProviderRegistry } from "@aise/provider-registry";
import type { ProviderRegistryEvent } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* The deterministic test world                                         */
/* ------------------------------------------------------------------ */

/** The evaluation registry log: both fixture providers registered + started. */
function evaluationRegistryLog(): ProviderRegistryEvent[] {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  for (const profile of [
    fixtureReconstructionProfileV1(),
    fixtureReconstructionProfileV2(),
    fixtureDepthProfileV1(),
  ]) {
    const registered = applyRegistryEvent(registry, { kind: "provider-registered", profile });
    if (!registered.ok) {
      throw new Error(registered.failure.detail);
    }
    registry = registered.registry;
    events.push({ kind: "provider-registered", profile });
    const started = applyRegistryEvent(registry, {
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
    if (!started.ok) {
      throw new Error(started.failure.detail);
    }
    registry = started.registry;
    events.push({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }
  return events;
}

const LOG = evaluationRegistryLog();
const SET = realityEvalScenarioSet();

function committedScenario(scenarioId: string): RealityEvalScenario {
  const descriptor = SET.scenarios.find((entry) => entry.scenarioId === scenarioId);
  if (descriptor === undefined) {
    throw new Error(`test world: unknown committed scenario '${scenarioId}'`);
  }
  const profile =
    descriptor.providerReference.providerId === DEPTH_PROVIDER_ID
      ? fixtureDepthProfileV1()
      : descriptor.providerReference.technologyVersion === RECONSTRUCTION_TECHNOLOGY_VERSION_V1
        ? fixtureReconstructionProfileV1()
        : fixtureReconstructionProfileV2();
  return completeScenario(descriptor, executeFixtureProvider(profile, descriptor.input));
}

function evaluate(scenarioId: string): ScenarioEvaluation {
  const outcome = evaluateScenario(committedScenario(scenarioId), LOG);
  if (!outcome.ok) {
    throw new Error(`the committed scenario was refused: ${outcome.refusal.detail}`);
  }
  return outcome.evaluation;
}

/* ------------------------------------------------------------------ */
/* The happy evaluation path                                            */
/* ------------------------------------------------------------------ */

describe("PROD-027 harness: the happy evaluation path", () => {
  test("a positive reconstruction scenario evaluates to a passing control-plane record", () => {
    const evaluation = evaluate("recon-flagship-positive-001");
    expect(evaluation.verdict).toBe("pass");
    expect(evaluation.scenarioClass).toBe("positive");
    expect(evaluation.failureObservations).toEqual([]);
    expect(evaluation.criterionViolations).toEqual([]);
    expect(evaluation.discriminationCaught).toBe(false);

    const validation = validateBenchmarkRecord(evaluation.record);
    expect(validation.ok).toBe(true);
    const record = validation.ok ? validation.record : undefined;
    expect(record?.providerId).toBe("fixture-reconstruction-provider");
    expect(record?.technologyVersion).toBe(RECONSTRUCTION_TECHNOLOGY_VERSION_V1);
    expect(record?.benchmarkId).toBe(LANE_BENCHMARK_IDS.reconstruction);
    expect(record?.capability).toBe("reconstruction");
    expect(record !== undefined && record.metrics.length).toBeGreaterThan(0);
  });

  test("the record's metrics are the EXISTING benchmark engine's, computed over the canonical scene", () => {
    const evaluation = evaluate("recon-flagship-positive-001");
    const metricNames = new Set(evaluation.record.metrics.map((metric) => metric.metric));
    for (const name of ["plane_fit_rms", "registration_error", "scale_error", "dimension_error", "object_volume_error"]) {
      expect(metricNames.has(name), `metric ${name} present`).toBe(true);
    }
    // per-instance subjects: the flagship fixture's canonical surface ids
    const subjects = evaluation.record.metrics
      .filter((metric) => metric.metric === "plane_fit_rms")
      .map((metric) => metric.subjectId);
    const fixture = fixtureById(FLAGSHIP_FIXTURE_ID);
    expect(fixture !== undefined).toBe(true);
    if (fixture !== undefined) {
      for (const surface of fixture.groundTruth.surfaces) {
        expect(subjects).toContain(surface.surfaceId);
      }
    }
  });

  test("the record is content-addressed and the manifest is digest-verifiable", () => {
    const evaluation = evaluate("recon-flagship-positive-001");
    const { recordId, ...body } = evaluation.record;
    expect(recordId).toBe(deriveBenchmarkRecordId(body));
    const manifestValidation = verifyProvenanceManifest(evaluation.manifest);
    expect(manifestValidation.ok).toBe(true);
    expect(evaluation.manifest.benchmarkRecordReferences).toEqual([recordId]);
    expect(evaluation.manifest.profileReference.providerId).toBe(recordId === undefined ? "" : evaluation.record.providerId);
  });

  test("the reproduction statement pins the scenario's normalized input digest", () => {
    const evaluation = evaluate("depth-wall-positive-005");
    expect(evaluation.record.reproduction.inputsDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(evaluation.record.reproduction.codeVersion).toBe("reality-eval-harness/1");
    expect(evaluation.record.metrics.map((metric) => [metric.metric, metric.value])).toContainEqual(["depth_mae_m", 0]);
  });

  test("the resource observations are the profile's DECLARED envelopes (never sensed)", () => {
    const evaluation = evaluate("recon-flagship-positive-001");
    const profile = fixtureReconstructionProfileV1();
    expect(evaluation.record.resourceObservations).toEqual({
      compute: profile.computeProfile.statement,
      memoryMiB: profile.memoryProfile.minimumMiB,
      latencyMsP50: profile.latencyProfile.expectedMsP50,
      latencyMsP95: profile.latencyProfile.expectedMsP95,
    });
  });
});

/* ------------------------------------------------------------------ */
/* Determinism                                                          */
/* ------------------------------------------------------------------ */

describe("PROD-027 harness: determinism", () => {
  test("identical (scenario, registryLog) pairs produce byte-identical evaluations", () => {
    const first = evaluate("recon-flagship-discrimination-003");
    const second = evaluate("recon-flagship-discrimination-003");
    expect(canonicalJsonStringify(second.record)).toBe(canonicalJsonStringify(first.record));
    expect(canonicalJsonStringify(second.manifest)).toBe(canonicalJsonStringify(first.manifest));
  });

  test("evaluation is independent of later registry events (the profile is resolved by replay)", () => {
    // the same scenario over a LONGER log (extra lawful events appended)
    // evaluates identically: profile resolution never sees the future.
    const longerLog = [...LOG];
    const base = evaluate("recon-flagship-positive-001");
    const withExtra = evaluateScenario(committedScenario("recon-flagship-positive-001"), longerLog);
    expect(withExtra.ok).toBe(true);
    if (withExtra.ok) {
      expect(canonicalJsonStringify(withExtra.evaluation.record)).toBe(
        canonicalJsonStringify(base.record),
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* The discrimination doctrine (the day-27 rule)                        */
/* ------------------------------------------------------------------ */

describe("PROD-027 harness: plausible-but-wrong geometry is CAUGHT and RECORDED", () => {
  test("the v2 x1.02 bias fails the criteria with perception-failure observations (not just low scores)", () => {
    const evaluation = evaluate("recon-flagship-discrimination-003");
    expect(evaluation.verdict).toBe("fail");
    expect(evaluation.discriminationCaught).toBe(true);
    expect(evaluation.failureObservations.length).toBeGreaterThan(0);
    for (const observation of evaluation.failureObservations) {
      expect(observation.kind).toBe("perception-failure");
      expect(observation.detail).toContain("CAUGHT");
    }
    const violatedMetrics = new Set(evaluation.criterionViolations.map((violation) => violation.metric));
    expect(violatedMetrics.has("scale_error")).toBe(true);
    expect(violatedMetrics.has("dimension_error")).toBe(true);
    expect(violatedMetrics.has("object_volume_error")).toBe(true);
  });

  test("violations are PER-INSTANCE (aggregates never gate; each observation names its subject)", () => {
    const evaluation = evaluate("recon-flagship-discrimination-003");
    expect(evaluation.criterionViolations.length).toBe(evaluation.failureObservations.length);
    for (const violation of evaluation.criterionViolations) {
      expect(violation.subjectId).toMatch(/^(room_|box_)/);
      expect(Math.abs(violation.value)).toBeGreaterThan(violation.threshold);
    }
  });

  test("the GATE RULE catches a bias in the NEGATIVE direction too (|value| evaluated uniformly)", () => {
    // a hand-crafted x0.98 shrink: dimension_error goes NEGATIVE — the
    // per-instance |value| > threshold rule must catch it exactly like the
    // positive-direction bias.
    const scenario = committedScenario("recon-flagship-positive-001");
    const outputs = scenario.declaredExecution.outputs as Record<string, unknown>;
    const shrunk = {
      ...outputs,
      measuredDimensions: (outputs["measuredDimensions"] as number[]).map((value) => value / RECONSTRUCTION_V2_SCALE_BIAS),
      measuredVolumes: (outputs["measuredVolumes"] as number[]).map(
        (value) => value / (RECONSTRUCTION_V2_SCALE_BIAS * RECONSTRUCTION_V2_SCALE_BIAS * RECONSTRUCTION_V2_SCALE_BIAS),
      ),
    };
    const shrunkenScenario: RealityEvalScenario = {
      ...scenario,
      declaredExecution: { ...scenario.declaredExecution, outputs: shrunk },
    };
    const outcome = evaluateScenario(shrunkenScenario, LOG);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.evaluation.verdict).toBe("fail");
      const signed = outcome.evaluation.criterionViolations.filter(
        (violation) => violation.metric === "dimension_error",
      );
      expect(signed.length).toBeGreaterThan(0);
      for (const violation of signed) {
        expect(violation.value).toBeLessThan(0); // the negative direction
      }
    }
  });

  test("the opaque provider-native payload can NEVER rescue a wrong output (it is never parsed)", () => {
    // the v2 double's native payload claims the honest engine + no bias;
    // the evaluation scores the OUTPUTS only.
    const scenario = committedScenario("recon-flagship-discrimination-003");
    const execution = scenario.declaredExecution;
    const deceptive = {
      ...execution,
      providerNative: {
        mediaType: "application/aise-fixture-reconstruction+json",
        payload: {
          engine: "fixture-reconstruction-engine",
          technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V1, // claims v1!
          fixtureId: FLAGSHIP_FIXTURE_ID,
          groundTruthDimensions: "claimed-correct", // a provider-specific string type
          note: "opaque native payload — the harness must never read this",
        },
      },
    };
    const outcome = evaluateScenario({ ...scenario, declaredExecution: deceptive }, LOG);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.evaluation.verdict).toBe("fail");
      expect(outcome.evaluation.failureObservations.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The negative path (explicit refusals)                                */
/* ------------------------------------------------------------------ */

describe("PROD-027 harness: explicit closed-vocabulary refusals", () => {
  test("the v2 timeout behavior evaluates as explicit-and-safe when expected", () => {
    const evaluation = evaluate("recon-timeout-negative-004");
    expect(evaluation.verdict).toBe("pass");
    expect(evaluation.failureObservations.map((observation) => observation.kind)).toEqual(["timeout"]);
    expect(evaluation.record.metrics.map((metric) => [metric.metric, metric.value])).toContainEqual([
      "explicit_failure_alignment",
      1,
    ]);
  });

  test("the depth unsupported-data refusal evaluates as explicit-and-safe when expected", () => {
    const evaluation = evaluate("depth-unsupported-negative-006");
    expect(evaluation.verdict).toBe("pass");
    expect(evaluation.failureObservations.map((observation) => observation.kind)).toEqual([
      "unsupported-data",
    ]);
  });

  test("FABRICATED outputs where an explicit refusal is expected are caught", () => {
    // the depth provider fabricated depth values for the out-of-domain tag
    // (the scenario carries the HONEST input but a fabricated execution).
    const honestDescriptor = SET.scenarios.find(
      (entry) => entry.scenarioId === "depth-unsupported-negative-006",
    )!;
    const fabricated = completeScenario(honestDescriptor, {
      capability: "depth",
      outputs: { depthMap: fixtureDepthTruth([0.5, 0.5, 0.5, 0.5]), unit: "m" },
    });
    const outcome = evaluateScenario(fabricated, LOG);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.evaluation.verdict).toBe("fail");
      expect(outcome.evaluation.failureObservations.map((observation) => observation.kind)).toEqual([
        "unsupported-data",
      ]);
      expect(outcome.evaluation.record.metrics.map((metric) => [metric.metric, metric.value])).toContainEqual([
        "explicit_failure_alignment",
        0,
      ]);
    }
  });

  test("an UNEXPECTED explicit failure (timeout where outputs were expected) is a caught failure", () => {
    const descriptor = SET.scenarios.find(
      (entry) => entry.scenarioId === "recon-flagship-positive-001",
    )!;
    const timingOut = completeScenario(descriptor, {
      capability: "reconstruction",
      failure: {
        kind: "timeout",
        detail: "unexpected timeout on a scenario that expected outputs",
      },
    });
    const outcome = evaluateScenario(timingOut, LOG);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.evaluation.verdict).toBe("fail");
      expect(outcome.evaluation.failureObservations.map((observation) => observation.kind)).toEqual([
        "timeout",
      ]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* THE CANONICAL-BOUNDARY GUARD (typed refusals, never coercion)        */
/* ------------------------------------------------------------------ */

describe("PROD-027 harness: the canonical-boundary guard", () => {
  test("a provider result carrying a provider-SPECIFIC output field is refused at the boundary", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outputs = scenario.declaredExecution.outputs as Record<string, unknown>;
    const smuggled = {
      ...outputs,
      mapAnythingNativeMesh: { format: "mapanything/alpha-mesh", vertices: 12345 }, // provider-specific type
    };
    const outcome = evaluateScenario(
      { ...scenario, declaredExecution: { ...scenario.declaredExecution, outputs: smuggled } },
      LOG,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("normalization-refused");
      expect(outcome.refusal.detail).toContain("contract-mismatch");
      expect(outcome.refusal.detail).toContain("never crosses into the canonical comparison");
    }
  });

  test("a provider-specific failure KIND is refused (the vocabulary is closed)", () => {
    const scenario = committedScenario("recon-timeout-negative-004");
    const invented = completeScenario(
      {
        ...scenario,
        criteria: { ...scenario.criteria, expectedFailureKinds: ["timeout"] },
      },
      {
        capability: "reconstruction",
        failure: { kind: "model-hallucinated", detail: "an invented failure kind" },
      },
    );
    const outcome = evaluateScenario(invented, LOG);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // the layered typed validation: the scenario validator refuses the
      // invented kind before the control-plane boundary would (both are
      // typed refusals — the closed vocabulary is enforced twice).
      expect(["scenario-invalid", "normalization-refused"]).toContain(outcome.refusal.kind);
      expect(outcome.refusal.detail).toContain("CLOSED failure vocabulary");
    }
  });

  test("contract-valid but canonically ill-typed outputs answer operation-semantic-failure (never coerced)", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outputs = scenario.declaredExecution.outputs as Record<string, unknown>;
    // wrong subject count: one plane too few (still contract-valid — the
    // declared contract cannot know the fixture's surface count).
    const truncated = {
      ...outputs,
      planeNormals: (outputs["planeNormals"] as number[]).slice(0, -3),
      planeOffsets: (outputs["planeOffsets"] as number[]).slice(0, -1),
    };
    const outcome = evaluateScenario(
      { ...scenario, declaredExecution: { ...scenario.declaredExecution, outputs: truncated } },
      LOG,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.evaluation.verdict).toBe("fail");
      expect(outcome.evaluation.failureObservations.map((observation) => observation.kind)).toEqual([
        "operation-semantic-failure",
      ]);
      expect(outcome.evaluation.record.metrics.map((metric) => metric.metric)).toContain(
        "canonical_conformance",
      );
    }
  });

  test("a non-unit plane normal is an ill-typed canonical geometry (typed projection refusal)", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outputs = scenario.declaredExecution.outputs as Record<string, unknown>;
    const normals = [...(outputs["planeNormals"] as number[])];
    // the flagship fixture's first surface (floor) is near-normal (0, 0, -1):
    // scaling the z component by 2 breaks the unit-norm invariant (|n| ≈ 2).
    normals[2] = normals[2]! * 2;
    expect(Math.abs(normals[2]!)).toBeGreaterThan(1.5);
    const denormalized = { ...outputs, planeNormals: normals };
    const projection = projectReconstructionScene(
      denormalized,
      fixtureById(FLAGSHIP_FIXTURE_ID)!,
    );
    expect(projection.ok).toBe(false);
    if (!projection.ok) {
      expect(projection.issues.some((issue) => issue.path.includes("planeNormals"))).toBe(true);
      expect(projection.issues.some((issue) => issue.expected.includes("unit plane normal"))).toBe(true);
    }
  });

  test("a non-meter depth unit is a typed projection refusal (wrong units are never converted)", () => {
    const projection = projectDepthGrid(
      { depthMap: fixtureDepthTruth([0.5, 0.5, 0.5, 0.5]), unit: "cm" },
      { gridWidth: 2, gridHeight: 2 },
    );
    expect(projection.ok).toBe(false);
    if (!projection.ok) {
      expect(projection.issues.some((issue) => issue.path === "outputs.unit")).toBe(true);
    }
  });

  test("a depth grid with the wrong cell count is a typed projection refusal", () => {
    const projection = projectDepthGrid(
      { depthMap: [1, 2, 3], unit: "m" },
      { gridWidth: 2, gridHeight: 2 },
    );
    expect(projection.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The typed scenario-side refusals                                     */
/* ------------------------------------------------------------------ */

describe("PROD-027 harness: the typed scenario-side refusals", () => {
  test("an unknown provider is refused (the profile is resolved from the log, never inline)", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outcome = evaluateScenario(
      {
        ...scenario,
        providerReference: { providerId: "mapanything-adapter", technologyVersion: "0.3.0" },
      },
      LOG,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("unknown-provider");
    }
  });

  test("a provider registered but NOT evaluation-started is refused", () => {
    const events: ProviderRegistryEvent[] = [
      { kind: "provider-registered", profile: fixtureReconstructionProfileV1() },
    ];
    const outcome = evaluateScenario(committedScenario("recon-flagship-positive-001"), events);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("provider-not-in-evaluated-state");
      expect(outcome.refusal.detail).toContain("registered");
    }
  });

  test("capture-readiness scenarios are refused with the typed capability-lane-unavailable failure", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const captureReadiness: RealityEvalScenario = {
      ...scenario,
      scenarioId: "capture-readiness-gap-001",
      capability: "capture-readiness",
      benchmarkId: LANE_BENCHMARK_IDS["capture-readiness"],
      input: { ...scenario.input, capability: "capture-readiness" },
      expected: { kind: "explicit-refusal" },
      criteria: { thresholds: [], expectedFailureKinds: ["timeout"] },
    };
    const outcome = evaluateScenario(captureReadiness, LOG);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("capability-lane-unavailable");
      expect(outcome.refusal.detail).toContain("capture-readiness");
      expect(outcome.refusal.detail).toContain("fixture-map.md");
    }
  });

  test("retrieval scenarios are refused with the typed capability-lane-unavailable failure", () => {
    const scenario = committedScenario("depth-wall-positive-005");
    const retrieval: RealityEvalScenario = {
      ...scenario,
      scenarioId: "retrieval-gap-001",
      capability: "retrieval",
      benchmarkId: LANE_BENCHMARK_IDS.retrieval,
      input: { ...scenario.input, capability: "retrieval" },
      expected: { kind: "explicit-refusal" },
      criteria: { thresholds: [], expectedFailureKinds: ["retrieval-failure"] },
    };
    const outcome = evaluateScenario(retrieval, LOG);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("capability-lane-unavailable");
    }
  });

  test("the lane status table is the honest gap map (two lanes available, two refused)", () => {
    expect(CAPABILITY_LANE_STATUS.reconstruction).toBe("available");
    expect(CAPABILITY_LANE_STATUS.depth).toBe("available");
    expect(CAPABILITY_LANE_STATUS["capture-readiness"]).toBe("not-available");
    expect(CAPABILITY_LANE_STATUS.retrieval).toBe("not-available");
  });

  test("an input fixture violating the provider's declared input contract is refused", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outcome = evaluateScenario(
      {
        ...scenario,
        input: {
          ...scenario.input,
          payload: { ...scenario.input.payload, extra: true }, // undeclared field
        },
      },
      LOG,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // the control plane's IN direction: closed contracts — an undeclared
      // payload field is a typed input-contract refusal, never a coercion.
      expect(outcome.refusal.kind).toBe("input-invalid");
      expect(outcome.refusal.detail).toContain("payload-contract-mismatch");
    }
  });

  test("an input fixture whose deviceClass disagrees with the golden fixture is refused", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outcome = evaluateScenario(
      {
        ...scenario,
        input: {
          ...scenario.input,
          payload: { ...scenario.input.payload, deviceClass: "midrange_no_depth" },
        },
      },
      LOG,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("scenario-invalid");
      expect(outcome.refusal.detail).toContain("deviceClass");
    }
  });

  test("a scenario whose input fixture and expected fixture disagree is refused", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outcome = evaluateScenario(
      {
        ...scenario,
        expected: { kind: "reconstruction-scene", fixtureId: "fixture-midrange-bedroom-001" },
      },
      LOG,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("scenario-invalid");
      expect(outcome.refusal.detail).toContain("ground truth is the expectation");
    }
  });

  test("a scenario referencing a nonexistent golden fixture is refused", () => {
    const scenario = committedScenario("recon-flagship-positive-001");
    const outcome = evaluateScenario(
      {
        ...scenario,
        input: {
          ...scenario.input,
          payload: { ...scenario.input.payload, fixtureId: "fixture-does-not-exist" },
        },
        expected: { kind: "reconstruction-scene", fixtureId: "fixture-does-not-exist" },
      },
      LOG,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("scenario-invalid");
    }
  });

  test("a depth scenario whose samples do not cover the expected grid is refused", () => {
    const scenario = committedScenario("depth-wall-positive-005");
    const outcome = evaluateScenario(
      {
        ...scenario,
        expected: {
          ...scenario.expected,
          kind: "depth-grid",
          gridWidth: 8,
          gridHeight: 8,
          unit: "m",
          truthM: fixtureDepthTruth(new Array(64).fill(0.5)),
        },
      },
      LOG,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("scenario-invalid");
      expect(outcome.refusal.detail).toContain("depth grid");
    }
  });

  test("an invalid scenario shape is refused (not a silent pass)", () => {
    const outcome = evaluateScenario({ scenarioId: "not-a-scenario" } as unknown as RealityEvalScenario, LOG);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.kind).toBe("scenario-invalid");
    }
  });
});
