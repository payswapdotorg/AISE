/**
 * HFX-302 model tests — the typed vocabulary, the tolerance calculus, the
 * pure validators and the canonical-boundary topology projection.
 */

import { describe, expect, test } from "bun:test";
import {
  GEOMETRY_COMPARISON_POINTS,
  GEOMETRY_DIVERGENCE_KIND_BY_POINT,
  SUBSTITUTION_EXPECTATIONS,
  TOLERANCE_DIMENSIONS,
  TOPOLOGY_CONSTRAINT_KINDS,
  evaluateQuantityTolerance,
  isSubstitutionExpectation,
  projectCanonicalTopologyConstraints,
  toleranceFor,
  validateGeometryProviderDescriptor,
  validateSubstitutionSequence,
} from "./model";
import type { QuantityTolerance } from "./model";
import { referenceLaneDescriptor, substituteLaneDescriptor } from "./registry";
import { GEOMETRY_CORPUS, COMMITTED_PROFILE_IDS, COMMITTED_SCENE_IDS } from "./corpus";
import { capabilitySabotageDescriptor } from "./testkit";

const tol = (dimension: string, absolute: number, relative: number): QuantityTolerance => ({
  dimension: dimension as QuantityTolerance["dimension"],
  absolute,
  relative,
});

describe("HFX-302 model: the declared tolerance calculus (Law 2)", () => {
  test("the within-tolerance predicate is the declared max(absolute, relative × |reference|)", () => {
    const tolerance = tol("volume", 0.05, 0.01);
    // |Δ| = 0.03 vs allowed max(0.05, 0.01 × 9) = 0.09 → within, the relative term grants
    const withinRel = evaluateQuantityTolerance(tolerance, 9, 9.03);
    expect(withinRel.within).toBe(true);
    expect(withinRel.allowedAbsolute).toBeCloseTo(0.09, 12);
    expect(withinRel.allowedBy).toBe("relative");
    expect(withinRel.absoluteDelta).toBeCloseTo(0.03, 12);
    // |Δ| = 0.3 vs allowed 0.093 → breach
    const breach = evaluateQuantityTolerance(tolerance, 9.3, 9);
    expect(breach.within).toBe(false);
    expect(breach.absoluteDelta).toBeCloseTo(0.3, 12);
    expect(breach.relativeDelta).toBeCloseTo(0.3 / 9.3, 12);
  });

  test("the relative term governs large references (the small-reference case falls to the absolute term)", () => {
    const tolerance = tol("length", 0.05, 0.01);
    const large = evaluateQuantityTolerance(tolerance, 100, 100.8);
    expect(large.within).toBe(true);
    expect(large.allowedBy).toBe("relative");
    expect(large.allowedAbsolute).toBeCloseTo(1, 12);
    const small = evaluateQuantityTolerance(tolerance, 0.1, 0.14);
    expect(small.within).toBe(true);
    expect(small.allowedBy).toBe("absolute");
  });

  test("a zero reference is lawful (the absolute term alone governs)", () => {
    const evaluation = evaluateQuantityTolerance(tol("area", 0.05, 0.01), 0, 0.04);
    expect(evaluation.within).toBe(true);
    expect(evaluation.allowedAbsolute).toBe(0.05);
    expect(evaluation.relativeDelta).toBe(0.04);
  });

  test("the tolerance table dimensions are the four canonical quantity dimensions", () => {
    expect([...TOLERANCE_DIMENSIONS]).toEqual(["length", "area", "volume", "count"]);
  });

  test("toleranceFor resolves every contract dimension; count is exact by design", () => {
    const descriptor = substituteLaneDescriptor("geometry-substitute-fine");
    expect(toleranceFor(descriptor, "volume").absolute).toBe(0.05);
    expect(toleranceFor(descriptor, "count").absolute).toBe(0);
    expect(toleranceFor(descriptor, "count").relative).toBe(0);
  });
});

describe("HFX-302 model: the provider descriptor validator (capability honesty)", () => {
  test("the committed lane descriptors validate", () => {
    expect(validateGeometryProviderDescriptor(referenceLaneDescriptor()).ok).toBe(true);
    for (const profileId of [
      "geometry-substitute-fine",
      "geometry-substitute-coarse",
      "geometry-substitute-restricted",
    ] as const) {
      const validation = validateGeometryProviderDescriptor(substituteLaneDescriptor(profileId));
      expect(validation.ok).toBe(true);
    }
  });

  test("the reference oracle declares ALL TEN documented v1 families", () => {
    const descriptor = referenceLaneDescriptor();
    expect(descriptor.declaredCapabilities).toHaveLength(10);
    expect(descriptor.implementation).toBe("canonical-engine-reference");
    expect(descriptor.resolution).toBeUndefined();
  });

  test("the restricted profile deliberately omits exactly three families", () => {
    const descriptor = substituteLaneDescriptor("geometry-substitute-restricted");
    expect(descriptor.declaredCapabilities).toHaveLength(7);
    expect(descriptor.declaredCapabilities).not.toContain("demolition-removal");
    expect(descriptor.declaredCapabilities).not.toContain("finish-application");
    expect(descriptor.declaredCapabilities).not.toContain("building-service-installation");
  });

  test("the coarse profile declares the same tolerance table at a coarser grid (the discriminator)", () => {
    const fine = substituteLaneDescriptor("geometry-substitute-fine");
    const coarse = substituteLaneDescriptor("geometry-substitute-coarse");
    expect(coarse.tolerances).toEqual(fine.tolerances);
    expect(coarse.resolution?.macroCellMeters).toBe(0.25);
    expect(fine.resolution?.macroCellMeters).toBe(0.05);
  });

  test("the CAPABILITY-SABOTAGE twin is rejected (over-declaring a family the adapter cannot gate)", () => {
    const validation = validateGeometryProviderDescriptor(capabilitySabotageDescriptor());
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const capabilityFailures = validation.failures.filter(
        (failure) => failure.path.startsWith("declaredCapabilities"),
      );
      expect(capabilityFailures.length).toBeGreaterThan(0);
      expect(capabilityFailures[0]?.detail).toContain("roof-truss-placement");
      expect(capabilityFailures[0]?.detail).toContain("the adapter cannot gate");
    }
  });

  test("a descriptor declaring NO capabilities, a bad resolution or a count tolerance is refused", () => {
    const base = substituteLaneDescriptor("geometry-substitute-fine");
    expect(
      validateGeometryProviderDescriptor({ ...base, declaredCapabilities: [] }).ok,
    ).toBe(false);
    expect(
      validateGeometryProviderDescriptor({
        ...base,
        resolution: { macroCellMeters: 0.02, coatCellMeters: 0.05 },
      }).ok,
    ).toBe(false);
    expect(
      validateGeometryProviderDescriptor({
        ...base,
        tolerances: {
          ...base.tolerances,
          count: { dimension: "count", absolute: 1, relative: 0 },
        },
      }).ok,
    ).toBe(false);
  });
});

describe("HFX-302 model: the sequence validator (fail-closed)", () => {
  const sequence = GEOMETRY_CORPUS[0];
  if (sequence === undefined) {
    throw new Error("model test: the corpus is empty (fixture bug)");
  }

  test("every committed sequence validates", () => {
    for (const entry of GEOMETRY_CORPUS) {
      const validation = validateSubstitutionSequence(
        entry,
        COMMITTED_PROFILE_IDS,
        COMMITTED_SCENE_IDS,
      );
      expect(validation.ok).toBe(true);
    }
  });

  test("an unknown scene, an unknown profile and a forward dependency edge are refused", () => {
    expect(
      validateSubstitutionSequence(
        { ...sequence, baselineSceneId: "no-such-scene" },
        COMMITTED_PROFILE_IDS,
        COMMITTED_SCENE_IDS,
      ).ok,
    ).toBe(false);
    expect(
      validateSubstitutionSequence(
        { ...sequence, substituteProfileId: "no-such-profile" },
        COMMITTED_PROFILE_IDS,
        COMMITTED_SCENE_IDS,
      ).ok,
    ).toBe(false);
    const forward = validateSubstitutionSequence(
      {
        ...sequence,
        operations: [
          sequence.operations[0] as (typeof sequence.operations)[number],
          {
            ...(sequence.operations[0] as (typeof sequence.operations)[number]),
            dependsOn: [{ dependsOnOperationIndex: 2, dependencyKind: "completion-before" }],
          },
        ],
      },
      COMMITTED_PROFILE_IDS,
      COMMITTED_SCENE_IDS,
    );
    expect(forward.ok).toBe(false);
  });

  test("the declared-difference consistency rule is enforced in both directions", () => {
    const declared = GEOMETRY_CORPUS.find(
      (entry) => entry.expectation === "declared-incompatible",
    );
    if (declared === undefined) {
      throw new Error("model test: no declared-incompatible entry (fixture bug)");
    }
    expect(
      validateSubstitutionSequence(
        { ...declared, declaredDifferenceKind: undefined },
        COMMITTED_PROFILE_IDS,
        COMMITTED_SCENE_IDS,
      ).ok,
    ).toBe(false);
    expect(
      validateSubstitutionSequence(
        { ...sequence, declaredDifferenceKind: "operation-semantic-failure" },
        COMMITTED_PROFILE_IDS,
        COMMITTED_SCENE_IDS,
      ).ok,
    ).toBe(false);
  });

  test("the expectation vocabulary is the closed three-cell matrix", () => {
    expect([...SUBSTITUTION_EXPECTATIONS]).toEqual([
      "compatible",
      "declared-incompatible",
      "unsupported-by-substitute",
    ]);
    expect(isSubstitutionExpectation("compatible")).toBe(true);
    expect(isSubstitutionExpectation("equivalent")).toBe(false);
  });
});

describe("HFX-302 model: the comparison vocabulary reuses PROD-029's kinds", () => {
  test("every divergence kind is drawn from PROD-029's DIVERGENCE_KIND_BY_POINT table", () => {
    expect(GEOMETRY_DIVERGENCE_KIND_BY_POINT["quantity-value"]).toBe("operation-semantic-failure");
    expect(GEOMETRY_DIVERGENCE_KIND_BY_POINT["boq-line"]).toBe("operation-semantic-failure");
    expect(GEOMETRY_DIVERGENCE_KIND_BY_POINT["validation-verdict"]).toBe("reasoning-failure");
    expect(GEOMETRY_DIVERGENCE_KIND_BY_POINT["validation-check"]).toBe("reasoning-failure");
    expect(GEOMETRY_DIVERGENCE_KIND_BY_POINT["topology-constraint"]).toBe("operation-semantic-failure");
    expect([...GEOMETRY_COMPARISON_POINTS]).toEqual([
      "quantity-value",
      "validation-check",
      "validation-verdict",
      "topology-constraint",
      "boq-line",
    ]);
  });

  test("the topology constraint vocabulary is closed (three kinds)", () => {
    expect([...TOPOLOGY_CONSTRAINT_KINDS]).toEqual([
      "coat-anchors-baseline-surface",
      "opening-hosted-by-element",
      "backfill-pairs-excavation",
    ]);
  });
});

describe("HFX-302 model: the canonical-boundary topology projection (the D26 guard)", () => {
  const lawfulRow = {
    constraintId: "coat-anchors-baseline-surface::geo-wall-faces-002",
    kind: "coat-anchors-baseline-surface",
    subjectRefs: ["geo-wall-faces-002"],
    statement: "coat operations anchor to the read-only baseline surface geometry",
  };

  test("a lawful canonical row projects; an empty array is lawful (no topology relation)", () => {
    const projection = projectCanonicalTopologyConstraints(JSON.stringify([lawfulRow]));
    expect(projection.ok).toBe(true);
    const empty = projectCanonicalTopologyConstraints("[]");
    expect(empty.ok).toBe(true);
  });

  test("a provider-specific field smuggled into the topology row is REFUSED (contract-mismatch)", () => {
    const smuggled = projectCanonicalTopologyConstraints(
      JSON.stringify([{ ...lawfulRow, meshFormat: "proprietary" }]),
    );
    expect(smuggled.ok).toBe(false);
    if (!smuggled.ok) {
      expect(smuggled.refusal.refusalKind).toBe("contract-mismatch");
      expect(smuggled.refusal.detail).toContain("provider-specific topology fields");
    }
  });

  test("an invented constraint kind, an empty subject list and malformed JSON are refused", () => {
    expect(
      projectCanonicalTopologyConstraints(
        JSON.stringify([{ ...lawfulRow, kind: "spiral-staircase-relation" }]),
      ).ok,
    ).toBe(false);
    expect(
      projectCanonicalTopologyConstraints(
        JSON.stringify([{ ...lawfulRow, subjectRefs: [] }]),
      ).ok,
    ).toBe(false);
    expect(projectCanonicalTopologyConstraints("not json {").ok).toBe(false);
    expect(projectCanonicalTopologyConstraints("").ok).toBe(false);
  });
});
