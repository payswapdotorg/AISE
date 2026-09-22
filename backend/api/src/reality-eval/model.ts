/**
 * PROD-027 — Layer-1 reality/capture/retrieval evaluation scenario MODEL.
 *
 * THE PROVIDER-NEUTRAL EVALUATION ENTRY POINT of Layer 1 (the parent gate of
 * the HFX-1xx consumers: HFX-101 MapAnything, HFX-102 Video Depth Anything,
 * HFX-103 SLAM benchmark, HFX-104 open-vocabulary grounding). A Layer-1
 * evaluation scenario declares, against CANONICAL Layer-1 types ONLY:
 *
 *   - the CAPABILITY under test (reconstruction / depth / capture-readiness
 *     / retrieval — ACR-006 Layer-1: capture → spatial context → evidence →
 *     reconstruction → readiness);
 *   - the PROVIDER PROFILE REFERENCE (a control-plane `ProviderProfile` is
 *     registered in an append-only registry log; the scenario references it
 *     by providerId + technologyVersion — the harness resolves it by
 *     deterministic replay, never trusting an inline profile);
 *   - the INPUT FIXTURE (a normalized control-plane `ProviderInput`, validated
 *     against the profile's declared INPUT contract);
 *   - the EXPECTED CANONICAL OUTCOME — declared against Layer-1's OWN types
 *     (the existing golden-fixture ground truth, the documented depth truth,
 *     or an explicit closed-vocabulary refusal). NEVER the provider's types:
 *     TypeScript makes a provider-native payload structurally unplaceable in
 *     `ExpectedCanonicalOutcome`, and the runtime validators re-enforce it;
 *   - the EVALUATION CRITERIA — metric thresholds (per-instance, the GATE
 *     RULE: violation iff |value| > threshold) + expected failure kinds from
 *     the CLOSED vocabulary (`@aise/provider-registry` failures).
 *
 * CANONICAL-BOUNDARY DOCTRINE (HFX-000 README; spec/technology-substitution):
 * a provider is an implementation candidate, NEVER canonical truth. The
 * provider's declared result enters as a raw `RawProviderExecution` and is
 * normalized through the control plane's `normalizeResult`; provider-native
 * payloads stay OPAQUE (provenance only, never parsed); the canonical
 * comparison consumes ONLY contract-validated normalized outputs projected
 * into Layer-1 canonical types. The harness REFUSES (typed failure) any
 * scenario whose provider result carries a provider-specific type toward the
 * canonical comparison (harness.ts).
 *
 * HONEST CAPABILITY LANE STATUS (the machine-readable gap map — see
 * docs/productization-evidence/PROD-027/fixture-map.md): only the
 * reconstruction and depth lanes are evaluable today; capture-readiness and
 * retrieval lack provider-neutral entry points and the harness answers the
 * typed `capability-lane-unavailable` refusal for them (explicit, never
 * silent).
 *
 * Determinism: PURE DETERMINISTIC COMPUTATION over declared inputs — no
 * network, no clock reads, no randomness. Identical scenarios over identical
 * registry logs produce byte-identical evaluation records.
 */

import {
  isFailureKind,
  validateProviderProfile,
  type BenchmarkRecord,
  type FailureKind,
  type ProviderInput,
  type ProviderProfile,
  type ProviderRegistryEvent,
  type ProvenanceManifest,
  type RawProviderExecution,
} from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Capability vocabulary (ACR-006 Layer 1)                              */
/* ------------------------------------------------------------------ */

/**
 * The Layer-1 capabilities this entry point can name. The closed set is the
 * ACR-006 Layer-1 chain's provider-substitutable capabilities.
 */
export const REALITY_EVAL_CAPABILITIES = [
  "reconstruction",
  "depth",
  "capture-readiness",
  "retrieval",
] as const;
export type RealityEvalCapability = (typeof REALITY_EVAL_CAPABILITIES)[number];

/**
 * The HONEST lane status per capability: which lanes have a provider-neutral
 * evaluation entry point TODAY. `not-available` is an explicit refusal, not
 * an omission — the harness refuses those scenarios with the typed
 * `capability-lane-unavailable` failure and the gap is documented in
 * `docs/productization-evidence/PROD-027/fixture-map.md`.
 */
export const CAPABILITY_LANE_STATUS: Readonly<Record<RealityEvalCapability, "available" | "not-available">> = {
  reconstruction: "available",
  depth: "available",
  "capture-readiness": "not-available",
  retrieval: "not-available",
};

/**
 * The PINNED Layer-1 benchmark id per capability (comparability key seed:
 * `benchmarkComparabilityKey` = benchmarkId | capability). A scenario may not
 * invent a benchmark id — records are only comparable within one pinned
 * benchmark per capability.
 */
export const LANE_BENCHMARK_IDS: Readonly<Record<RealityEvalCapability, string>> = {
  reconstruction: "reality-eval-reconstruction/1",
  depth: "reality-eval-depth/1",
  "capture-readiness": "reality-eval-capture-readiness/1",
  retrieval: "reality-eval-retrieval/1",
};

/* ------------------------------------------------------------------ */
/* Scenario classes (the day-27 doctrine)                              */
/* ------------------------------------------------------------------ */

/**
 * The scenario classes the benchmark doctrine requires: positive (the good
 * path), negative (explicit failure behavior — the provider MUST fail
 * explicitly and safely), discrimination (plausible-but-wrong output the
 * criteria MUST catch).
 */
export const SCENARIO_CLASSES = ["positive", "negative", "discrimination"] as const;
export type ScenarioClass = (typeof SCENARIO_CLASSES)[number];

/* ------------------------------------------------------------------ */
/* Typed seals                                                          */
/* ------------------------------------------------------------------ */

export const REALITY_EVAL_SCENARIO_KIND = "reality-eval-scenario" as const;
export const REALITY_EVAL_SCENARIO_SCHEMA_VERSION = "reality-eval-scenario/1" as const;

/* ------------------------------------------------------------------ */
/* Expected canonical outcome (Layer-1 OWN types ONLY)                  */
/* ------------------------------------------------------------------ */

/**
 * The expected canonical outcome, declared against Layer-1's own types:
 *
 *  - `reconstruction-scene` — the existing Layer-1 golden fixture's ground
 *    truth (`GOLDEN_FIXTURES`/`fixtureById` in backend/api/src/benchmarks —
 *    the canonical benchmark fixture set). The comparison runs the EXISTING
 *    benchmark metrics (`computeFixtureMetrics`) against that ground truth.
 *  - `depth-grid` — the DOCUMENTED depth truth (meters, row-major), the
 *    Layer-1 canonical depth semantics. The comparison computes the
 *    mean-absolute / maximum-absolute error metrics.
 *  - `explicit-refusal` — the canonical expectation IS an explicit
 *    closed-vocabulary refusal (the negative path: the provider must refuse,
 *    never fabricate); the lawful kinds are enumerated in the criteria.
 *
 * A provider-native payload is structurally unplaceable here: the union
 * carries Layer-1 canonical content or an explicit-refusal declaration only.
 */
export type ExpectedCanonicalOutcome =
  | { readonly kind: "reconstruction-scene"; readonly fixtureId: string }
  | {
      readonly kind: "depth-grid";
      readonly gridWidth: number;
      readonly gridHeight: number;
      readonly unit: "m";
      readonly truthM: readonly number[];
    }
  | { readonly kind: "explicit-refusal" };

export const EXPECTED_OUTCOME_KINDS = [
  "reconstruction-scene",
  "depth-grid",
  "explicit-refusal",
] as const;
export type ExpectedOutcomeKind = (typeof EXPECTED_OUTCOME_KINDS)[number];

/* ------------------------------------------------------------------ */
/* Evaluation criteria                                                  */
/* ------------------------------------------------------------------ */

/**
 * One declared metric threshold. The GATE RULE (mirrored from the benchmark
 * engine's gates.ts, documented): a metric instance violates the threshold
 * iff `Math.abs(value) > threshold` — the absolute value is evaluated
 * uniformly so SIGNED metrics (dimension_error) cannot evade the bar by
 * regressing in the negative direction. Violations are evaluated
 * PER-INSTANCE (R17: aggregates never gate).
 */
export interface ScenarioMetricThreshold {
  /** Metric name (the existing benchmark engine's metric vocabulary for the reconstruction lane). */
  readonly metric: string;
  /** Maximum acceptable |value|. */
  readonly threshold: number;
  /** The closed-vocabulary failure kind a violation records. */
  readonly failureKind: FailureKind;
  /** Critical thresholds invalidate the capability's engineering use (surfaced in the observation detail). */
  readonly critical: boolean;
  /** Deterministic rationale (why this bar; the committed suite cites gates-1 rows). */
  readonly rationale: string;
}

/**
 * The evaluation criteria: metric thresholds + expected failure kinds from
 * the CLOSED vocabulary. Exactly one of the two carries the expectation:
 *
 *  - content expectations (`reconstruction-scene` / `depth-grid`) declare
 *    THRESHOLDS and NO expected failure kinds (a good result answers
 *    outputs);
 *  - `explicit-refusal` expectations declare EXPECTED FAILURE KINDS (the
 *    lawful explicit refusals) and may omit thresholds.
 */
export interface EvaluationCriteria {
  readonly thresholds: readonly ScenarioMetricThreshold[];
  readonly expectedFailureKinds: readonly FailureKind[];
}

/* ------------------------------------------------------------------ */
/* The scenario (descriptor + declared execution)                       */
/* ------------------------------------------------------------------ */

/** The provider profile reference (control-plane identity, never inline). */
export interface ProviderProfileReference {
  readonly providerId: string;
  readonly technologyVersion: string;
}

/**
 * The COMMITTED scenario descriptor (the benchmark's data form): everything
 * except the provider's declared result. The suite runner completes it with
 * the deterministic fixture provider's execution; the HTTP surface receives
 * the completed form.
 */
export interface RealityEvalScenarioDescriptor {
  readonly kind: typeof REALITY_EVAL_SCENARIO_KIND;
  readonly schemaVersion: typeof REALITY_EVAL_SCENARIO_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioClass: ScenarioClass;
  readonly capability: RealityEvalCapability;
  readonly benchmarkId: string;
  readonly providerReference: ProviderProfileReference;
  /** The input fixture (normalized `ProviderInput`). */
  readonly input: ProviderInput;
  readonly expected: ExpectedCanonicalOutcome;
  readonly criteria: EvaluationCriteria;
}

/**
 * The COMPLETE scenario the harness evaluates: the descriptor plus the
 * provider's declared result (outputs or an explicit failure — the raw
 * shape `normalizeResult` consumes). In production (HFX-101..104) the
 * adapter submits this after executing the provider; in the committed
 * benchmark the deterministic fixture double produces it.
 */
export interface RealityEvalScenario extends RealityEvalScenarioDescriptor {
  readonly declaredExecution: RawProviderExecution;
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                           */
/* ------------------------------------------------------------------ */

export const SCENARIO_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "unknown-capability",
  "unknown-scenario-class",
  "unknown-expected-kind",
  "vocabulary-violation",
  "expected-criteria-conflict",
  "duplicate-threshold-metric",
] as const;
export type ScenarioValidationFailureKind = (typeof SCENARIO_VALIDATION_FAILURE_KINDS)[number];

/** One typed scenario validation failure (path + kind + detail, never a throw). */
export interface ScenarioValidationFailure {
  readonly kind: ScenarioValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type ScenarioValidation =
  | { readonly ok: true; readonly descriptor: RealityEvalScenarioDescriptor }
  | { readonly ok: false; readonly failures: readonly ScenarioValidationFailure[] };

/* ------------------------------------------------------------------ */
/* The pure validator (total, deterministic issue order)                */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isCapability(value: unknown): value is RealityEvalCapability {
  return (REALITY_EVAL_CAPABILITIES as readonly string[]).includes(value as string);
}

/**
 * Validates an unknown payload as a `RealityEvalScenarioDescriptor` (the
 * committed form — `declaredExecution` is intentionally NOT required here;
 * `completeScenario` and the service boundary add it). PURE, typed failures,
 * no throws: every refusal is a `ScenarioValidationFailure` in deterministic
 * order (seal, identity, class/capability, benchmark, reference, input,
 * expected, criteria).
 */
export function validateRealityEvalScenarioDescriptor(value: unknown): ScenarioValidation {
  if (!isRecord(value)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a scenario descriptor must be a JSON object" },
      ],
    };
  }

  const failures: ScenarioValidationFailure[] = [];
  const fail = (kind: ScenarioValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  /* Seal + identity ------------------------------------------------ */

  if (value["kind"] !== REALITY_EVAL_SCENARIO_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${REALITY_EVAL_SCENARIO_KIND}'`);
  }
  if (value["schemaVersion"] !== REALITY_EVAL_SCENARIO_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${REALITY_EVAL_SCENARIO_SCHEMA_VERSION}'`,
    );
  }
  for (const path of ["scenarioId", "scenarioVersion"] as const) {
    const field = value[path];
    if (!isNonEmptyString(field) || (field as string).length > 128) {
      fail("type-mismatch", path, "expected a non-empty string (max 128)");
    }
  }

  /* Class + capability + benchmark ---------------------------------- */

  const scenarioClass = value["scenarioClass"];
  if (!(SCENARIO_CLASSES as readonly string[]).includes(scenarioClass as string)) {
    fail(
      "unknown-scenario-class",
      "scenarioClass",
      `expected one of [${SCENARIO_CLASSES.join(", ")}] (got '${String(scenarioClass)}')`,
    );
  }

  const capability = value["capability"];
  if (!isCapability(capability)) {
    fail(
      "unknown-capability",
      "capability",
      `expected one of [${REALITY_EVAL_CAPABILITIES.join(", ")}] (got '${String(capability)}')`,
    );
  }

  const benchmarkId = value["benchmarkId"];
  if (!isNonEmptyString(benchmarkId) || (benchmarkId as string).length > 128) {
    fail("type-mismatch", "benchmarkId", "expected a non-empty string (max 128)");
  } else if (isCapability(capability) && benchmarkId !== LANE_BENCHMARK_IDS[capability]) {
    fail(
      "value-out-of-range",
      "benchmarkId",
      `the benchmarkId must be the capability's PINNED Layer-1 benchmark '${LANE_BENCHMARK_IDS[capability]}' — records are comparable only within one pinned benchmark per capability`,
    );
  }

  /* Provider reference ---------------------------------------------- */

  const providerReference = value["providerReference"];
  if (isRecord(providerReference)) {
    for (const path of ["providerId", "technologyVersion"] as const) {
      const field = providerReference[path];
      if (!isNonEmptyString(field) || (field as string).length > 128) {
        fail("type-mismatch", `providerReference.${path}`, "expected a non-empty string (max 128)");
      }
    }
  } else {
    fail("type-mismatch", "providerReference", "expected the provider profile reference object");
  }

  /* Input fixture (normalized ProviderInput) ------------------------- */

  const input = value["input"];
  if (isRecord(input)) {
    if (input["kind"] !== "provider-input") {
      fail("type-mismatch", "input.kind", "expected the typed seal 'provider-input'");
    }
    const inputCapability = input["capability"];
    if (!isNonEmptyString(inputCapability)) {
      fail("type-mismatch", "input.capability", "expected a non-empty string");
    } else if (isCapability(capability) && inputCapability !== capability) {
      fail(
        "value-out-of-range",
        "input.capability",
        `the input fixture's capability '${inputCapability}' must equal the scenario capability '${capability}'`,
      );
    }
    if (!isRecord(input["payload"])) {
      fail("type-mismatch", "input.payload", "expected a JSON object payload");
    }
  } else {
    fail("type-mismatch", "input", "expected the normalized ProviderInput object");
  }

  /* Expected canonical outcome --------------------------------------- */

  const expected = value["expected"];
  let expectedKind: ExpectedOutcomeKind | null = null;
  if (isRecord(expected)) {
    const kind = expected["kind"];
    if (!(EXPECTED_OUTCOME_KINDS as readonly string[]).includes(kind as string)) {
      fail(
        "unknown-expected-kind",
        "expected.kind",
        `expected one of [${EXPECTED_OUTCOME_KINDS.join(", ")}] (got '${String(kind)}') — the expected outcome is declared against Layer-1's OWN types`,
      );
    } else {
      expectedKind = kind as ExpectedOutcomeKind;
    }
    if (kind === "reconstruction-scene") {
      const fixtureId = expected["fixtureId"];
      if (!isNonEmptyString(fixtureId) || (fixtureId as string).length > 128) {
        fail(
          "type-mismatch",
          "expected.fixtureId",
          "expected the Layer-1 golden fixture id (the canonical ground-truth reference)",
        );
      }
    }
    if (kind === "depth-grid") {
      const gridWidth = expected["gridWidth"];
      const gridHeight = expected["gridHeight"];
      if (!isIntegerInRange(gridWidth, 1, 64)) {
        fail("type-mismatch", "expected.gridWidth", "expected an integer in [1, 64]");
      }
      if (!isIntegerInRange(gridHeight, 1, 64)) {
        fail("type-mismatch", "expected.gridHeight", "expected an integer in [1, 64]");
      }
      if (expected["unit"] !== "m") {
        fail("type-mismatch", "expected.unit", "expected 'm' — Layer-1 canonical depth semantics are meters");
      }
      const truthM = expected["truthM"];
      if (!Array.isArray(truthM) || truthM.length === 0 || truthM.length > 4096) {
        fail("type-mismatch", "expected.truthM", "expected a non-empty number array (max 4096)");
      } else {
        for (const [index, entry] of (truthM as unknown[]).entries()) {
          if (!isFiniteNumber(entry) || entry < 0 || entry > 100) {
            fail(
              "type-mismatch",
              `expected.truthM[${index}]`,
              "expected a finite depth value in [0, 100] meters",
            );
          }
        }
        if (isIntegerInRange(gridWidth, 1, 64) && isIntegerInRange(gridHeight, 1, 64)) {
          if (truthM.length !== (gridWidth as number) * (gridHeight as number)) {
            fail(
              "value-out-of-range",
              "expected.truthM",
              `expected gridWidth x gridHeight = ${(gridWidth as number) * (gridHeight as number)} values (got ${truthM.length})`,
            );
          }
        }
      }
    }
  } else {
    fail("type-mismatch", "expected", "expected the canonical expected-outcome object");
  }

  /* Criteria ---------------------------------------------------------- */

  const criteria = value["criteria"];
  const expectedFailureKinds: FailureKind[] = [];
  const thresholdMetrics = new Set<string>();
  const thresholdsValidated = isRecord(criteria) && Array.isArray(criteria["thresholds"]);
  const failureKindsValidated = isRecord(criteria) && Array.isArray(criteria["expectedFailureKinds"]);
  if (isRecord(criteria)) {
    const thresholds = criteria["thresholds"];
    if (thresholds === undefined) {
      fail("missing-field", "criteria.thresholds", "the field is required (an empty list is honest)");
    } else if (!Array.isArray(thresholds)) {
      fail("type-mismatch", "criteria.thresholds", "expected an array of metric thresholds");
    } else if (thresholds.length > 64) {
      fail("value-out-of-range", "criteria.thresholds", "more than 64 thresholds");
    } else {
      for (const [index, entry] of (thresholds as unknown[]).entries()) {
        const path = `criteria.thresholds[${index}]`;
        if (!isRecord(entry)) {
          fail("type-mismatch", path, "expected a threshold object");
          continue;
        }
        if (!isNonEmptyString(entry["metric"]) || (entry["metric"] as string).length > 128) {
          fail("type-mismatch", `${path}.metric`, "expected a non-empty metric name (max 128)");
        } else {
          const metric = entry["metric"] as string;
          if (thresholdMetrics.has(metric)) {
            fail(
              "duplicate-threshold-metric",
              `${path}.metric`,
              `metric '${metric}' is declared twice — one bar per metric`,
            );
          }
          thresholdMetrics.add(metric);
        }
        if (!isFiniteNumber(entry["threshold"]) || (entry["threshold"] as number) <= 0) {
          fail("type-mismatch", `${path}.threshold`, "expected a finite positive threshold");
        }
        if (!isFailureKind(entry["failureKind"])) {
          fail(
            "vocabulary-violation",
            `${path}.failureKind`,
            `'${String(entry["failureKind"])}' is not in the CLOSED failure vocabulary — criteria cannot invent failure kinds`,
          );
        }
        if (typeof entry["critical"] !== "boolean") {
          fail("type-mismatch", `${path}.critical`, "expected a boolean");
        }
        if (!isNonEmptyString(entry["rationale"])) {
          fail("type-mismatch", `${path}.rationale`, "expected a non-empty deterministic rationale");
        }
      }
    }

    const kinds = criteria["expectedFailureKinds"];
    if (kinds === undefined) {
      fail(
        "missing-field",
        "criteria.expectedFailureKinds",
        "the field is required (an empty list is honest)",
      );
    } else if (!Array.isArray(kinds)) {
      fail(
        "type-mismatch",
        "criteria.expectedFailureKinds",
        "expected an array of closed-vocabulary failure kinds",
      );
    } else if (kinds.length > 8) {
      fail("value-out-of-range", "criteria.expectedFailureKinds", "more than 8 expected failure kinds");
    } else {
      const seen = new Set<string>();
      for (const [index, entry] of (kinds as unknown[]).entries()) {
        if (!isFailureKind(entry)) {
          fail(
            "vocabulary-violation",
            `criteria.expectedFailureKinds[${index}]`,
            `'${String(entry)}' is not in the CLOSED failure vocabulary — criteria cannot invent failure kinds`,
          );
        } else if (seen.has(entry as string)) {
          fail(
            "value-out-of-range",
            `criteria.expectedFailureKinds[${index}]`,
            `failure kind '${String(entry)}' is declared twice`,
          );
        } else {
          seen.add(entry as string);
          expectedFailureKinds.push(entry as FailureKind);
        }
      }
    }
  } else {
    fail("type-mismatch", "criteria", "expected the evaluation criteria object");
  }

  /* Expected/criteria consistency ------------------------------------- */

  if (expectedKind !== null && thresholdsValidated && failureKindsValidated) {
    const thresholdCount = (criteria["thresholds"] as unknown[]).length;
    if (expectedKind === "explicit-refusal") {
      if (expectedFailureKinds.length === 0) {
        fail(
          "expected-criteria-conflict",
          "criteria.expectedFailureKinds",
          "an explicit-refusal expectation must enumerate the LAWFUL explicit failure kinds (non-empty)",
        );
      }
    } else {
      if (expectedFailureKinds.length > 0) {
        fail(
          "expected-criteria-conflict",
          "criteria.expectedFailureKinds",
          `a '${expectedKind}' content expectation declares metric thresholds and NO expected failure kinds (a good result answers outputs, not refusals)`,
        );
      }
      if (thresholdCount === 0) {
        fail(
          "expected-criteria-conflict",
          "criteria.thresholds",
          `a '${expectedKind}' content expectation must declare at least one metric threshold — criteria are never silent`,
        );
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  // Post-validation trusted cast (every field validated above).
  const descriptor = value as unknown as RealityEvalScenarioDescriptor;
  return { ok: true, descriptor };
}

/* ------------------------------------------------------------------ */
/* The complete-scenario validation                                     */
/* ------------------------------------------------------------------ */

export interface ScenarioCompletionValidation {
  readonly ok: boolean;
  readonly scenario?: RealityEvalScenario;
  readonly failures: readonly ScenarioValidationFailure[];
}

/**
 * Validates the COMPLETE scenario form (descriptor + the provider's declared
 * execution). The declared execution is validated structurally here (an
 * object declaring outputs XOR an explicit closed-vocabulary failure); the
 * control plane's `normalizeResult` re-validates it against the profile's
 * declared OUTPUT contract at evaluation time.
 */
export function validateRealityEvalScenario(value: unknown): ScenarioCompletionValidation {
  const descriptorValidation = validateRealityEvalScenarioDescriptor(value);
  if (!descriptorValidation.ok) {
    return { ok: false, failures: descriptorValidation.failures };
  }
  if (!isRecord(value)) {
    // Unreachable (the descriptor validation just passed on this value).
    return { ok: false, failures: [] };
  }
  const declaredExecution = value["declaredExecution"];
  if (!isRecord(declaredExecution)) {
    return {
      ok: false,
      failures: [
        {
          kind: "missing-field",
          path: "declaredExecution",
          detail:
            "the complete scenario must carry the provider's declared result (outputs or an explicit failure)",
        },
      ],
    };
  }
  const outputs = declaredExecution["outputs"];
  const failure = declaredExecution["failure"];
  if (outputs !== undefined && failure !== undefined) {
    return {
      ok: false,
      failures: [
        {
          kind: "expected-criteria-conflict",
          path: "declaredExecution",
          detail: "the declared execution carries BOTH outputs and a failure — exactly one is required",
        },
      ],
    };
  }
  if (outputs === undefined && failure === undefined) {
    return {
      ok: false,
      failures: [
        {
          kind: "missing-field",
          path: "declaredExecution",
          detail: "the declared execution must declare outputs or an explicit failure — neither is present",
        },
      ],
    };
  }
  if (failure !== undefined && isRecord(failure) && !isFailureKind(failure["kind"])) {
    return {
      ok: false,
      failures: [
        {
          kind: "vocabulary-violation",
          path: "declaredExecution.failure.kind",
          detail: `'${String(failure["kind"])}' is not in the CLOSED failure vocabulary`,
        },
      ],
    };
  }
  const scenario = value as unknown as RealityEvalScenario;
  return { ok: true, scenario, failures: [] };
}

/** Completes a validated descriptor with the provider's declared execution. */
export function completeScenario(
  descriptor: RealityEvalScenarioDescriptor,
  declaredExecution: RawProviderExecution,
): RealityEvalScenario {
  return { ...descriptor, declaredExecution };
}

/* ------------------------------------------------------------------ */
/* The committed scenario set (the benchmark's data form)               */
/* ------------------------------------------------------------------ */

export const REALITY_EVAL_SCENARIO_SET_KIND = "reality-eval-scenario-set" as const;
export const REALITY_EVAL_SCENARIO_SET_SCHEMA_VERSION = "reality-eval-scenario-set/1" as const;

/**
 * The COMMITTED Layer-1 scenario set: the fixture provider declarations
 * (control-plane `ProviderProfile`s) + the committed scenario descriptors.
 * This is the data form committed at `tools/reality-eval/scenario.json`;
 * the suite runner registers the declared providers into an append-only
 * registry log and evaluates every scenario through the harness.
 */
export interface RealityEvalScenarioSet {
  readonly kind: typeof REALITY_EVAL_SCENARIO_SET_KIND;
  readonly schemaVersion: typeof REALITY_EVAL_SCENARIO_SET_SCHEMA_VERSION;
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly benchmarkVersion: string;
  readonly providers: readonly ProviderProfile[];
  readonly scenarios: readonly RealityEvalScenarioDescriptor[];
}

/** One scenario evaluation's golden projection (record + manifest + verdict). */
export interface ScenarioEvaluationProjection {
  readonly scenarioId: string;
  readonly scenarioClass: ScenarioClass;
  readonly verdict: "pass" | "fail";
  readonly failureObservationKinds: readonly string[];
  readonly discriminationCaught: boolean;
  readonly record: BenchmarkRecord;
  readonly manifest: ProvenanceManifest;
}

export const REALITY_EVAL_OUTCOMES_KIND = "reality-eval-expected-outcomes" as const;
export const REALITY_EVAL_OUTCOMES_SCHEMA_VERSION = "reality-eval-outcomes/1" as const;

/**
 * The committed GOLDEN OUTCOMES of the Layer-1 evaluation suite: the
 * per-scenario evaluation projections (the control-plane BenchmarkRecords +
 * ProvenanceManifests) plus the full append-only registry event log the
 * suite produced (byte-replayable). Committed at
 * `tools/reality-eval/fixtures/expected-outcomes.json`.
 */
export interface RealityEvalGoldenOutcomes {
  readonly kind: typeof REALITY_EVAL_OUTCOMES_KIND;
  readonly schemaVersion: typeof REALITY_EVAL_OUTCOMES_SCHEMA_VERSION;
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly benchmarkVersion: string;
  /** sha-256 over the canonical JSON of the committed scenario set. */
  readonly scenarioSetDigest: string;
  readonly evaluations: readonly ScenarioEvaluationProjection[];
  readonly registryLog: readonly ProviderRegistryEvent[];
}

/** sha-256 over the canonical JSON of the scenario set (the set's content address). */
export function scenarioSetDigestOf(set: RealityEvalScenarioSet): string {
  return sha256Hex(canonicalJsonStringify(set));
}

export type ScenarioSetValidation =
  | { readonly ok: true; readonly set: RealityEvalScenarioSet }
  | { readonly ok: false; readonly failures: readonly ScenarioValidationFailure[] };

/**
 * Validates an unknown payload as a `RealityEvalScenarioSet`: the typed
 * seal, the suite identity fields, EVERY provider declaration through the
 * control plane's `validateProviderProfile`, every scenario descriptor
 * through `validateRealityEvalScenarioDescriptor`, and the cross-reference
 * coherence (every scenario's provider reference resolves to a declared
 * provider whose capabilities cover the scenario capability). PURE, typed
 * failures, no throws.
 */
export function validateRealityEvalScenarioSet(value: unknown): ScenarioSetValidation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a scenario set must be a JSON object" },
      ],
    };
  }
  const record = value as Record<string, unknown>;
  const failures: ScenarioValidationFailure[] = [];
  const fail = (kind: ScenarioValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (record["kind"] !== REALITY_EVAL_SCENARIO_SET_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${REALITY_EVAL_SCENARIO_SET_KIND}'`);
  }
  if (record["schemaVersion"] !== REALITY_EVAL_SCENARIO_SET_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${REALITY_EVAL_SCENARIO_SET_SCHEMA_VERSION}'`,
    );
  }
  for (const path of ["suiteId", "suiteVersion", "benchmarkVersion"] as const) {
    const field = record[path];
    if (!isNonEmptyString(field) || (field as string).length > 128) {
      fail("type-mismatch", path, "expected a non-empty string (max 128)");
    }
  }

  const providers = record["providers"];
  const declaredProviders = new Map<string, ProviderProfile>();
  if (!Array.isArray(providers) || providers.length === 0) {
    fail("type-mismatch", "providers", "expected a non-empty array of provider declarations");
  } else {
    for (const [index, entry] of (providers as unknown[]).entries()) {
      const profileValidation = validateProviderProfile(entry);
      if (!profileValidation.ok) {
        const issues = profileValidation.failures
          .map((failure) => `${failure.path || "(root)"} ${failure.detail}`)
          .join("; ");
        fail(
          "type-mismatch",
          `providers[${index}]`,
          `the provider declaration failed control-plane profile validation: ${issues}`,
        );
        continue;
      }
      const profile = entry as ProviderProfile;
      declaredProviders.set(`${profile.providerId}\u{0000}${profile.technologyVersion}`, profile);
    }
  }

  const scenarios = record["scenarios"];
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    fail("type-mismatch", "scenarios", "expected a non-empty array of scenario descriptors");
  } else {
    const scenarioIds = new Set<string>();
    for (const [index, entry] of (scenarios as unknown[]).entries()) {
      const scenarioValidation = validateRealityEvalScenarioDescriptor(entry);
      if (!scenarioValidation.ok) {
        const issues = scenarioValidation.failures
          .map((failure) => `${failure.path || "(root)"} ${failure.kind}: ${failure.detail}`)
          .join("; ");
        fail(
          "type-mismatch",
          `scenarios[${index}]`,
          `the scenario descriptor failed typed validation: ${issues}`,
        );
        continue;
      }
      const descriptor = scenarioValidation.descriptor;
      if (scenarioIds.has(descriptor.scenarioId)) {
        fail(
          "value-out-of-range",
          `scenarios[${index}].scenarioId`,
          `scenario id '${descriptor.scenarioId}' is declared twice`,
        );
      }
      scenarioIds.add(descriptor.scenarioId);
      const provider = declaredProviders.get(
        `${descriptor.providerReference.providerId}\u{0000}${descriptor.providerReference.technologyVersion}`,
      );
      if (provider === undefined) {
        fail(
          "value-out-of-range",
          `scenarios[${index}].providerReference`,
          `no declared provider matches '${descriptor.providerReference.providerId}' ` +
            `(${descriptor.providerReference.technologyVersion})`,
        );
        continue;
      }
      if (!(provider.capabilities as readonly string[]).includes(descriptor.capability)) {
        fail(
          "value-out-of-range",
          `scenarios[${index}].capability`,
          `the referenced provider does not offer capability '${descriptor.capability}' ` +
            `(offered: [${provider.capabilities.join(", ")}])`,
        );
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, set: value as unknown as RealityEvalScenarioSet };
}
