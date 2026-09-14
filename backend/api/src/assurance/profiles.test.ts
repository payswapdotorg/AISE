/**
 * AISE-022 profile integrity tests — the shipped profiles ARE the truth
 * standard; these tests pin their structure (one per task kind, ≥1 critical
 * dimension each, well-formed requirements, documented dimensional_survey
 * values) and the fail-closed profile validator.
 */

import { describe, expect, test } from "bun:test";
import { EVIDENCE_METHODS } from "@aise/shared-contracts";
import {
  AS_BUILT_MODEL_PROFILE,
  ASSURANCE_PROFILES,
  CONDITION_INSPECTION_PROFILE,
  DIMENSIONAL_SURVEY_PROFILE,
  TASK_KINDS,
  ASSURANCE_PROFILE_VERSION,
  getAssuranceProfile,
  getAssuranceProfileByTaskKind,
  validateAssuranceProfile,
  AssuranceError,
  type AssuranceProfile,
  type ReadinessDimension,
} from "./index";

describe("shipped assurance profiles", () => {
  test("exactly three profiles, one per task kind", () => {
    expect(ASSURANCE_PROFILES.length).toBe(3);
    expect(new Set(ASSURANCE_PROFILES.map((profile) => profile.taskKind))).toEqual(new Set(TASK_KINDS));
  });

  test("every profile: version assurance-1, >=1 critical dimension, unique non-empty dimension ids/descriptions", () => {
    for (const profile of ASSURANCE_PROFILES) {
      expect(profile.version).toBe(ASSURANCE_PROFILE_VERSION);
      expect(profile.profileId.length).toBeGreaterThan(0);
      expect(profile.dimensions.length).toBeGreaterThan(0);
      expect(profile.dimensions.some((dimension) => dimension.critical)).toBe(true);
      const ids = profile.dimensions.map((dimension) => dimension.dimensionId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const dimension of profile.dimensions) {
        expect(dimension.description.length).toBeGreaterThan(0);
      }
    }
  });

  test("every requirement is well-formed against the frozen vocabularies", () => {
    for (const profile of ASSURANCE_PROFILES) {
      for (const dimension of profile.dimensions) {
        const requirement = dimension.requirement;
        if (dimension.weight !== undefined) {
          expect(dimension.weight).toBeGreaterThanOrEqual(0);
          expect(dimension.weight).toBeLessThanOrEqual(1);
        }
        switch (requirement.kind) {
          case "evidence_sufficiency":
            expect((EVIDENCE_METHODS as readonly string[]).includes(requirement.method)).toBe(true);
            expect(Number.isInteger(requirement.minCount)).toBe(true);
            expect(requirement.minCount).toBeGreaterThanOrEqual(1);
            break;
          case "uncertainty_bound":
            expect(requirement.propertyKey.length).toBeGreaterThan(0);
            expect(requirement.maxSigma).toBeGreaterThan(0);
            expect(requirement.unit.length).toBeGreaterThan(0);
            break;
          case "coverage":
            expect(requirement.minCoverageFraction).toBeGreaterThan(0);
            expect(requirement.minCoverageFraction).toBeLessThanOrEqual(1);
            break;
          case "epistemic_floor":
            expect(["OBSERVED", "CONFIRMED"]).toContain(requirement.minEpistemicStatus);
            expect(requirement.propertyKeys.length).toBeGreaterThan(0);
            expect(new Set(requirement.propertyKeys).size).toBe(requirement.propertyKeys.length);
            break;
        }
      }
    }
  });

  test("dimensional_survey carries the documented values (height 1sigma <= 0.02 m CRITICAL, DEPTH_SENSING >= 2, coverage >= 0.9)", () => {
    const height = DIMENSIONAL_SURVEY_PROFILE.dimensions.find(
      (dimension) => dimension.dimensionId === "room-height-uncertainty",
    );
    expect(height).toBeDefined();
    expect(height?.critical).toBe(true);
    expect(height?.requirement).toEqual({
      kind: "uncertainty_bound",
      propertyKey: "room.height",
      maxSigma: 0.02,
      unit: "m",
    });
    const depth = DIMENSIONAL_SURVEY_PROFILE.dimensions.find(
      (dimension) => dimension.dimensionId === "spatial-depth-evidence",
    );
    expect(depth?.critical).toBe(true);
    expect(depth?.requirement).toEqual({ kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 2 });
    const coverage = DIMENSIONAL_SURVEY_PROFILE.dimensions.find(
      (dimension) => dimension.dimensionId === "surface-coverage",
    );
    expect(coverage?.critical).toBe(true);
    expect(coverage?.requirement).toEqual({ kind: "coverage", minCoverageFraction: 0.9 });
  });

  test("condition_inspection and as_built_model cover the remaining kinds with critical evidence/floor dimensions", () => {
    expect(CONDITION_INSPECTION_PROFILE.taskKind).toBe("condition_inspection");
    expect(
      CONDITION_INSPECTION_PROFILE.dimensions.find(
        (dimension) => dimension.dimensionId === "visual-condition-evidence",
      )?.requirement,
    ).toEqual({ kind: "evidence_sufficiency", method: "VISUAL_RECONSTRUCTION", minCount: 3 });
    expect(
      CONDITION_INSPECTION_PROFILE.dimensions.find(
        (dimension) => dimension.dimensionId === "condition-epistemic-floor",
      )?.requirement,
    ).toEqual({
      kind: "epistemic_floor",
      minEpistemicStatus: "OBSERVED",
      propertyKeys: ["element.material", "element.condition"],
    });
    expect(AS_BUILT_MODEL_PROFILE.taskKind).toBe("as_built_model");
    expect(
      AS_BUILT_MODEL_PROFILE.dimensions.find(
        (dimension) => dimension.dimensionId === "dimensional-confirmation-floor",
      )?.requirement,
    ).toEqual({
      kind: "epistemic_floor",
      minEpistemicStatus: "CONFIRMED",
      propertyKeys: ["room.height", "room.width"],
    });
  });

  test("profile lookup by id and by task kind", () => {
    for (const profile of ASSURANCE_PROFILES) {
      expect(getAssuranceProfile(profile.profileId)).toBe(profile);
      expect(getAssuranceProfileByTaskKind(profile.taskKind)).toBe(profile);
    }
    expect(getAssuranceProfile("assurance-profile/unknown/v9")).toBeUndefined();
    expect(getAssuranceProfileByTaskKind("dimensional_survey")).toBe(DIMENSIONAL_SURVEY_PROFILE);
  });

  test("validator accepts every shipped profile", () => {
    for (const profile of ASSURANCE_PROFILES) {
      expect(validateAssuranceProfile(profile)).toBe(profile);
    }
  });
});

describe("profile validation fails closed", () => {
  const base: AssuranceProfile = DIMENSIONAL_SURVEY_PROFILE;

  function malformed(mutate: (profile: AssuranceProfile) => AssuranceProfile): AssuranceProfile {
    return mutate(base);
  }

  test("unknown requirement kind is a typed invalid_profile error (never silently satisfied)", () => {
    const profile = malformed((p) => ({
      ...p,
      dimensions: [
        { dimensionId: "d1", description: "x", critical: true, requirement: { kind: "bogus" } as never },
      ],
    }));
    expect(() => validateAssuranceProfile(profile)).toThrow(AssuranceError);
    try {
      validateAssuranceProfile(profile);
    } catch (error) {
      const assuranceError = error as AssuranceError;
      expect(assuranceError.code).toBe("invalid_profile");
      expect(assuranceError.details.join(" ")).toContain("bogus");
    }
  });

  test("duplicate dimensionId is rejected", () => {
    const duplicate: ReadinessDimension = {
      dimensionId: "room-height-uncertainty",
      description: "duplicate of the height dimension",
      critical: true,
      requirement: { kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" },
    };
    const profile = malformed((p) => ({ ...p, dimensions: [...p.dimensions, duplicate] }));
    expect(() => validateAssuranceProfile(profile)).toThrow(/duplicate dimensionId/);
  });

  test("bad version, taskKind and empty dimensions are rejected", () => {
    expect(() => validateAssuranceProfile({ ...base, version: "assurance-0" as never })).toThrow(/version/);
    expect(() => validateAssuranceProfile({ ...base, taskKind: "bim_scan" as never })).toThrow(/taskKind/);
    expect(() => validateAssuranceProfile({ ...base, dimensions: [] })).toThrow(/non-empty/);
    expect(() => validateAssuranceProfile(null)).toThrow(/object/);
  });

  test("per-kind requirement violations are rejected with named details", () => {
    const cases: readonly AssuranceProfile[] = [
      malformed((p) => ({
        ...p,
        dimensions: [
          { dimensionId: "d", description: "x", critical: true, requirement: { kind: "evidence_sufficiency", method: "MAGIC" as never, minCount: 1 } },
        ],
      })),
      malformed((p) => ({
        ...p,
        dimensions: [
          { dimensionId: "d", description: "x", critical: true, requirement: { kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 0 } },
        ],
      })),
      malformed((p) => ({
        ...p,
        dimensions: [
          { dimensionId: "d", description: "x", critical: true, requirement: { kind: "uncertainty_bound", propertyKey: "k", maxSigma: 0, unit: "m" } },
        ],
      })),
      malformed((p) => ({
        ...p,
        dimensions: [
          { dimensionId: "d", description: "x", critical: true, requirement: { kind: "coverage", minCoverageFraction: 1.5 } },
        ],
      })),
      malformed((p) => ({
        ...p,
        dimensions: [
          { dimensionId: "d", description: "x", critical: true, requirement: { kind: "epistemic_floor", minEpistemicStatus: "INFERRED" as never, propertyKeys: ["k"] } },
        ],
      })),
      malformed((p) => ({
        ...p,
        dimensions: [
          { dimensionId: "d", description: "x", critical: true, requirement: { kind: "epistemic_floor", minEpistemicStatus: "OBSERVED", propertyKeys: [] } },
        ],
      })),
    ];
    for (const profile of cases) {
      expect(() => validateAssuranceProfile(profile)).toThrow(AssuranceError);
    }
  });
});
