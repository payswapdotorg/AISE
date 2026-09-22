/**
 * PROD-029 model tests — the substitution-scenario parser, the closed
 * vocabularies and the CANONICAL-BOUNDARY GUARD (the projection refusals:
 * provider-specific types must never reach a canonical comparison point).
 */

import { describe, expect, test } from "bun:test";
import {
  BASELINE_FIXTURE_IDS,
  COMPARISON_POINT_KINDS,
  DIVERGENCE_KIND_BY_POINT,
  SEAM_BASELINE_PAIRING,
  SEAM_CAPABILITIES,
  SOLUTION_EVAL_ERROR_CODES,
  SUBSTITUTION_REFUSAL_KINDS,
  SUBSTITUTION_SEAMS,
  SUBSTITUTION_VERDICTS,
  isCanonicalDigest,
  parseSubstitutionScenario,
  projectCanonicalBoqLines,
  projectCanonicalDigest,
  projectCanonicalIntentSemantics,
  projectCanonicalQuantities,
  projectCanonicalValidationChecks,
  projectCanonicalVerdict,
  SolutionEvalError,
} from "./model";
import { canonicalJsonText, committedScenarioMatrix } from "./fixtures";

/* ------------------------------------------------------------------ */
/* Frozen registries                                                    */
/* ------------------------------------------------------------------ */

describe("solution-eval model: frozen registries", () => {
  test("the four Layer-3 seams are frozen reference data", () => {
    expect([...SUBSTITUTION_SEAMS]).toEqual([
      "operation-compiler",
      "engine-execution",
      "validation",
      "boq-derivation",
    ]);
    expect(Object.isFrozen(SUBSTITUTION_SEAMS)).toBe(true);
  });

  test("every seam names its control-plane capability and its committed baseline", () => {
    for (const seam of SUBSTITUTION_SEAMS) {
      expect(SEAM_CAPABILITIES[seam]).toBe(`layer3-${seam}`);
      expect(BASELINE_FIXTURE_IDS).toContain(SEAM_BASELINE_PAIRING[seam]);
    }
    expect(SEAM_BASELINE_PAIRING["operation-compiler"]).toBe("command-corpus-slice/1");
    expect(SEAM_BASELINE_PAIRING["engine-execution"]).toBe("wall-upgrade-journey/1");
    expect(SEAM_BASELINE_PAIRING.validation).toBe("wall-upgrade-journey/1");
    expect(SEAM_BASELINE_PAIRING["boq-derivation"]).toBe("wall-upgrade-journey/1");
  });

  test("the divergence taxonomy maps comparison points onto the closed failure vocabulary", () => {
    expect(DIVERGENCE_KIND_BY_POINT["operation-identity"]).toBe("operation-semantic-failure");
    expect(DIVERGENCE_KIND_BY_POINT["state-digest"]).toBe("operation-semantic-failure");
    expect(DIVERGENCE_KIND_BY_POINT["quantity-value"]).toBe("operation-semantic-failure");
    expect(DIVERGENCE_KIND_BY_POINT["validation-verdict"]).toBe("reasoning-failure");
    expect(DIVERGENCE_KIND_BY_POINT["boq-line"]).toBe("operation-semantic-failure");
    expect(Object.keys(DIVERGENCE_KIND_BY_POINT).length).toBe(COMPARISON_POINT_KINDS.length);
  });

  test("the verdict/refusal/error registries are frozen and non-empty", () => {
    expect(Object.isFrozen(SOLUTION_EVAL_ERROR_CODES)).toBe(true);
    expect(Object.isFrozen(SUBSTITUTION_REFUSAL_KINDS)).toBe(true);
    expect([...SUBSTITUTION_VERDICTS]).toEqual([
      "substitution-proven",
      "divergence-recorded",
      "substitution-refused",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Scenario parsing                                                     */
/* ------------------------------------------------------------------ */

describe("solution-eval model: scenario parsing", () => {
  test("every committed matrix scenario parses", () => {
    for (const scenario of committedScenarioMatrix()) {
      const parsed = parseSubstitutionScenario(JSON.parse(JSON.stringify(scenario)));
      expect(parsed.scenarioId).toBe(scenario.scenarioId);
      expect(parsed.seam).toBe(scenario.seam);
    }
  });

  test("a scenario missing the typed seal is refused", () => {
    expect(() => parseSubstitutionScenario({})).toThrow(SolutionEvalError);
    try {
      parseSubstitutionScenario({ scenarioId: "x" });
      throw new Error("unreachable");
    } catch (error) {
      expect(error instanceof SolutionEvalError).toBe(true);
      expect((error as SolutionEvalError).code).toBe("invalid_scenario");
    }
  });

  test("an unknown seam is refused with the closed vocabulary named", () => {
    const scenario = JSON.parse(
      JSON.stringify(committedScenarioMatrix()[0]),
    ) as Record<string, unknown>;
    scenario["seam"] = "rendering";
    try {
      parseSubstitutionScenario(scenario);
      throw new Error("unreachable");
    } catch (error) {
      expect(error instanceof SolutionEvalError).toBe(true);
      expect((error as SolutionEvalError).detail).toContain("operation-compiler");
    }
  });

  test("a seam/baseline pairing violation is refused", () => {
    const scenario = JSON.parse(
      JSON.stringify(committedScenarioMatrix()[0]),
    ) as Record<string, unknown>;
    scenario["baselineId"] = "wall-upgrade-journey/1";
    expect(() => parseSubstitutionScenario(scenario)).toThrow(SolutionEvalError);
  });

  test("a substitutedRun capability that does not name the seam is refused", () => {
    const scenario = JSON.parse(
      JSON.stringify(committedScenarioMatrix()[0]),
    ) as Record<string, unknown>;
    const run = scenario["substitutedRun"] as Record<string, unknown>;
    run["capability"] = "layer3-boq-derivation";
    expect(() => parseSubstitutionScenario(scenario)).toThrow(SolutionEvalError);
  });

  test("a declared-divergence scenario MUST declare an expected failure kind from the closed vocabulary", () => {
    const scenario = JSON.parse(
      JSON.stringify(committedScenarioMatrix()[1]),
    ) as Record<string, unknown>;
    delete scenario["expectedDivergenceKind"];
    try {
      parseSubstitutionScenario(scenario);
      throw new Error("unreachable");
    } catch (error) {
      expect((error as SolutionEvalError).detail).toContain("CLOSED failure vocabulary");
    }

    const invented = JSON.parse(JSON.stringify(scenario)) as Record<string, unknown>;
    invented["expectedDivergenceKind"] = "vendor-specific-failure";
    expect(() => parseSubstitutionScenario(invented)).toThrow(SolutionEvalError);
  });

  test("a canonical-equality scenario must NOT declare an expected failure kind", () => {
    const scenario = JSON.parse(
      JSON.stringify(committedScenarioMatrix()[0]),
    ) as Record<string, unknown>;
    scenario["expectedDivergenceKind"] = "operation-semantic-failure";
    expect(() => parseSubstitutionScenario(scenario)).toThrow(SolutionEvalError);
  });

  test("an empty declared run is refused — a substitute answers every input", () => {
    const scenario = JSON.parse(
      JSON.stringify(committedScenarioMatrix()[0]),
    ) as Record<string, unknown>;
    const run = scenario["substitutedRun"] as Record<string, unknown>;
    run["executions"] = [];
    expect(() => parseSubstitutionScenario(scenario)).toThrow(SolutionEvalError);
  });
});

/* ------------------------------------------------------------------ */
/* The canonical-boundary guard (projection refusals)                    */
/* ------------------------------------------------------------------ */

describe("solution-eval model: the canonical-boundary guard", () => {
  const semantics = {
    operationType: "excavation",
    vertical: "building",
    parameters: [
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
    ],
    target: {
      selectorKind: "volume",
      nodeRefs: ["node-site-001"],
      geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
      units: { linear: "m", angular: "rad" },
    },
    dependsOn: [],
  };

  test("a canonical intent semantics projection passes", () => {
    const outcome = projectCanonicalIntentSemantics(canonicalJsonText(semantics));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.projected.operationType).toBe("excavation");
      expect(outcome.projected.parameters).toHaveLength(2);
    }
  });

  test("a provider-specific field inside the semantics is REFUSED (contract-mismatch)", () => {
    const smuggled = { ...semantics, vendorOperationRef: "vendor-internal-op-42" };
    const outcome = projectCanonicalIntentSemantics(canonicalJsonText(smuggled));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.refusalKind).toBe("contract-mismatch");
      expect(outcome.refusal.detail).toContain("vendorOperationRef");
    }
  });

  test("a provider-specific parameter representation is REFUSED", () => {
    const nested = {
      ...semantics,
      parameters: [{ name: "depth", value: { vendorValue: 1.5 } }],
    };
    const outcome = projectCanonicalIntentSemantics(canonicalJsonText(nested));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.refusalKind).toBe("contract-mismatch");
    }
  });

  test("a numeric parameter without a unit is REFUSED (the canonical rule)", () => {
    const unitless = {
      ...semantics,
      parameters: [{ name: "depth", value: 1.5 }],
    };
    const outcome = projectCanonicalIntentSemantics(canonicalJsonText(unitless));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.detail).toContain("REQUIRE a unit");
    }
  });

  test("a non-JSON payload is refused, never coerced", () => {
    const outcome = projectCanonicalIntentSemantics("{not json");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.refusalKind).toBe("contract-mismatch");
    }
  });

  test("an invented quantity dimension is REFUSED", () => {
    const outcome = projectCanonicalQuantities(
      canonicalJsonText([
        {
          label: "vendor-mass-flow",
          dimension: "mass-flow",
          value: 1,
          unit: "kg/s",
          direction: "added",
          calculationRef: "vendor/flow/v1",
        },
      ]),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.detail).toContain("QUANTITY_DIMENSIONS");
    }
  });

  test("an invented validation check result is REFUSED", () => {
    const outcome = projectCanonicalValidationChecks(
      canonicalJsonText([{ checkId: "operation.contract-invariants", result: "warning" }]),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.detail).toContain("VALIDATION_CHECK_RESULTS");
    }
  });

  test("an empty checks array is REFUSED (a canonical snapshot is never silent)", () => {
    const outcome = projectCanonicalValidationChecks(canonicalJsonText([]));
    expect(outcome.ok).toBe(false);
  });

  test("an invented validation outcome is REFUSED", () => {
    const outcome = projectCanonicalVerdict("outcome", "probably-pass");
    expect(outcome.ok).toBe(false);
  });

  test("a provider-specific digest format is REFUSED at the canonical boundary", () => {
    expect(projectCanonicalDigest("stateContentDigest", "vendor:op:123").ok).toBe(false);
    expect(projectCanonicalDigest("stateContentDigest", "XYZ").ok).toBe(false);
    expect(projectCanonicalDigest("stateContentDigest", 42).ok).toBe(false);
    expect(
      projectCanonicalDigest("stateContentDigest", "a".repeat(63)).ok,
    ).toBe(false);
    expect(
      projectCanonicalDigest(
        "stateContentDigest",
        "36eecf9f9d3d74281d195c5e0c197ced355d70b7f244c5513d92fa102a0f3e5b",
      ).ok,
    ).toBe(true);
  });

  test("isCanonicalDigest accepts only 64 lowercase hex", () => {
    expect(isCanonicalDigest("0".repeat(64))).toBe(true);
    expect(isCanonicalDigest("G".repeat(64))).toBe(false);
    expect(isCanonicalDigest("0".repeat(63))).toBe(false);
    expect(isCanonicalDigest(null)).toBe(false);
  });

  test("a provider-specific BOQ line field is REFUSED", () => {
    const outcome = projectCanonicalBoqLines(
      canonicalJsonText([
        {
          activity: "block-wall-placement",
          direction: "added",
          dimension: "count",
          unit: "count",
          value: 65,
          calculationRef: "aise-solution-engine/quantity/block-wall-placement/v1",
          vendorLineCode: "BLK-001",
        },
      ]),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.detail).toContain("vendorLineCode");
    }
  });

  test("a bare-number BOQ quantity (no unit) is REFUSED", () => {
    const outcome = projectCanonicalBoqLines(
      canonicalJsonText([
        {
          activity: "block-wall-placement",
          direction: "added",
          dimension: "count",
          value: 65,
          calculationRef: "x",
        },
      ]),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.detail).toContain("never a bare number");
    }
  });
});
