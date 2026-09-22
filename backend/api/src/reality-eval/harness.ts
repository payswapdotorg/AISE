/**
 * PROD-027 — the Layer-1 evaluation HARNESS: `evaluateScenario`.
 *
 * THE PROVIDER-NEUTRAL EVALUATION ENTRY POINT (pure function):
 *
 *   evaluateScenario(scenario, registryLog)
 *
 *   1. RESOLVES the provider profile by DETERMINISTIC REPLAY of the
 *      append-only control-plane registry log (the log order IS the time —
 *      the harness never trusts an inline profile; an unregistered or
 *      non-evaluating provider is a typed refusal);
 *   2. VALIDATES the scenario's input fixture against the profile's declared
 *      INPUT contract (`validateProviderInput`) and NORMALIZES the
 *      provider's declared result through the control plane's
 *      `normalizeResult` (the OUT direction of the I/O boundary);
 *   3. COMPARES the normalized outputs against the EXPECTED CANONICAL
 *      OUTCOME — declared against Layer-1's OWN types — using the EXISTING
 *      benchmark metrics (`computeFixtureMetrics` from
 *      backend/api/src/benchmarks for the reconstruction lane; documented
 *      mean/max absolute error for the depth lane) and evaluates the
 *      scenario's criteria (per-instance thresholds, the GATE RULE
 *      |value| > threshold);
 *   4. EMITS a control-plane `BenchmarkRecord` (content-addressed;
 *      failure observations from the CLOSED vocabulary ONLY) and a portable,
 *      digest-verifiable `ProvenanceManifest`.
 *
 * CANONICAL-BOUNDARY GUARD (the packet's hard requirement): the harness
 * REFUSES — typed failure, never a silent coercion — any scenario whose
 * provider result carries a provider-specific type toward the canonical
 * comparison:
 *
 *   - a raw execution whose outputs contain fields NOT declared by the
 *     provider's output contract (provider-specific classes/identifiers/
 *     formats) is refused at the boundary by `normalizeResult`
 *     (`contract-mismatch`) and surfaces as the typed
 *     `normalization-refused` refusal — the provider-specific payload NEVER
 *     enters the canonical comparison;
 *   - outputs that pass the declared contract but are ill-typed for the
 *     CANONICAL projection (wrong subject counts, non-finite values,
 *     non-unit plane normals, non-meter depth units) are answered by a
 *     TYPED projection refusal recorded as a closed-vocabulary
 *     `operation-semantic-failure` observation — the comparison is never
 *     performed over coerced shapes;
 *   - the opaque `providerNative` payload is carried verbatim for
 *     provenance ONLY (digested inside the normalized-result identity),
 *     never parsed — an evaluation whose provider-native payload happens to
 *     contain "better" values cannot be rescued by it (pinned by tests).
 *
 * HONEST LANE STATUS: `capture-readiness` and `retrieval` scenarios are
 * refused with the typed `capability-lane-unavailable` failure — Layer-1
 * capabilities that lack a provider-neutral evaluation entry point today
 * (see docs/productization-evidence/PROD-027/fixture-map.md).
 *
 * Determinism: PURE DETERMINISTIC COMPUTATION — no network, no clock reads,
 * no randomness, no throws. Identical (scenario, registryLog) pairs produce
 * byte-identical evaluation records and manifests.
 */

import {
  deriveBenchmarkRecordId,
  inputDigestOf,
  normalizeResult,
  providerResultDigestOf,
  replayRegistry,
  sealProvenanceManifest,
  validateProviderInput,
} from "@aise/provider-registry";
import type {
  BenchmarkFailureObservation,
  BenchmarkMetric,
  BenchmarkRecord,
  EnvironmentFingerprint,
  FailureKind,
  ProviderProfile,
  ProviderRegistryEvent,
  ProviderResult,
  ProvenanceManifest,
} from "@aise/provider-registry";
import { computeFixtureMetrics, fixtureById } from "../benchmarks";
import type { GoldenFixture, ReconstructedScene } from "../benchmarks";
import type { Plane } from "../geometry";
import {
  CAPABILITY_LANE_STATUS,
  validateRealityEvalScenario,
  type RealityEvalScenario,
  type ScenarioClass,
  type ScenarioMetricThreshold,
} from "./model";

/* ------------------------------------------------------------------ */
/* The harness's declared identity                                      */
/* ------------------------------------------------------------------ */

/** The harness code version carried by every record's reproduction statement. */
export const REALITY_EVAL_HARNESS_CODE_VERSION = "reality-eval-harness/1" as const;

/** The DECLARED environment fingerprint (never sensed — determinism contract). */
export const REALITY_EVAL_ENVIRONMENT: EnvironmentFingerprint = {
  declaredRuntime: "bun",
  declaredPlatform: "deterministic-fixture",
  codeVersion: REALITY_EVAL_HARNESS_CODE_VERSION,
  statement:
    "declared, not sensed — the Layer-1 evaluation harness never reads the runtime environment " +
    "(identical scenarios over identical registry logs reproduce byte-identical records)",
};

/** The AISE-side consumer surface the manifests are sealed for. */
export const REALITY_EVAL_CONSUMER = { consumer: "AISE", surface: "layer1-reality-evaluation" } as const;

/**
 * The harness-internal metric-instance shape (a structural supertype of the
 * benchmark engine's `MetricInstance`: the engine's closed metric names for
 * the reconstruction lane, plus the depth lane's documented
 * `depth_mae_m`/`depth_max_error_m`).
 */
interface HarnessMetricInstance {
  readonly metric: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly value: number;
  readonly unit: string;
  readonly signed: boolean;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* Typed refusals (scenario-side — NO record is emitted)                */
/* ------------------------------------------------------------------ */

export const SCENARIO_REFUSAL_KINDS = [
  "scenario-invalid",
  "registry-unreplayable",
  "unknown-provider",
  "provider-not-in-evaluated-state",
  "capability-lane-unavailable",
  "input-invalid",
  "normalization-refused",
] as const;
export type ScenarioRefusalKind = (typeof SCENARIO_REFUSAL_KINDS)[number];

/** One typed harness refusal (fail closed, never silent, never a throw). */
export interface ScenarioRefusal {
  readonly kind: ScenarioRefusalKind;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* The evaluation result                                                */
/* ------------------------------------------------------------------ */

/** One per-instance criterion violation (the GATE RULE: |value| > threshold). */
export interface CriterionViolation {
  readonly metric: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly value: number;
  readonly unit: string;
  readonly threshold: number;
  readonly critical: boolean;
  readonly rationale: string;
  readonly failureKind: FailureKind;
}

/** The result of one evaluated scenario: the record, the manifest, the verdict. */
export interface ScenarioEvaluation {
  readonly scenarioId: string;
  readonly scenarioClass: ScenarioClass;
  /** "pass" = every criterion satisfied (or the expected explicit refusal answered); "fail" = a violation was caught. */
  readonly verdict: "pass" | "fail";
  /** The control-plane benchmark record (content-addressed, closed-vocabulary observations). */
  readonly record: BenchmarkRecord;
  /** The portable, digest-verifiable provenance manifest sealed over this evaluation. */
  readonly manifest: ProvenanceManifest;
  /** The normalized provider result the evaluation consumed (provenance-visible). */
  readonly normalizedResult: ProviderResult;
  /** The closed-vocabulary failure observations the record carries. */
  readonly failureObservations: readonly BenchmarkFailureObservation[];
  /** The per-instance criterion violations that produced the failure observations. */
  readonly criterionViolations: readonly CriterionViolation[];
  /**
   * True iff a discrimination scenario's plausible-but-wrong output was
   * CAUGHT (verdict "fail" + recorded failure observations) — the day-27
   * doctrine: the harness records the failure, not just low scores.
   */
  readonly discriminationCaught: boolean;
}

export type ScenarioEvaluationOutcome =
  | { readonly ok: true; readonly evaluation: ScenarioEvaluation }
  | { readonly ok: false; readonly refusal: ScenarioRefusal };

/* ------------------------------------------------------------------ */
/* The canonical projection (normalized outputs → Layer-1 types)        */
/* ------------------------------------------------------------------ */

/** One typed canonical-projection issue (mirrors the contract issue shape). */
export interface ProjectionIssue {
  readonly path: string;
  readonly expected: string;
  readonly actual: string;
}

export type CanonicalProjectionOutcome<T> =
  | { readonly ok: true; readonly projected: T }
  | { readonly ok: false; readonly issues: readonly ProjectionIssue[] };

/** Unit-normal tolerance for canonical plane normals (geometry-library discipline). */
const UNIT_NORMAL_TOLERANCE = 1e-3;

function finiteNumberArray(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/**
 * Projects contract-validated reconstruction outputs onto the Layer-1
 * canonical `ReconstructedScene` (the benchmark engine's own output
 * contract): planes aligned with the fixture's canonical surface order,
 * dimensions with the canonical measurement-request order, object volumes
 * with the canonical object order. Positional alignment is the DECLARED
 * canonical convention of the evaluation lane (the input fixture pins the
 * order); count/shape deviations are TYPED refusals — never coerced.
 */
export function projectReconstructionScene(
  outputs: Readonly<Record<string, unknown>>,
  fixture: GoldenFixture,
): CanonicalProjectionOutcome<ReconstructedScene> {
  const issues: ProjectionIssue[] = [];
  const surfaceCount = fixture.groundTruth.surfaces.length;
  const dimensionCount = fixture.groundTruth.dimensions.length;
  const objectCount = fixture.groundTruth.objectVolumes.length;

  const planeNormals = outputs["planeNormals"];
  if (!finiteNumberArray(planeNormals) || planeNormals.length !== surfaceCount * 3) {
    issues.push({
      path: "outputs.planeNormals",
      expected: `${surfaceCount * 3} finite numbers (3 per canonical surface, aligned with the fixture's surface order)`,
      actual: `${Array.isArray(planeNormals) ? planeNormals.length : "not a finite number array"} entries`,
    });
  }
  const planeOffsets = outputs["planeOffsets"];
  if (!finiteNumberArray(planeOffsets) || planeOffsets.length !== surfaceCount) {
    issues.push({
      path: "outputs.planeOffsets",
      expected: `${surfaceCount} finite plane offsets (one per canonical surface)`,
      actual: `${Array.isArray(planeOffsets) ? planeOffsets.length : "not a finite number array"} entries`,
    });
  }
  const measuredDimensions = outputs["measuredDimensions"];
  if (!finiteNumberArray(measuredDimensions) || measuredDimensions.length !== dimensionCount) {
    issues.push({
      path: "outputs.measuredDimensions",
      expected: `${dimensionCount} finite measured dimensions (meters, aligned with the fixture's measurement-request order)`,
      actual: `${Array.isArray(measuredDimensions) ? measuredDimensions.length : "not a finite number array"} entries`,
    });
  }
  const measuredVolumes = outputs["measuredVolumes"];
  if (!finiteNumberArray(measuredVolumes) || measuredVolumes.length !== objectCount) {
    issues.push({
      path: "outputs.measuredVolumes",
      expected: `${objectCount} finite measured volumes (cubic meters, aligned with the fixture's object order)`,
      actual: `${Array.isArray(measuredVolumes) ? measuredVolumes.length : "not a finite number array"} entries`,
    });
  }
  const note = outputs["note"];
  if (typeof note !== "string" || note.trim().length === 0) {
    issues.push({
      path: "outputs.note",
      expected: "a non-empty deterministic engine note",
      actual: typeof note,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const planes = fixture.groundTruth.surfaces.map((surface, index) => {
    const normal = [
      (planeNormals as readonly number[])[index * 3] as number,
      (planeNormals as readonly number[])[index * 3 + 1] as number,
      (planeNormals as readonly number[])[index * 3 + 2] as number,
    ] as [number, number, number];
    return {
      surfaceId: surface.surfaceId,
      plane: {
        normal,
        d: (planeOffsets as readonly number[])[index] as number,
      } satisfies Plane,
    };
  });

  // Canonical geometry discipline: unit plane normals (computeFixtureMetrics
  // precondition), non-negative measured volumes.
  for (const [index, plane] of planes.entries()) {
    const norm = Math.sqrt(
      plane.plane.normal[0] * plane.plane.normal[0] +
        plane.plane.normal[1] * plane.plane.normal[1] +
        plane.plane.normal[2] * plane.plane.normal[2],
    );
    if (Math.abs(norm - 1) > UNIT_NORMAL_TOLERANCE) {
      issues.push({
        path: `outputs.planeNormals[${index * 3}..${index * 3 + 2}]`,
        expected: `a unit plane normal (|n| = 1 within ${UNIT_NORMAL_TOLERANCE})`,
        actual: `|n| = ${norm}`,
      });
    }
  }
  for (const [index, volume] of (measuredVolumes as readonly number[]).entries()) {
    if (volume < 0) {
      issues.push({
        path: `outputs.measuredVolumes[${index}]`,
        expected: "a non-negative measured volume",
        actual: `${volume}`,
      });
    }
  }
  for (const [index, dimension] of (measuredDimensions as readonly number[]).entries()) {
    if (dimension <= 0) {
      issues.push({
        path: `outputs.measuredDimensions[${index}]`,
        expected: "a positive measured dimension",
        actual: `${dimension}`,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const dimensions = fixture.groundTruth.dimensions.map((dimension, index) => ({
    dimensionId: dimension.dimensionId,
    measuredM: (measuredDimensions as readonly number[])[index] as number,
  }));
  const objectVolumes = fixture.groundTruth.objectVolumes.map((object, index) => ({
    objectId: object.objectId,
    measuredVolumeM3: (measuredVolumes as readonly number[])[index] as number,
  }));

  return {
    ok: true,
    projected: {
      planes,
      dimensions,
      objectVolumes,
      notes: [note as string],
    },
  };
}

/** The Layer-1 canonical depth grid (meters, row-major) projected from outputs. */
export interface ProjectedDepthGrid {
  readonly depthMap: readonly number[];
  readonly unit: string;
}

/**
 * Projects contract-validated depth outputs onto the Layer-1 canonical
 * depth grid. A NON-METER unit is a typed projection refusal
 * (operation-semantic: wrong units) — the canonical comparison is never
 * performed over silently converted values.
 */
export function projectDepthGrid(
  outputs: Readonly<Record<string, unknown>>,
  expected: { readonly gridWidth: number; readonly gridHeight: number },
): CanonicalProjectionOutcome<ProjectedDepthGrid> {
  const issues: ProjectionIssue[] = [];
  const cellCount = expected.gridWidth * expected.gridHeight;
  const depthMap = outputs["depthMap"];
  if (!finiteNumberArray(depthMap) || depthMap.length !== cellCount) {
    issues.push({
      path: "outputs.depthMap",
      expected: `${cellCount} finite depth values (meters, row-major gridWidth x gridHeight)`,
      actual: `${Array.isArray(depthMap) ? depthMap.length : "not a finite number array"} entries`,
    });
  }
  const unit = outputs["unit"];
  if (unit !== "m") {
    issues.push({
      path: "outputs.unit",
      expected: "'m' — Layer-1 canonical depth semantics are meters",
      actual: `'${String(unit)}'`,
    });
  }
  for (const [index, value] of (Array.isArray(depthMap) ? depthMap : []).entries()) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      issues.push({
        path: `outputs.depthMap[${index}]`,
        expected: "a finite non-negative depth value (meters)",
        actual: `${String(value)}`,
      });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, projected: { depthMap: depthMap as readonly number[], unit: unit as string } };
}

/* ------------------------------------------------------------------ */
/* The entry point                                                      */
/* ------------------------------------------------------------------ */

/**
 * Evaluates ONE Layer-1 scenario against ONE registry log. PURE: the same
 * (scenario, registryLog) pair always produces the byte-identical outcome.
 * Scenario-side problems answer typed refusals (no record); provider-side
 * defects answer evaluated records (verdict "fail", closed-vocabulary
 * failure observations — never silent).
 */
export function evaluateScenario(
  scenario: RealityEvalScenario,
  registryLog: readonly ProviderRegistryEvent[],
): ScenarioEvaluationOutcome {
  /* 1. Scenario validation (typed refusal — the scenario author's defect). */

  const validation = validateRealityEvalScenario(scenario);
  if (!validation.ok || validation.scenario === undefined) {
    const issues = validation.failures
      .map((failure) => `${failure.path || "(root)"} ${failure.kind}: ${failure.detail}`)
      .join("; ");
    return {
      ok: false,
      refusal: {
        kind: "scenario-invalid",
        detail: `the scenario failed typed validation (${validation.failures.length} failure(s)): ${issues}`,
      },
    };
  }

  /* 2. The honest lane status (the machine-readable gap map). */

  if (CAPABILITY_LANE_STATUS[scenario.capability] !== "available") {
    return {
      ok: false,
      refusal: {
        kind: "capability-lane-unavailable",
        detail:
          `the Layer-1 capability '${scenario.capability}' has NO provider-neutral evaluation entry ` +
          `point today (see docs/productization-evidence/PROD-027/fixture-map.md) — the harness refuses ` +
          `to fabricate one; evaluable lanes: [reconstruction, depth]`,
      },
    };
  }

  /* 3. Provider resolution by deterministic replay (never an inline profile). */

  const replay = replayRegistry(registryLog);
  if (!replay.ok) {
    return {
      ok: false,
      refusal: {
        kind: "registry-unreplayable",
        detail: `the registry log is not replayable (event ${replay.eventIndex}: ${replay.failure.kind} — ${replay.failure.detail})`,
      },
    };
  }
  const entry = replay.registry.entryOf(
    scenario.providerReference.providerId,
    scenario.providerReference.technologyVersion,
  );
  if (entry === undefined) {
    return {
      ok: false,
      refusal: {
        kind: "unknown-provider",
        detail:
          `provider '${scenario.providerReference.providerId}' (${scenario.providerReference.technologyVersion}) ` +
          `is not registered in the evaluation registry log — register the profile first`,
      },
    };
  }
  if (entry.state !== "evaluation" && entry.state !== "benchmarked") {
    return {
      ok: false,
      refusal: {
        kind: "provider-not-in-evaluated-state",
        detail:
          `provider '${entry.providerId}' (${entry.technologyVersion}) is in state '${entry.state}' — ` +
          `evaluation scenarios run against providers in the evaluation lifecycle ` +
          `(evaluation-started, optionally benchmarked); promotion decisions belong to the control plane`,
      },
    };
  }
  const profile: ProviderProfile = entry.profile;

  /* 4. The IN direction of the I/O boundary: input-contract validation. */

  const inputValidation = validateProviderInput(scenario.input, profile);
  if (!inputValidation.ok) {
    const issues = inputValidation.failures
      .map((failure) => `${failure.kind}: ${failure.detail}`)
      .join("; ");
    return {
      ok: false,
      refusal: {
        kind: "input-invalid",
        detail: `the scenario's input fixture violates the provider's declared input contract: ${issues}`,
      },
    };
  }
  const inputDigest = inputDigestOf(scenario.input);

  /* 5. The OUT direction of the I/O boundary: normalization. */

  const normalization = normalizeResult(scenario.declaredExecution, profile, { inputDigest });
  if (!normalization.ok) {
    const failure = normalization.failure;
    const issues =
      failure.issues === undefined
        ? ""
        : ` [${failure.issues.map((issue) => `${issue.path} expected ${issue.expected}, got ${issue.actual}`).join("; ")}]`;
    return {
      ok: false,
      refusal: {
        kind: "normalization-refused",
        detail:
          `the provider's declared result was REFUSED at the control-plane boundary (${failure.kind}): ` +
          `${failure.detail}${issues} — a provider-specific type never crosses into the canonical comparison`,
      },
    };
  }
  const result = normalization.result;

  /* 6. The capability lane: projection + metrics + criteria. */

  const lane = evaluateLane(scenario, result, profile);
  if (!lane.ok) {
    return lane;
  }
  const evaluated = lane.evaluation;

  /* 7. The control-plane artifacts: the record + the manifest. */

  const recordBody: Omit<BenchmarkRecord, "recordId"> = {
    kind: "provider-benchmark-record",
    schemaVersion: "provider-benchmark/1",
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId: scenario.benchmarkId,
    capability: scenario.capability,
    metrics: evaluated.metrics,
    failureObservations: evaluated.failureObservations,
    resourceObservations: declaredResourcesOf(profile),
    reproduction: {
      inputsDigest: inputDigest,
      codeVersion: REALITY_EVAL_HARNESS_CODE_VERSION,
      statement:
        `deterministic reproduction: scenario '${scenario.scenarioId}' (${scenario.scenarioVersion}), the ` +
        `normalized input (digest above), the provider profile '${profile.providerId}' ` +
        `(${profile.technologyVersion}) resolved by registry-log replay, and the harness code version ` +
        `(above) fully determine these metric values — no clock, no randomness, no network`,
    },
  };
  const record: BenchmarkRecord = {
    ...recordBody,
    recordId: deriveBenchmarkRecordId(recordBody),
  };

  const manifest = sealProvenanceManifest({
    profile,
    inputDigests: [inputDigest],
    normalizedResultDigest: providerResultDigestOf(result),
    benchmarkRecords: [record],
    environment: REALITY_EVAL_ENVIRONMENT,
    consumer: REALITY_EVAL_CONSUMER,
    reproducibilityStatement:
      `Layer-1 evaluation of scenario '${scenario.scenarioId}': the registered profile (digest above), ` +
      `the normalized input (digest above), the normalized provider result (digest above) and the ` +
      `benchmark record (digest above) fully determine this evaluation — identical inputs reproduce ` +
      `the identical manifest; the provider-native payload, if any, is opaque provenance and never ` +
      `parsed into canonical Layer-1 types`,
  });

  const discriminationCaught =
    scenario.scenarioClass === "discrimination" &&
    evaluated.verdict === "fail" &&
    evaluated.failureObservations.length > 0;

  return {
    ok: true,
    evaluation: {
      scenarioId: scenario.scenarioId,
      scenarioClass: scenario.scenarioClass,
      verdict: evaluated.verdict,
      record,
      manifest,
      normalizedResult: result,
      failureObservations: evaluated.failureObservations,
      criterionViolations: evaluated.criterionViolations,
      discriminationCaught,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The capability lanes                                                 */
/* ------------------------------------------------------------------ */

interface LaneEvaluation {
  readonly verdict: "pass" | "fail";
  readonly metrics: readonly BenchmarkMetric[];
  readonly failureObservations: readonly BenchmarkFailureObservation[];
  readonly criterionViolations: readonly CriterionViolation[];
}

type LaneOutcome =
  | { readonly ok: true; readonly evaluation: LaneEvaluation }
  | { readonly ok: false; readonly refusal: ScenarioRefusal };

function evaluateLane(
  scenario: RealityEvalScenario,
  result: ProviderResult,
  profile: ProviderProfile,
): LaneOutcome {
  if (scenario.capability === "reconstruction") {
    return evaluateReconstructionLane(scenario, result, profile);
  }
  return evaluateDepthLane(scenario, result, profile);
}

/** The DECLARED resource observations (from the profile's declared envelopes). */
function declaredResourcesOf(profile: ProviderProfile): BenchmarkRecord["resourceObservations"] {
  return {
    compute: profile.computeProfile.statement,
    memoryMiB: profile.memoryProfile.minimumMiB,
    latencyMsP50: profile.latencyProfile.expectedMsP50,
    latencyMsP95: profile.latencyProfile.expectedMsP95,
  };
}

/**
 * The explicit-failure path (both lanes): the provider answered an explicit
 * closed-vocabulary refusal. The verdict is "pass" iff the observed kind is
 * one the scenario's criteria declared LAWFUL (the negative path is explicit
 * and safe — mirroring the reference lifecycle's refusal-rate metric);
 * anything else (a timeout where outputs were expected, an unsupported-data
 * where a timeout was expected) is a caught failure.
 */
function evaluateExplicitFailure(
  scenario: RealityEvalScenario,
  result: ProviderResult,
): LaneEvaluation {
  const failure = result.failure as { readonly kind: FailureKind; readonly detail: string };
  const expected = scenario.criteria.expectedFailureKinds;
  const observedKind = failure.kind;
  const expectedKinds = expected.length > 0 ? expected.join(", ") : "(none — outputs were expected)";
  const matched = (expected as readonly string[]).includes(observedKind);
  const observations: BenchmarkFailureObservation[] = [
    {
      kind: observedKind,
      detail:
        `scenario '${scenario.scenarioId}' (${scenario.scenarioClass}): the provider answered the explicit ` +
        `closed-vocabulary failure '${observedKind}' (declared: ${failure.detail}); the scenario's lawful ` +
        `explicit kinds were [${expectedKinds}] — ${matched
          ? "the negative path is explicit and safe (no fabricated output)"
          : "the observed refusal was NOT the expected behavior — recorded, never silent"}`,
    },
  ];
  return {
    verdict: matched ? "pass" : "fail",
    metrics: [
      {
        metric: "explicit_failure_alignment",
        value: matched ? 1 : 0,
        unit: "ratio",
        detail:
          `1 = the provider answered one of the scenario's expected explicit failure kinds ` +
          `([${expectedKinds}]); 0 = the observed refusal was unexpected (or outputs were expected)`,
      },
    ],
    failureObservations: observations,
    criterionViolations: [],
  };
}

/**
 * The fabricated-output path: the scenario's canonical expectation IS an
 * explicit refusal, but the provider answered contract-validated OUTPUTS —
 * fabricated content where the declared behavior is an explicit refusal.
 * Recorded with the expected kind (the provider should have refused), never
 * silently passed.
 */
function evaluateFabricatedOutputs(
  scenario: RealityEvalScenario,
): LaneEvaluation {
  const expectedKind = scenario.criteria.expectedFailureKinds[0] as FailureKind;
  const expected = scenario.criteria.expectedFailureKinds.join(", ");
  return {
    verdict: "fail",
    metrics: [
      {
        metric: "explicit_failure_alignment",
        value: 0,
        unit: "ratio",
        detail:
          `the scenario expected an explicit closed-vocabulary refusal ([${expected}]) but the provider ` +
          `returned contract-validated outputs — fabricated output, never the declared negative path`,
      },
    ],
    failureObservations: [
      {
        kind: expectedKind,
        detail:
          `scenario '${scenario.scenarioId}' (${scenario.scenarioClass}): the expected explicit refusal ` +
          `'${expectedKind}' was NOT answered — the provider fabricated outputs for input its declared ` +
          `behavior refuses; the fabricated outputs were NOT compared against the canonical expectation ` +
          `(the criteria's negative path failed loudly)`,
      },
    ],
    criterionViolations: [],
  };
}

/** Maps the existing benchmark engine's metric instances onto record metrics. */
function benchmarkMetricsOf(instances: readonly HarnessMetricInstance[]): readonly BenchmarkMetric[] {
  return instances.map((instance) => ({
    metric: instance.metric,
    value: instance.value,
    unit: instance.unit,
    subjectId: instance.subjectId,
    detail: `${instance.subjectLabel} — ${instance.detail}`,
  }));
}

/**
 * Evaluates the per-instance thresholds (the GATE RULE: violation iff
 * |value| > threshold, uniformly over signed metrics). Every violation
 * becomes a closed-vocabulary failure observation carrying the threshold's
 * declared failure kind — the harness RECORDS the failure, not just low
 * scores.
 */
function evaluateThresholds(
  instances: readonly HarnessMetricInstance[],
  thresholds: readonly ScenarioMetricThreshold[],
  scenarioId: string,
): { readonly violations: readonly CriterionViolation[]; readonly observations: readonly BenchmarkFailureObservation[] } {
  const violations: CriterionViolation[] = [];
  const observations: BenchmarkFailureObservation[] = [];
  const byMetric = new Map<string, ScenarioMetricThreshold>();
  for (const threshold of thresholds) {
    byMetric.set(threshold.metric, threshold);
  }
  for (const instance of instances) {
    const threshold = byMetric.get(instance.metric);
    if (threshold === undefined) {
      continue; // informational metric (not thresholded by this scenario)
    }
    if (Math.abs(instance.value) > threshold.threshold) {
      violations.push({
        metric: instance.metric,
        subjectId: instance.subjectId,
        subjectLabel: instance.subjectLabel,
        value: instance.value,
        unit: instance.unit,
        threshold: threshold.threshold,
        critical: threshold.critical,
        rationale: threshold.rationale,
        failureKind: threshold.failureKind,
      });
      observations.push({
        kind: threshold.failureKind,
        detail:
          `scenario '${scenarioId}': metric ${instance.metric} on ${instance.subjectLabel} ` +
          `(${instance.subjectId}) — |${instance.value}| > ${threshold.threshold} ` +
          `(${threshold.critical ? "CRITICAL" : "non-critical"}: ${threshold.rationale}); ` +
          `${instance.detail} — the plausible-but-wrong result was CAUGHT by the criteria`,
      });
    }
  }
  return { violations, observations };
}

/** The projection-refusal record (ill-typed canonical content — never coerced). */
function projectionRefusalEvaluation(
  scenario: RealityEvalScenario,
  issues: readonly ProjectionIssue[],
): LaneEvaluation {
  const detail = issues
    .map((issue) => `${issue.path} expected ${issue.expected}, got ${issue.actual}`)
    .join("; ");
  return {
    verdict: "fail",
    metrics: [
      {
        metric: "canonical_conformance",
        value: 0,
        unit: "ratio",
        detail:
          `the provider's contract-validated outputs are ill-typed for the Layer-1 canonical projection ` +
          `(${issues.length} issue(s)) — the comparison was refused, never coerced`,
      },
    ],
    failureObservations: [
      {
        kind: "operation-semantic-failure",
        detail:
          `scenario '${scenario.scenarioId}': the normalized outputs do not project onto the Layer-1 ` +
          `canonical comparison types — ${detail} — the result's engineering semantics are ill-typed ` +
          `for the requested capability (typed projection refusal, never a silent conversion)`,
      },
    ],
    criterionViolations: [],
  };
}

function evaluateReconstructionLane(
  scenario: RealityEvalScenario,
  result: ProviderResult,
  profile: ProviderProfile,
): LaneOutcome {
  if (result.status === "failed") {
    return { ok: true, evaluation: evaluateExplicitFailure(scenario, result) };
  }
  if (scenario.expected.kind === "explicit-refusal") {
    return { ok: true, evaluation: evaluateFabricatedOutputs(scenario) };
  }
  if (scenario.expected.kind !== "reconstruction-scene") {
    return {
      ok: false,
      refusal: {
        kind: "scenario-invalid",
        detail:
          `a reconstruction scenario must expect a 'reconstruction-scene' (or 'explicit-refusal') ` +
          `canonical outcome (got '${scenario.expected.kind}')`,
      },
    };
  }

  /* Content coherence: the expected fixture + the input fixture must agree. */

  const payload = scenario.input.payload as Record<string, unknown>;
  const fixture = fixtureById(scenario.expected.fixtureId);
  if (fixture === undefined) {
    return {
      ok: false,
      refusal: {
        kind: "scenario-invalid",
        detail:
          `the expected canonical outcome references Layer-1 golden fixture '${scenario.expected.fixtureId}' ` +
          `which does not exist in the canonical benchmark fixture set (GOLDEN_FIXTURES)`,
      },
    };
  }
  if (payload["fixtureId"] !== scenario.expected.fixtureId) {
    return {
      ok: false,
      refusal: {
        kind: "scenario-invalid",
        detail:
          `the input fixture references golden fixture '${String(payload["fixtureId"])}' while the expected ` +
          `canonical outcome references '${scenario.expected.fixtureId}' — the provider must be evaluated ` +
          `over the fixture whose ground truth is the expectation`,
      },
    };
  }
  if (payload["deviceClass"] !== fixture.deviceClass) {
    return {
      ok: false,
      refusal: {
        kind: "scenario-invalid",
        detail:
          `the input fixture declares deviceClass '${String(payload["deviceClass"])}' but golden fixture ` +
          `'${fixture.fixtureId}' is class '${fixture.deviceClass}' — the evaluation input must describe ` +
          `the canonical fixture it references`,
      },
    };
  }

  /* The canonical projection (typed refusal on ill-typed content). */

  const outputs = result.outputs as Record<string, unknown>;
  const projection = projectReconstructionScene(outputs, fixture);
  if (!projection.ok) {
    return { ok: true, evaluation: projectionRefusalEvaluation(scenario, projection.issues) };
  }

  /* The EXISTING benchmark metrics over the canonical scene vs ground truth. */

  const metrics = computeFixtureMetrics(fixture, projection.projected);
  const { violations, observations } = evaluateThresholds(
    metrics.metrics,
    scenario.criteria.thresholds,
    scenario.scenarioId,
  );

  const recordMetrics = [...benchmarkMetricsOf(metrics.metrics)];
  if (observations.length > 0) {
    recordMetrics.push({
      metric: "criteria_satisfied",
      value: 0,
      unit: "ratio",
      detail:
        `${violations.length} per-instance threshold violation(s) — the criteria caught the provider's ` +
        `output against the canonical expectation (provider '${profile.providerId}' ${profile.technologyVersion})`,
    });
  } else {
    recordMetrics.push({
      metric: "criteria_satisfied",
      value: 1,
      unit: "ratio",
      detail:
        `every per-instance threshold satisfied — the provider's output meets the scenario's declared ` +
        `criteria over the canonical expectation (provider '${profile.providerId}' ${profile.technologyVersion})`,
    });
  }

  return {
    ok: true,
    evaluation: {
      verdict: violations.length > 0 ? "fail" : "pass",
      metrics: recordMetrics,
      failureObservations: observations,
      criterionViolations: violations,
    },
  };
}

function evaluateDepthLane(
  scenario: RealityEvalScenario,
  result: ProviderResult,
  profile: ProviderProfile,
): LaneOutcome {
  if (result.status === "failed") {
    return { ok: true, evaluation: evaluateExplicitFailure(scenario, result) };
  }
  if (scenario.expected.kind === "explicit-refusal") {
    return { ok: true, evaluation: evaluateFabricatedOutputs(scenario) };
  }
  if (scenario.expected.kind !== "depth-grid") {
    return {
      ok: false,
      refusal: {
        kind: "scenario-invalid",
        detail:
          `a depth scenario must expect a 'depth-grid' (or 'explicit-refusal') canonical outcome ` +
          `(got '${scenario.expected.kind}')`,
      },
    };
  }

  /* Content coherence: the input grid must match the expected truth grid. */

  const expected = scenario.expected;
  const payload = scenario.input.payload as Record<string, unknown>;
  const samples = payload["samples"];
  if (
    !Array.isArray(samples) ||
    samples.length !== expected.gridWidth * expected.gridHeight
  ) {
    return {
      ok: false,
      refusal: {
        kind: "scenario-invalid",
        detail:
          `the input fixture's samples (${Array.isArray(samples) ? samples.length : "not an array"}) do not ` +
          `cover the expected depth grid (${expected.gridWidth} x ${expected.gridHeight})`,
      },
    };
  }

  /* The canonical projection (typed refusal on ill-typed content). */

  const outputs = result.outputs as Record<string, unknown>;
  const projection = projectDepthGrid(outputs, expected);
  if (!projection.ok) {
    return { ok: true, evaluation: projectionRefusalEvaluation(scenario, projection.issues) };
  }

  /* The documented depth metrics (the reference lifecycle's arithmetic). */

  let absoluteErrorSum = 0;
  let maxAbsoluteError = 0;
  const measured = projection.projected.depthMap;
  for (const [index, value] of measured.entries()) {
    const error = Math.abs(value - (expected.truthM[index] ?? 0));
    absoluteErrorSum += error;
    if (error > maxAbsoluteError) {
      maxAbsoluteError = error;
    }
  }
  const meanAbsoluteError = absoluteErrorSum / measured.length;

  const instances: readonly HarnessMetricInstance[] = [
    {
      metric: "depth_mae_m",
      subjectId: `${scenario.scenarioId}-grid`,
      subjectLabel: "depth grid",
      value: meanAbsoluteError,
      unit: "m",
      signed: false,
      detail: `mean absolute error of the estimated depth grid against the documented truth (${measured.length} cells)`,
    },
    {
      metric: "depth_max_error_m",
      subjectId: `${scenario.scenarioId}-grid`,
      subjectLabel: "depth grid",
      value: maxAbsoluteError,
      unit: "m",
      signed: false,
      detail: `maximum absolute error of the estimated depth grid against the documented truth`,
    },
  ];
  const { violations, observations } = evaluateThresholds(
    instances,
    scenario.criteria.thresholds,
    scenario.scenarioId,
  );

  const recordMetrics = [...benchmarkMetricsOf(instances)];
  recordMetrics.push(
    violations.length > 0
      ? {
          metric: "criteria_satisfied",
          value: 0,
          unit: "ratio",
          detail:
            `${violations.length} per-instance threshold violation(s) — the criteria caught the provider's ` +
            `depth output against the documented truth (provider '${profile.providerId}' ${profile.technologyVersion})`,
        }
      : {
          metric: "criteria_satisfied",
          value: 1,
          unit: "ratio",
          detail:
            `every per-instance threshold satisfied — the provider's depth output meets the scenario's ` +
            `declared criteria over the documented truth (provider '${profile.providerId}' ${profile.technologyVersion})`,
        },
  );

  return {
    ok: true,
    evaluation: {
      verdict: violations.length > 0 ? "fail" : "pass",
      metrics: recordMetrics,
      failureObservations: observations,
      criterionViolations: violations,
    },
  };
}
