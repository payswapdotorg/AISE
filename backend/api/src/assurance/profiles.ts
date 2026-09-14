/**
 * AISE-022 — the three SHIPPED assurance profiles (one per task kind).
 *
 * These are CODE-DEFINED, versioned documents (`assurance-1`) — the truth
 * standard referenced by `AssuranceTarget.assuranceProfileRef` on capture
 * missions. Changing any value here is a GOVERNED, CRITICAL change (lock
 * "Critical assurance"): it requires a new profile version and the full
 * benchmark/discrimination evidence cycle, because it moves the bar every
 * device and operator is held to. A device profile can never modify them.
 *
 * Documented values (engineering rationale in each description):
 *  - dimensional_survey: room height/width to σ ≤ 0.02 m (±20mm 1σ survey
 *    tolerance) CRITICAL; ≥2 valid DEPTH_SENSING evidence items CRITICAL
 *    (independent depth passes, per the work order); coverage ≥ 0.9 of
 *    modeled nodes evidence-linked CRITICAL; a NON-critical material floor
 *    (READY_WITH_NOTES territory — notes, never a lowered bar).
 *  - condition_inspection: ≥3 valid VISUAL_RECONSTRUCTION evidence items
 *    CRITICAL; material+condition asserted at ≥ OBSERVED CRITICAL;
 *    documentation/defect-size/coverage dimensions are non-critical notes.
 *  - as_built_model: ≥4 valid VISUAL_RECONSTRUCTION evidence items CRITICAL;
 *    room height σ ≤ 0.015 m CRITICAL (as-built is stricter than survey);
 *    coverage ≥ 0.95 CRITICAL; height/width CONFIRMED floor CRITICAL
 *    (as-built dimensions must be human-confirmed); CALIBRATED_REFERENCE
 *    evidence non-critical.
 */

import type { AssuranceProfile } from "./model";

export const DIMENSIONAL_SURVEY_PROFILE: AssuranceProfile = {
  profileId: "assurance-profile/dimensional-survey/v1",
  version: "assurance-1",
  taskKind: "dimensional_survey",
  dimensions: [
    {
      dimensionId: "room-height-uncertainty",
      description:
        "Survey tolerance: every numeric assertion of room.height must carry 1σ ≤ 0.02 m (±20 mm at 1σ).",
      requirement: { kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" },
      weight: 1,
      critical: true,
    },
    {
      dimensionId: "room-width-uncertainty",
      description:
        "Survey tolerance: every numeric assertion of room.width must carry 1σ ≤ 0.02 m (±20 mm at 1σ).",
      requirement: { kind: "uncertainty_bound", propertyKey: "room.width", maxSigma: 0.02, unit: "m" },
      weight: 0.9,
      critical: true,
    },
    {
      dimensionId: "spatial-depth-evidence",
      description:
        "At least 2 valid (non-invalidated) DEPTH_SENSING evidence items must back the dimensional survey.",
      requirement: { kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 2 },
      weight: 0.8,
      critical: true,
    },
    {
      dimensionId: "surface-coverage",
      description:
        "At least 0.9 of the modeled nodes in the evaluated snapshot must carry valid linked evidence.",
      requirement: { kind: "coverage", minCoverageFraction: 0.9 },
      weight: 0.7,
      critical: true,
    },
    {
      dimensionId: "material-epistemic-floor",
      description:
        "Notes dimension: element.material should be asserted at ≥ OBSERVED. Non-critical — a miss yields notes, never a lowered bar.",
      requirement: { kind: "epistemic_floor", minEpistemicStatus: "OBSERVED", propertyKeys: ["element.material"] },
      weight: 0.3,
      critical: false,
    },
  ],
};

export const CONDITION_INSPECTION_PROFILE: AssuranceProfile = {
  profileId: "assurance-profile/condition-inspection/v1",
  version: "assurance-1",
  taskKind: "condition_inspection",
  dimensions: [
    {
      dimensionId: "visual-condition-evidence",
      description:
        "At least 3 valid (non-invalidated) VISUAL_RECONSTRUCTION evidence items must back the condition inspection.",
      requirement: { kind: "evidence_sufficiency", method: "VISUAL_RECONSTRUCTION", minCount: 3 },
      weight: 1,
      critical: true,
    },
    {
      dimensionId: "condition-epistemic-floor",
      description:
        "Condition claims must be observed, not guessed: element.material and element.condition asserted at ≥ OBSERVED.",
      requirement: {
        kind: "epistemic_floor",
        minEpistemicStatus: "OBSERVED",
        propertyKeys: ["element.material", "element.condition"],
      },
      weight: 0.9,
      critical: true,
    },
    {
      dimensionId: "inspection-coverage",
      description:
        "Notes dimension: at least 0.8 of modeled nodes should carry valid linked evidence.",
      requirement: { kind: "coverage", minCoverageFraction: 0.8 },
      weight: 0.5,
      critical: false,
    },
    {
      dimensionId: "documentation-evidence",
      description:
        "Notes dimension: at least 1 valid DOCUMENT_REGION evidence item (drawings/O&M docs) should support the inspection.",
      requirement: { kind: "evidence_sufficiency", method: "DOCUMENT_REGION", minCount: 1 },
      weight: 0.4,
      critical: false,
    },
    {
      dimensionId: "defect-size-uncertainty",
      description:
        "Notes dimension: numeric assertions of defect.width should carry 1σ ≤ 0.005 m (±5 mm at 1σ).",
      requirement: { kind: "uncertainty_bound", propertyKey: "defect.width", maxSigma: 0.005, unit: "m" },
      weight: 0.3,
      critical: false,
    },
  ],
};

export const AS_BUILT_MODEL_PROFILE: AssuranceProfile = {
  profileId: "assurance-profile/as-built-model/v1",
  version: "assurance-1",
  taskKind: "as_built_model",
  dimensions: [
    {
      dimensionId: "geometry-evidence",
      description:
        "At least 4 valid (non-invalidated) VISUAL_RECONSTRUCTION evidence items must back the as-built model.",
      requirement: { kind: "evidence_sufficiency", method: "VISUAL_RECONSTRUCTION", minCount: 4 },
      weight: 1,
      critical: true,
    },
    {
      dimensionId: "room-height-uncertainty",
      description:
        "As-built tolerance is stricter than survey: every numeric assertion of room.height must carry 1σ ≤ 0.015 m.",
      requirement: { kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.015, unit: "m" },
      weight: 0.95,
      critical: true,
    },
    {
      dimensionId: "model-coverage",
      description: "At least 0.95 of the modeled nodes must carry valid linked evidence (as-built completeness).",
      requirement: { kind: "coverage", minCoverageFraction: 0.95 },
      weight: 0.9,
      critical: true,
    },
    {
      dimensionId: "dimensional-confirmation-floor",
      description:
        "As-built dimensions must be human-confirmed: room.height and room.width asserted at ≥ CONFIRMED.",
      requirement: {
        kind: "epistemic_floor",
        minEpistemicStatus: "CONFIRMED",
        propertyKeys: ["room.height", "room.width"],
      },
      weight: 0.85,
      critical: true,
    },
    {
      dimensionId: "reference-evidence",
      description:
        "Notes dimension: at least 1 valid CALIBRATED_REFERENCE evidence item should anchor metric scale.",
      requirement: { kind: "evidence_sufficiency", method: "CALIBRATED_REFERENCE", minCount: 1 },
      weight: 0.5,
      critical: false,
    },
  ],
};

/** All shipped profiles, in task-kind order. */
export const ASSURANCE_PROFILES: readonly AssuranceProfile[] = [
  DIMENSIONAL_SURVEY_PROFILE,
  CONDITION_INSPECTION_PROFILE,
  AS_BUILT_MODEL_PROFILE,
];

/** Look up a shipped profile by id (the `AssuranceTarget.assuranceProfileRef` resolution point). */
export function getAssuranceProfile(profileId: string): AssuranceProfile | undefined {
  return ASSURANCE_PROFILES.find((profile) => profile.profileId === profileId);
}

/** Look up the shipped profile for a task kind (exactly one per kind). */
export function getAssuranceProfileByTaskKind(taskKind: AssuranceProfile["taskKind"]): AssuranceProfile | undefined {
  return ASSURANCE_PROFILES.find((profile) => profile.taskKind === taskKind);
}
