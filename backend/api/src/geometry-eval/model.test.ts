/**
 * HFX-302 — the substitution MODEL tests: the closed vocabularies, the
 * declared tolerance model's pure predicate and the two fail-closed
 * validators (the capability-honesty gate + the sequence rules).
 */

import { describe, expect, test } from "bun:test";
import {
  GEOMETRY_EVAL_ERROR_CODES,
  GEOMETRY_PROVIDER_DESCRIPTOR_KIND,
  GEOMETRY_SUBSTITUTE_PROFILE_IDS,
  RESOLUTION_STRATEGIES,
  SUBSTITUTION_COMPARISON_POINT_KINDS,
  SUBSTITUTION_DIVERGENCE_KIND_BY_POINT,
  SUBSTITUTION_EXPECTATIONS,
  TOPOLOGY_CONSTRAINT_KINDS,
  GeometryEvalError,
  isCoatedOperationFamily,
  isSubstitutionExpectation,
  quantityToleranceEnvelope,
  validateGeometryProviderDescriptor,
  validateSubstitutionSequence,
  withinQuantityTolerance,
} from "./model";
import type {
  GeometryProviderDescriptor,
  QuantityToleranceTable,
  SubstitutionSequence,
} from "./model";
import { DIVERGENCE_KIND_BY_POINT } from "../solution-eval/model";

/* ------------------------------------------------------------------ */
/* Shared fixture builders (pure inline data — no I/O, no clock)        */
/* ------------------------------------------------------------------ */

const TEST_TOLERANCES: QuantityToleranceTable = Object.freeze({
  length: { absolute: 0.02, relative: 0.01 },
  area: { absolute: 0.05, relative: 0.02 },
  volume: { absolute: 0.05, relative: 0.02 },
  mass: { absolute: 0.5, relative: 0.02 },
  count: { absolute: 0, relative: 0 },
  duration: { absolute: 0, relative: 0 },
});

function validDescriptor(): GeometryProviderDescriptor {
  return {
    kind: GEOMETRY_PROVIDER_DESCRIPTOR_KIND,
    providerId: "test-discretized-lane",
    technologyVersion: "1.0.0",
    declaredCapabilities: ["excavation", "backfill", "block-wall-placement"],
    resolution: {
      strategy: "discretized-grid",
      gridCellMeters: 0.01,
      blockModuleLengthMeters: 0.4,
      blockModuleHeightMeters: 0.2,
    },
    tolerances: TEST_TOLERANCES,
    provenance: {
      implementation: "geometry-eval/test-lane",
      codeVersion: "test/1",
      strategy: "discretized accumulation at the declared grid (test fixture)",
    },
  };
}

function validSequence(): SubstitutionSequence {
  return {
    sequenceId: "geo-sub-test-excavation",
    baselineSceneId: "geometry-demo-scene/1",
    steps: [
      {
        operationType: "excavation",
        parameters: [
          { name: "depth", value: 1.2, unit: "m" },
          { name: "width", value: 800, unit: "mm" },
          { name: "length", value: 503, unit: "cm" },
        ],
        target: {
          contractVersion: "1.0.0",
          selectorKind: "volume",
          nodeRefs: ["node-site-001"],
          geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
          units: { linear: "m", angular: "rad" },
          description: "the test pit area",
        },
      },
    ],
    substituteProfileId: "discretized-accumulation-fine",
    expectation: "compatible",
    notes: "the model-test fixture sequence",
  };
}

/* ------------------------------------------------------------------ */
/* The closed vocabularies                                              */
/* ------------------------------------------------------------------ */

describe("HFX-302 model: the closed vocabularies", () => {
  test("the three behavior-matrix cells are the frozen expectation vocabulary", () => {
    expect([...SUBSTITUTION_EXPECTATIONS]).toEqual([
      "compatible",
      "declared-incompatible",
      "unsupported-by-substitute",
    ]);
  });

  test("the membership check admits the cells and refuses inventions", () => {
    for (const cell of SUBSTITUTION_EXPECTATIONS) {
      expect(isSubstitutionExpectation(cell)).toBe(true);
    }
    expect(isSubstitutionExpectation("mostly-compatible")).toBe(false);
    expect(isSubstitutionExpectation(42)).toBe(false);
  });

  test("the substitute profile vocabulary is the closed three-profile set", () => {
    expect([...GEOMETRY_SUBSTITUTE_PROFILE_IDS]).toEqual([
      "discretized-accumulation-fine",
      "discretized-accumulation-coarse",
      "discretized-accumulation-partial",
    ]);
  });

  test("the comparison points reuse PROD-029's kinds + add the topology leg", () => {
    expect([...SUBSTITUTION_COMPARISON_POINT_KINDS]).toEqual([
      "quantity-value",
      "validation-verdict",
      "topology-constraint",
      "boq-line",
    ]);
    /* The shared points carry PROD-029's own divergence kinds (reused). */
    expect(SUBSTITUTION_DIVERGENCE_KIND_BY_POINT["quantity-value"]).toBe(
      DIVERGENCE_KIND_BY_POINT["quantity-value"],
    );
    expect(SUBSTITUTION_DIVERGENCE_KIND_BY_POINT["validation-verdict"]).toBe(
      DIVERGENCE_KIND_BY_POINT["validation-verdict"],
    );
    expect(SUBSTITUTION_DIVERGENCE_KIND_BY_POINT["boq-line"]).toBe(
      DIVERGENCE_KIND_BY_POINT["boq-line"],
    );
    /* The topology extension is an engineering-semantics divergence. */
    expect(SUBSTITUTION_DIVERGENCE_KIND_BY_POINT["topology-constraint"]).toBe(
      "operation-semantic-failure",
    );
  });

  test("the topology constraint vocabulary is the closed three-kind set", () => {
    expect([...TOPOLOGY_CONSTRAINT_KINDS]).toEqual([
      "target-anchored",
      "coated-surface-resolved",
      "dependency-backwards",
    ]);
  });

  test("the coated families are plaster + finish (the surface discipline)", () => {
    expect(isCoatedOperationFamily("plaster-application")).toBe(true);
    expect(isCoatedOperationFamily("finish-application")).toBe(true);
    expect(isCoatedOperationFamily("excavation")).toBe(false);
    expect(isCoatedOperationFamily("block-wall-placement")).toBe(false);
  });

  test("the resolution strategy + error registries are frozen", () => {
    expect([...RESOLUTION_STRATEGIES]).toEqual(["closed-form", "discretized-grid"]);
    expect([...GEOMETRY_EVAL_ERROR_CODES]).toEqual([
      "invalid_request",
      "invalid_descriptor",
      "invalid_sequence",
    ]);
    const error = new GeometryEvalError("invalid_sequence", "the detail");
    expect(error.code).toBe("invalid_sequence");
    expect(error.message).toBe("invalid_sequence: the detail");
  });
});

/* ------------------------------------------------------------------ */
/* The tolerance model (law 2: declared, never implicit)                */
/* ------------------------------------------------------------------ */

describe("HFX-302 model: the declared tolerance predicate", () => {
  const volumeTolerance = TEST_TOLERANCES.volume;

  test("an identical value is within tolerance (delta 0)", () => {
    expect(withinQuantityTolerance(volumeTolerance, 4.945, 4.945)).toBe(true);
  });

  test("the absolute component absorbs a small delta at a tiny reference", () => {
    expect(withinQuantityTolerance(volumeTolerance, 0.001, 0.04)).toBe(true);
    expect(withinQuantityTolerance(volumeTolerance, 0.001, 0.06)).toBe(false);
  });

  test("the relative component scales with the reference magnitude", () => {
    /* allowed = 0.05 + 0.02 × 100 = 2.05 */
    expect(withinQuantityTolerance(volumeTolerance, 100, 102)).toBe(true);
    expect(withinQuantityTolerance(volumeTolerance, 100, 102.05)).toBe(true);
    expect(withinQuantityTolerance(volumeTolerance, 100, 102.06)).toBe(false);
  });

  test("the boundary is inclusive (exact arithmetic, no epsilon)", () => {
    /* The predicate is EXACT — no hidden noise floor. The knife-edge cases
       below use exactly-representable values so the boundary semantics are
       observable without float-representation artifacts. */
    const absoluteOnly = { absolute: 0.25, relative: 0 };
    expect(quantityToleranceEnvelope(absoluteOnly, 4.5)).toBe(0.25);
    expect(withinQuantityTolerance(absoluteOnly, 4.5, 4.75)).toBe(true);
    expect(withinQuantityTolerance(absoluteOnly, 4.5, 4.750000001)).toBe(false);

    const relativeOnly = { absolute: 0, relative: 0.5 };
    expect(quantityToleranceEnvelope(relativeOnly, 2)).toBe(1);
    expect(withinQuantityTolerance(relativeOnly, 2, 3)).toBe(true);
    expect(withinQuantityTolerance(relativeOnly, 2, 3.0000001)).toBe(false);

    /* The combined envelope is auditable: 0.05 + 0.02 × 4.945 = 0.1489. */
    expect(quantityToleranceEnvelope(volumeTolerance, 4.945)).toBeCloseTo(0.1489, 12);
  });

  test("a zero tolerance demands exact equality (the count discipline)", () => {
    const countTolerance = TEST_TOLERANCES.count;
    expect(countTolerance).toEqual({ absolute: 0, relative: 0 });
    expect(withinQuantityTolerance(countTolerance, 66, 66)).toBe(true);
    expect(withinQuantityTolerance(countTolerance, 66, 65)).toBe(false);
    expect(withinQuantityTolerance(countTolerance, 66, 67)).toBe(false);
  });

  test("non-finite inputs fail closed", () => {
    expect(withinQuantityTolerance(volumeTolerance, Number.NaN, 1)).toBe(false);
    expect(withinQuantityTolerance(volumeTolerance, 1, Number.NaN)).toBe(false);
    expect(withinQuantityTolerance(volumeTolerance, Number.POSITIVE_INFINITY, 1)).toBe(false);
  });

  test("a malformed tolerance (negative or non-finite) fails closed", () => {
    expect(withinQuantityTolerance({ absolute: -0.1, relative: 0 }, 1, 1)).toBe(false);
    expect(withinQuantityTolerance({ absolute: 0, relative: Number.NaN }, 1, 1)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The descriptor validator (the capability-honesty gate)               */
/* ------------------------------------------------------------------ */

describe("HFX-302 model: the provider descriptor validator", () => {
  test("a well-formed discretized descriptor validates", () => {
    const validation = validateGeometryProviderDescriptor(validDescriptor());
    expect(validation.ok).toBe(true);
  });

  test("a closed-form descriptor validates (the reference oracle's form)", () => {
    const validation = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      resolution: { strategy: "closed-form" },
    });
    expect(validation.ok).toBe(true);
  });

  test("a non-object payload is refused with a typed finding", () => {
    const validation = validateGeometryProviderDescriptor("not a descriptor");
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.path).toBe("$");
    }
  });

  test("the typed seal is mandatory", () => {
    const validation = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      kind: "some-other-descriptor",
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.path === "kind")).toBe(true);
    }
  });

  test("CAPABILITY HONESTY: an over-declaring descriptor is rejected", () => {
    /* The sabotage twin: a provider claiming a family OUTSIDE the canonical
       operation vocabulary — a capability the adapter cannot gate. */
    const validation = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      declaredCapabilities: ["excavation", "hologram-projection"],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const failure = validation.failures.find((entry) =>
        entry.path.startsWith("declaredCapabilities["),
      );
      expect(failure?.detail).toContain("hologram-projection");
      expect(failure?.detail).toContain("may not over-declare");
    }
  });

  test("duplicate families and an empty capability set are rejected", () => {
    const duplicate = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      declaredCapabilities: ["excavation", "excavation"],
    });
    expect(duplicate.ok).toBe(false);
    const empty = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      declaredCapabilities: [],
    });
    expect(empty.ok).toBe(false);
  });

  test("a malformed resolution declaration is rejected", () => {
    for (const resolution of [
      { strategy: "quantum-superposition" },
      { strategy: "discretized-grid", gridCellMeters: 0, blockModuleLengthMeters: 0.4, blockModuleHeightMeters: 0.2 },
      { strategy: "discretized-grid", gridCellMeters: -0.01, blockModuleLengthMeters: 0.4, blockModuleHeightMeters: 0.2 },
      { strategy: "discretized-grid", gridCellMeters: 0.01, blockModuleLengthMeters: 0.4 },
      { strategy: "closed-form", gridCellMeters: 0.01 },
    ]) {
      const validation = validateGeometryProviderDescriptor({
        ...validDescriptor(),
        resolution,
      });
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.failures.some((entry) => entry.path.startsWith("resolution"))).toBe(true);
      }
    }
  });

  test("an incomplete or malformed tolerance table is rejected", () => {
    const missingDimension = { ...TEST_TOLERANCES };
    delete (missingDimension as Record<string, unknown>)["volume"];
    const missing = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      tolerances: missingDimension,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.failures.some((entry) => entry.path === "tolerances.volume")).toBe(true);
    }

    const negative = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      tolerances: { ...TEST_TOLERANCES, area: { absolute: -1, relative: 0 } },
    });
    expect(negative.ok).toBe(false);
  });

  test("a missing provenance identity is rejected", () => {
    const validation = validateGeometryProviderDescriptor({
      ...validDescriptor(),
      provenance: { implementation: "geometry-eval/test-lane" },
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((entry) => entry.path === "provenance.codeVersion")).toBe(
        true,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* The sequence validator                                               */
/* ------------------------------------------------------------------ */

describe("HFX-302 model: the substitution sequence validator", () => {
  test("a well-formed sequence validates", () => {
    const validation = validateSubstitutionSequence(validSequence());
    expect(validation.ok).toBe(true);
  });

  test("a declared-incompatible sequence REQUIRES a closed-vocabulary divergence kind", () => {
    const missingKind = validateSubstitutionSequence({
      ...validSequence(),
      expectation: "declared-incompatible",
    });
    expect(missingKind.ok).toBe(false);
    if (!missingKind.ok) {
      expect(missingKind.failures[0]?.path).toBe("declaredDivergenceKind");
    }

    const withKind = validateSubstitutionSequence({
      ...validSequence(),
      expectation: "declared-incompatible",
      declaredDivergenceKind: "operation-semantic-failure",
    });
    expect(withKind.ok).toBe(true);
  });

  test("a non-divergent sequence may NOT declare a divergence kind", () => {
    const validation = validateSubstitutionSequence({
      ...validSequence(),
      declaredDivergenceKind: "operation-semantic-failure",
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.path).toBe("declaredDivergenceKind");
    }
  });

  test("an invented divergence kind is refused (the closed failure vocabulary)", () => {
    const validation = validateSubstitutionSequence({
      ...validSequence(),
      expectation: "declared-incompatible",
      declaredDivergenceKind: "slightly-wrong",
    });
    expect(validation.ok).toBe(false);
  });

  test("an unknown expectation cell or profile id is refused", () => {
    const badExpectation = validateSubstitutionSequence({
      ...validSequence(),
      expectation: "mostly-compatible",
    });
    expect(badExpectation.ok).toBe(false);
    if (!badExpectation.ok) {
      expect(badExpectation.failures.some((entry) => entry.path === "expectation")).toBe(true);
    }

    const badProfile = validateSubstitutionSequence({
      ...validSequence(),
      substituteProfileId: "quantum-geometry-lane",
    });
    expect(badProfile.ok).toBe(false);
    if (!badProfile.ok) {
      expect(badProfile.failures.some((entry) => entry.path === "substituteProfileId")).toBe(true);
    }
  });

  test("an empty step list is refused", () => {
    const validation = validateSubstitutionSequence({ ...validSequence(), steps: [] });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.path).toBe("steps");
    }
  });

  test("a numeric parameter without a unit is refused (the explicit-unit law)", () => {
    const validation = validateSubstitutionSequence({
      ...validSequence(),
      steps: [
        {
          ...validSequence().steps[0]!,
          parameters: [
            { name: "depth", value: 1.2, unit: "m" },
            { name: "width", value: 0.8 },
          ],
        },
      ],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.path).toBe("steps[0].parameters[1]");
    }
  });

  test("an operation family outside the canonical vocabulary is refused", () => {
    const validation = validateSubstitutionSequence({
      ...validSequence(),
      steps: [
        {
          ...validSequence().steps[0]!,
          operationType: "hologram-projection" as never,
        },
      ],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.path).toBe("steps[0].operationType");
    }
  });

  test("an unanchored target (no node refs / no geometry refs / no units) is refused", () => {
    const base = validSequence().steps[0]!;
    for (const target of [
      { ...base.target, nodeRefs: [] },
      { ...base.target, geometryRefs: [] },
      { ...base.target, units: { linear: "m", angular: "" } },
    ]) {
      const validation = validateSubstitutionSequence({
        ...validSequence(),
        steps: [{ ...base, target }],
      });
      expect(validation.ok).toBe(false);
    }
  });

  test("a malformed dependency edge is refused", () => {
    const validation = validateSubstitutionSequence({
      ...validSequence(),
      steps: [
        {
          ...validSequence().steps[0]!,
          dependsOn: [{ operationRef: "", dependencyKind: "completion-before" }],
        },
      ],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.path).toBe("steps[0].dependsOn[0]");
    }
  });
});
