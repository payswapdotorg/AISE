/**
 * PROD-027 — the Layer-1 evaluation scenario MODEL tests (the pure typed
 * validators: scenario descriptors, complete scenarios, the committed
 * scenario set).
 *
 * Proves the typed-validation discipline: every malformed scenario shape
 * answers a TYPED failure (never a throw, never a silent pass); the
 * canonical expected-outcome union rejects non-Layer-1 kinds; the criteria
 * enforce the closed failure vocabulary and the expected/criteria
 * consistency rules; the scenario set's cross-references resolve.
 */

import { describe, expect, test } from "bun:test";
import {
  CAPABILITY_LANE_STATUS,
  completeScenario,
  EXPECTED_OUTCOME_KINDS,
  LANE_BENCHMARK_IDS,
  REALITY_EVAL_SCENARIO_KIND,
  REALITY_EVAL_SCENARIO_SCHEMA_VERSION,
  SCENARIO_CLASSES,
  validateRealityEvalScenario,
  validateRealityEvalScenarioDescriptor,
  validateRealityEvalScenarioSet,
  type RealityEvalScenarioDescriptor,
} from "./model";
import {
  realityEvalScenarioSet,
  executeFixtureProvider,
  fixtureReconstructionProfileV1,
  RECONSTRUCTION_PROVIDER_ID,
  RECONSTRUCTION_TECHNOLOGY_VERSION_V1,
} from "./testkit";

const SET = realityEvalScenarioSet();
const VALID_DESCRIPTOR: RealityEvalScenarioDescriptor = SET.scenarios[0]!;

function kindsOf(failures: readonly { readonly kind: string }[]): string[] {
  return failures.map((failure) => failure.kind);
}

describe("PROD-027 model: the scenario descriptor validator", () => {
  test("a committed descriptor validates (the golden path)", () => {
    const validation = validateRealityEvalScenarioDescriptor(VALID_DESCRIPTOR);
    expect(validation.ok).toBe(true);
  });

  test("a non-object is a typed not-an-object failure", () => {
    const validation = validateRealityEvalScenarioDescriptor("not a scenario");
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]!.kind).toBe("not-an-object");
    }
  });

  test("the typed seal and schema version are enforced", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      kind: "provider-scenario",
      schemaVersion: "reality-eval-scenario/2",
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(kindsOf(validation.failures)).toContain("type-mismatch");
    }
  });

  test("an unknown capability is a typed failure", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      capability: "navigation",
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(kindsOf(validation.failures)).toContain("unknown-capability");
    }
  });

  test("a benchmarkId that is not the capability's PINNED Layer-1 benchmark is refused", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      benchmarkId: "my-custom-bench/7",
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const failures = validation.failures.filter(
        (failure) => failure.path === "benchmarkId",
      );
      expect(failures.length).toBe(1);
      expect(failures[0]!.kind).toBe("value-out-of-range");
      expect(failures[0]!.detail).toContain("PINNED");
    }
  });

  test("the four named capabilities and their pinned benchmark ids form the closed lane table", () => {
    expect(Object.keys(LANE_BENCHMARK_IDS).sort()).toEqual([
      "capture-readiness",
      "depth",
      "reconstruction",
      "retrieval",
    ]);
    expect(LANE_BENCHMARK_IDS.reconstruction).toBe("reality-eval-reconstruction/1");
    expect(LANE_BENCHMARK_IDS.depth).toBe("reality-eval-depth/1");
    expect(CAPABILITY_LANE_STATUS.reconstruction).toBe("available");
    expect(CAPABILITY_LANE_STATUS.depth).toBe("available");
    expect(SCENARIO_CLASSES).toEqual(["positive", "negative", "discrimination"]);
    expect(EXPECTED_OUTCOME_KINDS).toEqual([
      "reconstruction-scene",
      "depth-grid",
      "explicit-refusal",
    ]);
  });

  test("the input fixture's capability must equal the scenario capability", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      input: { ...VALID_DESCRIPTOR.input, capability: "depth" },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some(
          (failure) => failure.path === "input.capability" && failure.kind === "value-out-of-range",
        ),
      ).toBe(true);
    }
  });

  test("a provider-native payload shape is NOT a legal expected outcome kind", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      expected: { kind: "map-anything-mesh", mesh: { vertices: 12 } },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(kindsOf(validation.failures)).toContain("unknown-expected-kind");
    }
  });

  test("a depth-grid expectation must be meters with a full row-major grid", () => {
    const depthScenario = SET.scenarios.find(
      (entry) => entry.scenarioId === "depth-wall-positive-005",
    )!;
    const wrongUnit = validateRealityEvalScenarioDescriptor({
      ...depthScenario,
      expected: { ...(depthScenario.expected as object), unit: "ft" },
    });
    expect(wrongUnit.ok).toBe(false);
    if (!wrongUnit.ok) {
      expect(
        wrongUnit.failures.some((failure) => failure.path === "expected.unit"),
      ).toBe(true);
    }

    const wrongCount = validateRealityEvalScenarioDescriptor({
      ...depthScenario,
      expected: {
        ...(depthScenario.expected as object),
        gridWidth: 8,
      },
    });
    expect(wrongCount.ok).toBe(false);
    if (!wrongCount.ok) {
      expect(
        wrongCount.failures.some((failure) => failure.path === "expected.truthM"),
      ).toBe(true);
    }
  });

  test("criteria cannot invent failure kinds (the vocabulary is closed)", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      criteria: {
        ...VALID_DESCRIPTOR.criteria,
        thresholds: VALID_DESCRIPTOR.criteria.thresholds.map((threshold) => ({
          ...threshold,
          failureKind: "hallucinated-geometry",
        })),
      },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some(
          (failure) =>
            failure.path.startsWith("criteria.thresholds[") &&
            failure.path.endsWith(".failureKind") &&
            failure.kind === "vocabulary-violation",
        ),
      ).toBe(true);
    }
  });

  test("a content expectation with expected failure kinds is a typed conflict", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      criteria: {
        ...VALID_DESCRIPTOR.criteria,
        expectedFailureKinds: ["perception-failure"],
      },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(kindsOf(validation.failures)).toContain("expected-criteria-conflict");
    }
  });

  test("a content expectation without thresholds is a typed conflict (criteria are never silent)", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      criteria: { thresholds: [], expectedFailureKinds: [] },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(kindsOf(validation.failures)).toContain("expected-criteria-conflict");
    }
  });

  test("an explicit-refusal expectation without expected kinds is a typed conflict", () => {
    const negative = SET.scenarios.find(
      (entry) => entry.scenarioId === "depth-unsupported-negative-006",
    )!;
    const validation = validateRealityEvalScenarioDescriptor({
      ...negative,
      criteria: { thresholds: [], expectedFailureKinds: [] },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(kindsOf(validation.failures)).toContain("expected-criteria-conflict");
    }
  });

  test("a metric threshold declared twice is a typed failure (one bar per metric)", () => {
    const validation = validateRealityEvalScenarioDescriptor({
      ...VALID_DESCRIPTOR,
      criteria: {
        ...VALID_DESCRIPTOR.criteria,
        thresholds: [
          ...VALID_DESCRIPTOR.criteria.thresholds,
          VALID_DESCRIPTOR.criteria.thresholds[0]!,
        ],
      },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(kindsOf(validation.failures)).toContain("duplicate-threshold-metric");
    }
  });
});

describe("PROD-027 model: the complete-scenario validation", () => {
  test("a completed scenario (descriptor + declared execution) validates", () => {
    const execution = executeFixtureProvider(
      fixtureReconstructionProfileV1(),
      VALID_DESCRIPTOR.input,
    );
    const scenario = completeScenario(VALID_DESCRIPTOR, execution);
    const validation = validateRealityEvalScenario(scenario);
    expect(validation.ok).toBe(true);
    expect(validation.scenario?.declaredExecution).toEqual(execution);
  });

  test("a scenario without the declared execution is a typed missing-field failure", () => {
    const validation = validateRealityEvalScenario(VALID_DESCRIPTOR);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]!.kind).toBe("missing-field");
      expect(validation.failures[0]!.path).toBe("declaredExecution");
    }
  });

  test("a declared execution with BOTH outputs and a failure is refused", () => {
    const execution = executeFixtureProvider(
      fixtureReconstructionProfileV1(),
      VALID_DESCRIPTOR.input,
    );
    const scenario = completeScenario(VALID_DESCRIPTOR, {
      ...execution,
      failure: { kind: "timeout", detail: "both declared" },
    });
    const validation = validateRealityEvalScenario(scenario);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]!.kind).toBe("expected-criteria-conflict");
    }
  });

  test("a declared execution with an out-of-vocabulary failure kind is refused", () => {
    const scenario = completeScenario(VALID_DESCRIPTOR, {
      capability: "reconstruction",
      failure: { kind: "invented-failure", detail: "not in the vocabulary" },
    });
    const validation = validateRealityEvalScenario(scenario);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]!.kind).toBe("vocabulary-violation");
    }
  });
});

describe("PROD-027 model: the committed scenario-set validation", () => {
  test("the built committed set validates (providers through the control-plane profile validator)", () => {
    const validation = validateRealityEvalScenarioSet(SET);
    expect(validation.ok).toBe(true);
  });

  test("a set whose scenario references an undeclared provider is refused", () => {
    const validation = validateRealityEvalScenarioSet({
      ...SET,
      providers: [fixtureReconstructionProfileV1()],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.path.includes("providerReference")),
      ).toBe(true);
    }
  });

  test("a set whose provider does not offer the scenario capability is refused", () => {
    const validation = validateRealityEvalScenarioSet({
      ...SET,
      scenarios: SET.scenarios.map((scenario) => ({
        ...scenario,
        providerReference: {
          providerId: RECONSTRUCTION_PROVIDER_ID,
          technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V1,
        },
      })),
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.path.includes(".capability")),
      ).toBe(true);
    }
  });

  test("a set with a duplicate scenario id is refused", () => {
    const validation = validateRealityEvalScenarioSet({
      ...SET,
      scenarios: [...SET.scenarios, SET.scenarios[0]!],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.path.includes(".scenarioId")),
      ).toBe(true);
    }
  });

  test("a set with an invalid provider profile is refused with the profile issues", () => {
    const broken = fixtureReconstructionProfileV1() as unknown as Record<string, unknown>;
    delete broken["license"];
    const validation = validateRealityEvalScenarioSet({ ...SET, providers: [broken] });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.path === "providers[0]"),
      ).toBe(true);
    }
  });

  test("the typed seals are exported constants (committed artifacts carry them)", () => {
    expect(REALITY_EVAL_SCENARIO_KIND).toBe("reality-eval-scenario");
    expect(REALITY_EVAL_SCENARIO_SCHEMA_VERSION).toBe("reality-eval-scenario/1");
  });
});
