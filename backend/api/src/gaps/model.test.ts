/**
 * AISE-018 — Adaptive evidence-gap engine MODEL tests.
 *
 * Depth mandated by the work order: the frozen vocabularies (every gap
 * class distinct; UNKNOWN/NOT_OBSERVED/OCCLUDED never collapsed), the
 * pure engine's per-class gap derivation, the multi-criteria score
 * matrix (every component named, inspectable and derived; the composite
 * formula; canonical tie-breaking), the request-seam parsers (every
 * failure mode a DISTINCT typed code), the frozen scoring tables, the
 * input-digest sensitivity and the stored-record parser's corruption
 * guards.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  CANDIDATE_ACTION_KINDS,
  CRITICALITY_FACTORS,
  DEFAULT_METHOD_EFFORT,
  DEFAULT_METHOD_PREFERENCES,
  GAP_CLASSES,
  GAP_CLASS_TABLE,
  GAP_KINDS,
  GAP_STATES,
  GAP_ANALYSIS_ERROR_CODES,
  GapAnalysisError,
  RECOVERABILITY_BY_STATE,
  SCORE_WEIGHTS,
  computeGapAnalysis,
  gapAnalysisContentDigest,
  gapAnalysisInputDigest,
  parseGapAnalysisRecord,
  parseRunGapAnalysisInput,
  resolveEffortModel,
  resolveMethodPreferences,
  type GapAnalysisState,
  type GapSubject,
  type MethodPreferences,
  type ObservationStatusAnnotation,
} from "./model";
import type { ReadinessReport } from "../assurance/model";
import {
  ANALYSIS_ID,
  CANONICAL_PROFILE,
  EV_DUCT,
  EV_SKYLIGHT,
  EV_MEZZANINE,
  buildCanonicalInput,
  buildCanonicalReport,
  buildEvidenceFacts,
  buildRealityVersion,
  deviceHintOf,
  fixedClock,
} from "./testkit";

const refusalOf = (run: () => unknown): GapAnalysisError => {
  try {
    run();
    throw new Error("expected a typed refusal");
  } catch (error) {
    if (error instanceof GapAnalysisError) {
      return error;
    }
    throw error;
  }
};

/* ------------------------------------------------------------------ */
/* Small hand-made state builders (unit-level engine tests)             */
/* ------------------------------------------------------------------ */

function subjectOf(
  nodeId: string,
  options: Partial<GapSubject> = {},
): GapSubject {
  return {
    nodeId,
    presence: "live",
    properties: [],
    validEvidenceIds: [],
    invalidatedEvidenceIds: [],
    focusWeight: 1,
    taskFocused: false,
    ...options,
  };
}

function stateOf(
  subjects: readonly GapSubject[],
  options: Partial<GapAnalysisState> = {},
): GapAnalysisState {
  return {
    analysisId: ANALYSIS_ID,
    profile: CANONICAL_PROFILE,
    report: buildCanonicalReport(),
    subjects,
    evidenceFacts: buildEvidenceFacts(),
    effortModel: resolveEffortModel({}),
    methodPreferences: resolveMethodPreferences({}),
    ...options,
  };
}

/** A report with exactly the given dimension outcomes (others satisfied). */
function reportWith(
  unsatisfied: readonly { dimensionId: string; outcome: "not_satisfied" | "insufficient_data" }[],
): ReadinessReport {
  const report = buildCanonicalReport();
  const dimensions = report.dimensions.map((dimension) => {
    const override = unsatisfied.find((entry) => entry.dimensionId === dimension.dimensionId);
    if (override === undefined) {
      return { ...dimension, outcome: "satisfied" as const };
    }
    return { ...dimension, outcome: override.outcome };
  });
  return {
    ...report,
    dimensions: dimensions as unknown as ReadinessReport["dimensions"],
    gaps: report.gaps.filter((gap) =>
      unsatisfied.some((entry) => entry.dimensionId === gap.dimensionId),
    ),
  };
}

describe("gap model: frozen vocabularies", () => {
  test("the gap-kind vocabulary is the shared contract's EvidenceGapKind, reused verbatim", () => {
    expect([...GAP_KINDS]).toEqual(["MISSING", "WEAK", "AMBIGUOUS"]);
  });

  test("UNKNOWN, NOT_OBSERVED and OCCLUDED are distinct first-class states (never collapsed)", () => {
    expect([...GAP_STATES]).toEqual(["OBSERVED", "UNKNOWN", "NOT_OBSERVED", "OCCLUDED"]);
    expect(new Set(GAP_STATES).size).toBe(4);
  });

  test("the class registry is frozen, total over GAP_CLASSES, and maps every class to (kind, scope, state)", () => {
    expect(GAP_CLASSES.length).toBe(16);
    for (const gapClass of GAP_CLASSES) {
      const table = GAP_CLASS_TABLE[gapClass];
      expect(table).toBeDefined();
      expect(GAP_KINDS).toContain(table.kind);
      expect(GAP_STATES).toContain(table.taskState);
      expect(["task", "node", "property"]).toContain(table.stateScope);
    }
    // The not-absence family maps to three DISTINCT states:
    const taskStates = new Set(
      GAP_CLASSES.map((gapClass) => GAP_CLASS_TABLE[gapClass].taskState),
    );
    expect(taskStates.has("UNKNOWN")).toBe(true);
    expect(taskStates.has("NOT_OBSERVED")).toBe(true);
    expect(taskStates.has("OCCLUDED")).toBe(true);
  });

  test("the action vocabulary and scoring tables are frozen and complete", () => {
    expect([...CANDIDATE_ACTION_KINDS]).toHaveLength(7);
    expect(Object.keys(DEFAULT_METHOD_EFFORT)).toHaveLength(10);
    expect(Object.keys(DEFAULT_METHOD_PREFERENCES)).toHaveLength(6);
    expect(Object.isFrozen(SCORE_WEIGHTS)).toBe(true);
    expect(Object.isFrozen(RECOVERABILITY_BY_STATE)).toBe(true);
    expect(Object.isFrozen(CRITICALITY_FACTORS)).toBe(true);
    // Recoverability priors: UNKNOWN never collapsed to 0 or 1; OCCLUDED at risk.
    expect(RECOVERABILITY_BY_STATE.UNKNOWN).toBeGreaterThan(0);
    expect(RECOVERABILITY_BY_STATE.UNKNOWN).toBeLessThan(1);
    expect(RECOVERABILITY_BY_STATE.OCCLUDED).toBeLessThan(RECOVERABILITY_BY_STATE.NOT_OBSERVED);
    expect(RECOVERABILITY_BY_STATE.NOT_OBSERVED).toBeLessThan(RECOVERABILITY_BY_STATE.OBSERVED);
    // Composite weights sum to a documented budget (float-safe).
    expect(
      Math.round(
        (SCORE_WEIGHTS.taskImpact +
          SCORE_WEIGHTS.expectedUncertaintyReduction +
          SCORE_WEIGHTS.operatorEffort +
          SCORE_WEIGHTS.recoverability) *
          1e6,
      ) / 1e6,
    ).toBe(1);
  });
});

describe("gap model: boundary parser (distinct typed codes)", () => {
  test("the canonical payload parses and canonically orders the seams", () => {
    const input = parseRunGapAnalysisInput({
      analysisId: ANALYSIS_ID,
      taskRef: { projectId: "project-gap-zurich", versionId: "v002", profileId: "assurance-profile/dimensional-survey/v1" },
      annotations: [
        { targetNodeId: "zzz", observationStatus: "NOT_OBSERVED", evidenceIds: [EV_DUCT] },
        { targetNodeId: "aaa", observationStatus: "OCCLUDED", evidenceIds: [EV_SKYLIGHT] },
      ],
      uncertaintyAnnotations: [
        { nodeId: "b", propertyKey: "z", sigma: 0.01, unit: "m" },
        { nodeId: "a", propertyKey: "z", sigma: 0.02, unit: "m" },
      ],
      taskFocus: [
        { subjectNodeId: "b", impactWeight: 0.5 },
        { subjectNodeId: "a", impactWeight: 1 },
      ],
    });
    expect(input.annotations.map((annotation) => annotation.targetNodeId)).toEqual(["aaa", "zzz"]);
    expect(input.uncertaintyAnnotations.map((a) => a.nodeId)).toEqual(["a", "b"]);
    expect(input.taskFocus.map((entry) => entry.subjectNodeId)).toEqual(["a", "b"]);
    expect(input.deviceCapabilityFacts).toBeNull();
  });

  test("each malformed seam is a DISTINCT typed refusal", () => {
    const base = {
      analysisId: ANALYSIS_ID,
      taskRef: { projectId: "p", versionId: "v001", profileId: "assurance-profile/x/v1" },
    };
    expect(refusalOf(() => parseRunGapAnalysisInput("nope")).code).toBe("invalid_analysis");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, analysisId: "" })).code).toBe("invalid_analysis_id");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, taskRef: { ...base.taskRef, projectId: "" } })).code).toBe("invalid_project_id");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, taskRef: { ...base.taskRef, versionId: "2" } })).code).toBe("invalid_version_id");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, taskRef: { ...base.taskRef, profileId: "" } })).code).toBe("invalid_profile_ref");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, annotations: [{ targetNodeId: "x", observationStatus: "MAYBE", evidenceIds: [EV_DUCT] }] })).code).toBe("invalid_annotation");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, annotations: [{ targetNodeId: "x", observationStatus: "OCCLUDED", evidenceIds: [] }] })).code).toBe("annotation_without_evidence");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, annotations: [{ targetNodeId: "x", observationStatus: "OCCLUDED", evidenceIds: ["deadbeef"] }] })).code).toBe("invalid_evidence_ref");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, annotations: [
      { targetNodeId: "x", observationStatus: "OCCLUDED", evidenceIds: [EV_DUCT] },
      { targetNodeId: "x", observationStatus: "UNKNOWN", evidenceIds: [EV_SKYLIGHT] },
    ] })).code).toBe("invalid_annotation");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, uncertaintyAnnotations: [{ nodeId: "n", propertyKey: "k", sigma: -1, unit: "m" }] })).code).toBe("invalid_uncertainty");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, uncertaintyAnnotations: [{ nodeId: "n", propertyKey: "k", sigma: 0.1 }] })).code).toBe("invalid_uncertainty");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, uncertaintyAnnotations: [
      { nodeId: "n", propertyKey: "k", sigma: 0.1, unit: "m" },
      { nodeId: "n", propertyKey: "k", sigma: 0.2, unit: "m" },
    ] })).code).toBe("invalid_uncertainty");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, taskFocus: [{ subjectNodeId: "s", impactWeight: 1.5 }] })).code).toBe("invalid_focus");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, taskFocus: [
      { subjectNodeId: "s", impactWeight: 1 },
      { subjectNodeId: "s", impactWeight: 0.5 },
    ] })).code).toBe("invalid_focus");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, effortContext: { byMethod: { NOT_A_METHOD: 0.5 } } })).code).toBe("invalid_effort_context");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, effortContext: { byMethod: { DEPTH_SENSING: 2 } } })).code).toBe("invalid_effort_context");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, methodPreferences: { measureProperty: "NOT_A_METHOD" } })).code).toBe("invalid_method_preference");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, methodPreferences: { bogusKey: "MANUAL_MEASUREMENT" } })).code).toBe("invalid_method_preference");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, deviceCapabilityFacts: { x: 3 } })).code).toBe("invalid_device_profile");
    expect(refusalOf(() => parseRunGapAnalysisInput({ ...base, deviceCapabilityFacts: "nope" })).code).toBe("invalid_device_profile");
  });

  test("the typed error registry is frozen and every code is unique", () => {
    expect(new Set(GAP_ANALYSIS_ERROR_CODES).size).toBe(GAP_ANALYSIS_ERROR_CODES.length);
    expect(Object.isFrozen(GAP_ANALYSIS_ERROR_CODES)).toBe(true);
    expect(GAP_ANALYSIS_ERROR_CODES).toContain("unknown_evidence_ref");
    expect(GAP_ANALYSIS_ERROR_CODES).toContain("dangling_evidence_ref");
    expect(GAP_ANALYSIS_ERROR_CODES).toContain("analysis_not_found");
  });

  test("effort + method-preference resolution: defaults win when absent, overrides win when present", () => {
    const defaults = resolveEffortModel({});
    expect(defaults.byMethod.MANUAL_MEASUREMENT).toBe(DEFAULT_METHOD_EFFORT.MANUAL_MEASUREMENT);
    const overridden = resolveEffortModel({ MANUAL_MEASUREMENT: 0.95, DEPTH_SENSING: 0.05 });
    expect(overridden.byMethod.MANUAL_MEASUREMENT).toBe(0.95);
    expect(overridden.byMethod.DEPTH_SENSING).toBe(0.05);
    expect(overridden.byMethod.STILL_IMAGERY).toBe(DEFAULT_METHOD_EFFORT.STILL_IMAGERY);
    const prefs = resolveMethodPreferences({ observeNode: "VIDEO_FOOTAGE" } as Partial<MethodPreferences>);
    expect(prefs.measureProperty).toBe(DEFAULT_METHOD_PREFERENCES.measure_property);
    expect(prefs.observeNode).toBe("VIDEO_FOOTAGE");
    expect(prefs.resolveOcclusion).toBe(DEFAULT_METHOD_PREFERENCES.resolve_occlusion);
  });
});

describe("gap model: the pure engine's gap derivation (distinct failure modes)", () => {
  test("annotation-seam subject gaps: UNKNOWN / NOT_OBSERVED / OCCLUDED stay distinct first-class states", () => {
    const subjects: readonly GapSubject[] = [
      subjectOf("duct-shaft", {
        presence: "absent",
        annotation: { observationStatus: "NOT_OBSERVED", evidenceIds: [EV_DUCT] },
      }),
      subjectOf("skylight", {
        presence: "absent",
        annotation: { observationStatus: "OCCLUDED", evidenceIds: [EV_SKYLIGHT] },
      }),
      subjectOf("mezzanine", {
        presence: "absent",
        annotation: { observationStatus: "UNKNOWN", evidenceIds: [EV_MEZZANINE] },
      }),
    ];
    const { gaps, candidates, stats } = computeGapAnalysis(
      stateOf(subjects, { report: reportWith([]) }),
    );
    // All dimensions satisfied: ONLY the annotation seam contributes.
    expect(gaps.map((gap) => gap.gapClass).sort()).toEqual([
      "subject_capture_unknown",
      "subject_not_observed",
      "subject_occluded",
    ]);
    const byClass = new Map(gaps.map((gap) => [gap.gapClass, gap]));
    expect(byClass.get("subject_not_observed")?.state).toBe("NOT_OBSERVED");
    expect(byClass.get("subject_not_observed")?.kind).toBe("MISSING");
    expect(byClass.get("subject_occluded")?.state).toBe("OCCLUDED");
    expect(byClass.get("subject_occluded")?.kind).toBe("MISSING");
    expect(byClass.get("subject_capture_unknown")?.state).toBe("UNKNOWN");
    expect(byClass.get("subject_capture_unknown")?.kind).toBe("AMBIGUOUS");
    // Evidence substantiation rides on the gaps (annotation-backed).
    expect(byClass.get("subject_not_observed")?.evidenceIds).toEqual([EV_DUCT]);
    expect(stats.unknownStateGaps).toBe(1);
    expect(stats.occludedStateGaps).toBe(1);
    expect(stats.notObservedStateGaps).toBe(1);
    // Distinct action kinds per state: observe vs resolve vs verify.
    expect(candidates.map((candidate) => candidate.actionKind).sort()).toEqual([
      "observe_node",
      "resolve_occlusion",
      "verify_capture_status",
    ]);
  });

  test("a TOMBSTONED annotated target: the gap stands WITHOUT a candidate (honest escalation input)", () => {
    const subjects: readonly GapSubject[] = [
      subjectOf("chimney", {
        presence: "tombstoned",
        annotation: { observationStatus: "NOT_OBSERVED", evidenceIds: [EV_DUCT] },
      }),
    ];
    const { gaps, candidates, stats } = computeGapAnalysis(
      stateOf(subjects, { report: reportWith([]) }),
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.gapClass).toBe("subject_not_observed");
    expect(gaps[0]?.description).toContain("TOMBSTONED");
    expect(candidates).toHaveLength(0);
    expect(stats.tombstonedSubjectGaps).toBe(1);
  });

  test("evidence-sufficiency classes: no_evidence_recorded vs evidence_count_missing vs shortfall", () => {
    const profile = CANONICAL_PROFILE;
    const empty = computeGapAnalysis(
      stateOf([], { report: reportWith([{ dimensionId: "spatial-depth-evidence", outcome: "insufficient_data" }]), evidenceFacts: [] }),
    );
    expect(empty.gaps[0]?.gapClass).toBe("no_evidence_recorded");
    expect(empty.gaps[0]?.state).toBe("UNKNOWN");
    expect(empty.gaps[0]?.kind).toBe("MISSING");

    // Some evidence, none of the required method (basis reports 0 valid).
    const otherMethodFacts = [{ evidenceId: EV_DUCT, method: "STILL_IMAGERY" as const, invalidated: false, linkedNodeIds: [] }];
    const missingReport = {
      ...reportWith([{ dimensionId: "spatial-depth-evidence", outcome: "not_satisfied" }]),
      dimensions: reportWith([{ dimensionId: "spatial-depth-evidence", outcome: "not_satisfied" }]).dimensions.map(
        (dimension) =>
          dimension.dimensionId === "spatial-depth-evidence" && dimension.basis.kind === "evidence_sufficiency"
            ? { ...dimension, basis: { ...dimension.basis, validCount: 0, invalidCount: 0 } }
            : dimension,
      ),
    };
    const missing = computeGapAnalysis(
      stateOf([], { report: missingReport, evidenceFacts: otherMethodFacts }),
    );
    expect(missing.gaps[0]?.gapClass).toBe("evidence_count_missing");
    expect(missing.gaps[0]?.state).toBe("NOT_OBSERVED");

    // Some valid evidence of the method, below the minimum.
    const shortfallReport = {
      ...reportWith([{ dimensionId: "spatial-depth-evidence", outcome: "not_satisfied" }]),
      dimensions: reportWith([{ dimensionId: "spatial-depth-evidence", outcome: "not_satisfied" }]).dimensions.map(
        (dimension) =>
          dimension.dimensionId === "spatial-depth-evidence" && dimension.basis.kind === "evidence_sufficiency"
            ? { ...dimension, basis: { ...dimension.basis, validCount: 1 } }
            : dimension,
      ),
    };
    const shortfall = computeGapAnalysis(
      stateOf([], { report: shortfallReport, evidenceFacts: buildEvidenceFacts() }),
    );
    expect(shortfall.gaps[0]?.gapClass).toBe("evidence_count_shortfall");
    expect(shortfall.gaps[0]?.state).toBe("OBSERVED");
    expect(shortfall.gaps[0]?.kind).toBe("WEAK");
    expect(profile.dimensions.find((d) => d.dimensionId === "spatial-depth-evidence")?.critical).toBe(true);
  });

  test("uncertainty classes: sigma_not_reported vs sigma_above_bound vs non_numeric vs not_asserted", () => {
    const subjects: readonly GapSubject[] = [
      subjectOf("room-a", {
        properties: [
          { key: "room.height", value: 3.0, unit: "m", epistemicStatus: "OBSERVED", supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
          { key: "room.width", value: 5.0, unit: "m", epistemicStatus: "OBSERVED", uncertainty: { sigma: 0.04 }, supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
          { key: "room.length", value: "long", epistemicStatus: "OBSERVED", supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
        ],
      }),
    ];
    // Two uncertainty dimensions unsatisfied: height (σ missing), width (σ above), length (non-numeric key bound).
    const report: ReadinessReport = {
      ...buildCanonicalReport(),
      dimensions: buildCanonicalReport().dimensions.map((dimension) => {
        if (dimension.dimensionId === "room-height-uncertainty") return dimension; // insufficient_data (σ not reported)
        if (dimension.dimensionId === "room-width-uncertainty") return dimension; // not_satisfied (σ above)
        return { ...dimension, outcome: "satisfied" as const };
      }),
    };
    const { gaps } = computeGapAnalysis(stateOf(subjects, { report }));
    // room.length is not a bounded key of THIS profile → no gap for it.
    const classes = gaps.map((gap) => gap.gapClass);
    expect(classes).toContain("sigma_not_reported");
    expect(classes).toContain("sigma_above_bound");
    expect(classes).not.toContain("non_numeric_assertion");
    const height = gaps.find((gap) => gap.gapClass === "sigma_not_reported");
    expect(height?.subjectNodeId).toBe("room-a");
    expect(height?.propertyKey).toBe("room.height");
    expect(height?.state).toBe("NOT_OBSERVED"); // derivation-only property
    expect(height?.kind).toBe("MISSING");
    const width = gaps.find((gap) => gap.gapClass === "sigma_above_bound");
    expect(width?.kind).toBe("WEAK");

    // The bounded key asserted nowhere: task-level gap.
    const absent = computeGapAnalysis(
      stateOf([], {
        report: reportWith([{ dimensionId: "room-height-uncertainty", outcome: "insufficient_data" }]),
      }),
    );
    expect(absent.gaps[0]?.gapClass).toBe("bounded_property_not_asserted");
    expect(absent.gaps[0]?.subjectNodeId).toBeNull();
    expect(absent.gaps[0]?.propertyKey).toBe("room.height");
    expect(absent.gaps[0]?.state).toBe("NOT_OBSERVED");
  });

  test("coverage classes: unsupported vs invalidated_only vs indeterminate (live UNKNOWN annotation governs)", () => {
    const report = reportWith([{ dimensionId: "surface-coverage", outcome: "not_satisfied" }]);
    const subjects: readonly GapSubject[] = [
      subjectOf("node-clean"),
      subjectOf("node-invalidated", { invalidatedEvidenceIds: [EV_DUCT] }),
      subjectOf("node-unknown", { annotation: { observationStatus: "UNKNOWN", evidenceIds: [EV_SKYLIGHT] }, validEvidenceIds: [EV_MEZZANINE] }),
      subjectOf("node-covered", { validEvidenceIds: [EV_DUCT] }),
    ];
    const { gaps } = computeGapAnalysis(stateOf(subjects, { report }));
    const bySubject = new Map(gaps.map((gap) => [gap.subjectNodeId, gap]));
    expect(bySubject.get("node-clean")?.gapClass).toBe("coverage_unsupported");
    expect(bySubject.get("node-clean")?.state).toBe("NOT_OBSERVED");
    expect(bySubject.get("node-invalidated")?.gapClass).toBe("coverage_invalidated_only");
    expect(bySubject.get("node-invalidated")?.state).toBe("OBSERVED");
    // The UNKNOWN claim governs even though valid evidence exists — never resolved by inference.
    expect(bySubject.get("node-unknown")?.gapClass).toBe("coverage_indeterminate");
    expect(bySubject.get("node-unknown")?.state).toBe("UNKNOWN");
    expect(bySubject.get("node-unknown")?.evidenceIds).toEqual([EV_SKYLIGHT]);
    expect(bySubject.has("node-covered")).toBe(false); // covered: no gap
  });

  test("epistemic floor: below-floor properties and missing floor keys are distinct classes", () => {
    const report = reportWith([{ dimensionId: "material-epistemic-floor", outcome: "not_satisfied" }]);
    const subjects: readonly GapSubject[] = [
      subjectOf("wall-a", {
        properties: [
          { key: "element.material", value: "brick", epistemicStatus: "INFERRED", supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
        ],
      }),
    ];
    const withAssertion = computeGapAnalysis(stateOf(subjects, { report }));
    expect(withAssertion.gaps[0]?.gapClass).toBe("epistemic_below_floor");
    expect(withAssertion.gaps[0]?.kind).toBe("WEAK");
    expect(withAssertion.gaps[0]?.state).toBe("NOT_OBSERVED");
    expect(withAssertion.candidates[0]?.actionKind).toBe("confirm_property");
    expect(withAssertion.candidates[0]?.requiredEpistemicStatus).toBe("OBSERVED");

    const withoutAssertion = computeGapAnalysis(stateOf([], { report }));
    expect(withoutAssertion.gaps[0]?.gapClass).toBe("floor_property_not_asserted");
    expect(withoutAssertion.gaps[0]?.propertyKey).toBe("element.material");
  });

  test("no_modeled_subjects: an empty universe yields the task-level gap and NO candidate", () => {
    const report = reportWith([{ dimensionId: "surface-coverage", outcome: "insufficient_data" }]);
    const { gaps, candidates } = computeGapAnalysis(stateOf([], { report }));
    expect(gaps.map((gap) => gap.gapClass)).toEqual(["no_modeled_subjects"]);
    expect(candidates).toHaveLength(0);
  });

  test("satisfied dimensions produce NO gaps (the report governs; the bar is met)", () => {
    const subjects: readonly GapSubject[] = [subjectOf("uncovered-node")];
    const { gaps } = computeGapAnalysis(stateOf(subjects, { report: reportWith([]) }));
    // All dimensions satisfied: no gaps even though the node is uncovered.
    expect(gaps).toHaveLength(0);
  });

  test("property-absent gaps emit per-focus candidates ONLY for explicitly focused subjects (no fabrication)", () => {
    const report = reportWith([{ dimensionId: "room-height-uncertainty", outcome: "insufficient_data" }]);
    const subjects: readonly GapSubject[] = [
      subjectOf("room-a", { taskFocused: true, focusWeight: 1 }),
      subjectOf("room-b", { taskFocused: false, focusWeight: 0.25 }),
    ];
    const { gaps, candidates } = computeGapAnalysis(stateOf(subjects, { report }));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.gapClass).toBe("bounded_property_not_asserted");
    expect(candidates.map((candidate) => candidate.subjectNodeId)).toEqual(["room-a"]);
    expect(candidates[0]?.actionKind).toBe("measure_property");
    // Without focus: the gap stands, the engine refuses to pick a subject.
    const unfocused = computeGapAnalysis(
      stateOf(subjects.map((subject) => ({ ...subject, taskFocused: false, focusWeight: 1 })), { report }),
    );
    expect(unfocused.gaps).toHaveLength(1);
    expect(unfocused.candidates).toHaveLength(0);
  });
});

describe("gap model: the ranking matrix (named, inspectable, deterministic)", () => {
  const canonicalSubjects: readonly GapSubject[] = [
    subjectOf("room-lobby", {
      properties: [
        { key: "room.height", value: 3.0, unit: "m", epistemicStatus: "OBSERVED", supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
        { key: "room.width", value: 5.0, unit: "m", epistemicStatus: "OBSERVED", uncertainty: { sigma: 0.04 }, supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
      ],
    }),
    subjectOf("wall-north", {
      properties: [
        { key: "length", value: 5.2, unit: "m", epistemicStatus: "OBSERVED", uncertainty: { sigma: 0.01 }, supportingEvidenceIds: [EV_DUCT], invalidatedEvidenceIds: [] },
        { key: "element.material", value: "concrete", epistemicStatus: "OBSERVED", supportingEvidenceIds: [EV_DUCT], invalidatedEvidenceIds: [] },
      ],
      validEvidenceIds: [EV_DUCT],
    }),
    subjectOf("wall-south", {
      properties: [
        { key: "length", value: 4.8, unit: "m", epistemicStatus: "OBSERVED", uncertainty: { sigma: 0.01 }, supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
        { key: "element.material", value: "brick", epistemicStatus: "INFERRED", supportingEvidenceIds: [], invalidatedEvidenceIds: [] },
      ],
    }),
    subjectOf("wall-east", { invalidatedEvidenceIds: [EV_MEZZANINE] }),
    subjectOf("duct-shaft", { presence: "absent", annotation: { observationStatus: "NOT_OBSERVED", evidenceIds: [EV_DUCT] } }),
    subjectOf("skylight", { presence: "absent", annotation: { observationStatus: "OCCLUDED", evidenceIds: [EV_SKYLIGHT] } }),
    subjectOf("mezzanine", { presence: "absent", annotation: { observationStatus: "UNKNOWN", evidenceIds: [EV_MEZZANINE] } }),
  ];

  test("every score component is present, bounded, and stated with its derivation", () => {
    const { candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    expect(candidates.length).toBeGreaterThanOrEqual(10);
    for (const candidate of candidates) {
      const { score } = candidate;
      expect(score.taskImpact).toBeGreaterThanOrEqual(0);
      expect(score.taskImpact).toBeLessThanOrEqual(1);
      expect(score.expectedUncertaintyReduction).toBeGreaterThanOrEqual(0);
      expect(score.expectedUncertaintyReduction).toBeLessThanOrEqual(1);
      expect(score.operatorEffort).toBeGreaterThanOrEqual(0);
      expect(score.operatorEffort).toBeLessThanOrEqual(1);
      expect(score.recoverability).toBeGreaterThanOrEqual(0);
      expect(score.recoverability).toBeLessThanOrEqual(1);
      // The derivation strings state the numbers they produced.
      expect(score.derivation.taskImpact).toContain(`${score.taskImpact}`);
      expect(score.derivation.expectedUncertaintyReduction).toContain(String(score.expectedUncertaintyReduction));
      expect(score.derivation.operatorEffort).toContain(`${score.operatorEffort}`);
      expect(score.derivation.recoverability).toContain(`${score.recoverability}`);
      expect(score.derivation.composite).toContain(`${score.compositeValue}`);
    }
  });

  test("the composite is EXACTLY the documented weighted formula over the named components", () => {
    const { candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    for (const candidate of candidates) {
      const expected = Math.round(
        (SCORE_WEIGHTS.taskImpact * candidate.score.taskImpact +
          SCORE_WEIGHTS.expectedUncertaintyReduction * candidate.score.expectedUncertaintyReduction -
          SCORE_WEIGHTS.operatorEffort * candidate.score.operatorEffort -
          SCORE_WEIGHTS.recoverability * candidate.score.recoverability) *
          1e6,
      ) / 1e6;
      expect(candidate.score.compositeValue).toBe(expected);
    }
  });

  test("task impact derivation: criticality × dimension weight × focus, with the strongest blocker governing", () => {
    const { candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    const measure = candidates.find(
      (candidate) => candidate.actionKind === "measure_property" && candidate.propertyKey === "room.height",
    );
    expect(measure?.score.taskImpact).toBe(1); // critical (1) × weight (1) × focus (1)
    expect(measure?.score.derivation.taskImpact).toContain("criticality 1 (critical)");
    const confirm = candidates.find((candidate) => candidate.actionKind === "confirm_property");
    expect(confirm?.score.taskImpact).toBe(0.15); // non-critical (0.5) × weight (0.3) × focus (1)
    expect(confirm?.score.derivation.taskImpact).toContain("non-critical");
    // Annotation-seam gaps (no dimension): subject-expected × default weight.
    const resolve = candidates.find((candidate) => candidate.actionKind === "resolve_occlusion");
    expect(resolve?.score.taskImpact).toBe(0.5);
    expect(resolve?.score.derivation.taskImpact).toContain("subject-expected");
  });

  test("uncertainty reduction is honest: σ-known fractional, σ-unknown full resolution, non-measurement exactly 0", () => {
    const { candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    // σ unknown (room.height): full resolution of the unknown — never assumed 0.
    const measureHeight = candidates.find(
      (candidate) => candidate.actionKind === "measure_property" && candidate.propertyKey === "room.height",
    );
    expect(measureHeight?.score.expectedUncertaintyReduction).toBe(1);
    expect(measureHeight?.score.derivation.expectedUncertaintyReduction).toContain("UNKNOWN");
    // σ known above bound (room.width 0.04 → 0.02): fractional (0.04−0.02)/0.04 = 0.5.
    const measureWidth = candidates.find(
      (candidate) => candidate.actionKind === "measure_property" && candidate.propertyKey === "room.width",
    );
    expect(measureWidth?.score.expectedUncertaintyReduction).toBe(0.5);
    expect(measureWidth?.score.derivation.expectedUncertaintyReduction).toContain("fractional");
    // Confidence is not measurement uncertainty: confirm/verify actions are exactly 0.
    for (const candidate of candidates.filter(
      (candidate) =>
        candidate.actionKind === "confirm_property" || candidate.actionKind === "verify_capture_status",
    )) {
      expect(candidate.score.expectedUncertaintyReduction).toBe(0);
      expect(candidate.score.derivation.expectedUncertaintyReduction).toContain("by semantics");
    }
  });

  test("effort: the effort model + action count; verification carries the fixed effort", () => {
    const { candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    const observe = candidates.find(
      (candidate) => candidate.actionKind === "observe_node" && candidate.subjectNodeId === "room-lobby",
    );
    expect(observe?.score.operatorEffort).toBe(DEFAULT_METHOD_EFFORT.STILL_IMAGERY);
    expect(observe?.score.derivation.operatorEffort).toContain("default table");
    const verify = candidates.find((candidate) => candidate.actionKind === "verify_capture_status");
    expect(verify?.score.operatorEffort).toBe(0.1);
    const capture = candidates.find((candidate) => candidate.actionKind === "capture_evidence");
    expect(capture?.score.operatorEffort).toBe(DEFAULT_METHOD_EFFORT.DEPTH_SENSING);
    // An effort-context override is named in the derivation.
    const expensive = computeGapAnalysis(
      stateOf(canonicalSubjects, { effortModel: resolveEffortModel({ MANUAL_MEASUREMENT: 0.95 }) }),
    );
    const measure = expensive.candidates.find(
      (candidate) => candidate.actionKind === "measure_property" && candidate.propertyKey === "room.height",
    );
    expect(measure?.score.operatorEffort).toBe(0.95);
    expect(measure?.score.derivation.operatorEffort).toContain("effort-context override");
  });

  test("recoverability: state priors (OCCLUDED at risk, UNKNOWN never collapsed), tombstone unrecoverable", () => {
    const { candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    const resolve = candidates.find((candidate) => candidate.actionKind === "resolve_occlusion");
    expect(resolve?.score.recoverability).toBe(RECOVERABILITY_BY_STATE.OCCLUDED);
    const verify = candidates.find((candidate) => candidate.actionKind === "verify_capture_status");
    expect(verify?.score.recoverability).toBe(RECOVERABILITY_BY_STATE.UNKNOWN);
    expect(verify?.score.recoverability).toBeGreaterThan(0);
    expect(verify?.score.recoverability).toBeLessThan(1);
  });

  test("canonical ordering: composite DESC, then candidateId ASC on exact ties", () => {
    const { candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    for (let index = 1; index < candidates.length; index += 1) {
      const previous = candidates[index - 1] as (typeof candidates)[number];
      const current = candidates[index] as (typeof candidates)[number];
      if (previous.score.compositeValue !== current.score.compositeValue) {
        expect(previous.score.compositeValue).toBeGreaterThan(current.score.compositeValue);
      } else {
        expect(previous.candidateId < current.candidateId).toBe(true);
      }
    }
    // The canonical tie pair: observe room-lobby vs observe wall-south (both 0.505).
    const ties = candidates.filter((candidate) => candidate.score.compositeValue === 0.505);
    expect(ties).toHaveLength(2);
    expect(ties[0]?.candidateId).not.toBe(ties[1]?.candidateId);
    expect(ties.map((candidate) => candidate.subjectNodeId).sort()).toEqual(["room-lobby", "wall-south"]);
  });

  test("gap ordering: task-level first (class, then key), then subject (nodeId, key, class)", () => {
    const { gaps } = computeGapAnalysis(stateOf(canonicalSubjects));
    const taskLevel = gaps.filter((gap) => gap.subjectNodeId === null);
    const subjectLevel = gaps.filter((gap) => gap.subjectNodeId !== null);
    expect(gaps.indexOf(taskLevel[0] as (typeof gaps)[number])).toBe(0);
    for (let index = 1; index < taskLevel.length; index += 1) {
      const previous = taskLevel[index - 1] as (typeof taskLevel)[number];
      const current = taskLevel[index] as (typeof taskLevel)[number];
      expect(previous.gapClass <= current.gapClass).toBe(true);
    }
    for (let index = 1; index < subjectLevel.length; index += 1) {
      const previous = subjectLevel[index - 1] as (typeof subjectLevel)[number];
      const current = subjectLevel[index] as (typeof subjectLevel)[number];
      const previousSubject = (previous.subjectNodeId ?? "") as string;
      const currentSubject = (current.subjectNodeId ?? "") as string;
      const previousKey = (previous.propertyKey ?? "") as string;
      const currentKey = (current.propertyKey ?? "") as string;
      expect(
        previousSubject < currentSubject
          ? true
          : previousSubject === currentSubject && previousKey <= currentKey,
      ).toBe(true);
    }
  });

  test("every recommendation NAMES the gaps it addresses (non-empty, resolving, sorted)", () => {
    const { gaps, candidates } = computeGapAnalysis(stateOf(canonicalSubjects));
    const gapIds = new Set(gaps.map((gap) => gap.gapId));
    expect(gapIds.size).toBe(gaps.length);
    for (const candidate of candidates) {
      expect(candidate.addressesGapIds.length).toBeGreaterThanOrEqual(1);
      for (const gapId of candidate.addressesGapIds) {
        expect(gapIds.has(gapId)).toBe(true);
      }
      expect([...candidate.addressesGapIds].sort()).toEqual([...candidate.addressesGapIds]);
    }
    // Every gap that admits a candidate is addressed by at least one.
    const addressed = new Set(candidates.flatMap((candidate) => candidate.addressesGapIds));
    const actionable = gaps.filter(
      (gap) => gap.gapClass !== "no_modeled_subjects" && gap.gapClass !== "floor_property_not_asserted" && gap.gapClass !== "bounded_property_not_asserted",
    );
    for (const gap of actionable) {
      expect(addressed.has(gap.gapId)).toBe(true);
    }
  });

  test("byte-identical recomputation: the same state yields identical canonical rows", () => {
    const first = computeGapAnalysis(stateOf(canonicalSubjects));
    const second = computeGapAnalysis(stateOf(canonicalSubjects));
    expect(canonicalJsonStringify({ gaps: first.gaps, candidates: first.candidates, stats: first.stats })).toBe(
      canonicalJsonStringify({ gaps: second.gaps, candidates: second.candidates, stats: second.stats }),
    );
  });

  test("substitution candidates: only from the authority's device hint, own-method semantics, no closure claim", () => {
    const report = buildCanonicalReport();
    const withHint = {
      ...report,
      gaps: report.gaps.map((gap) =>
        gap.dimensionId === "spatial-depth-evidence"
          ? {
              ...gap,
              deviceHint: deviceHintOf("DEPTH_SENSING", "unavailable", [
                { method: "CALIBRATED_REFERENCE", plausibility: "available" },
                { method: "MANUAL_MEASUREMENT", plausibility: "degraded" },
                { method: "SPECIALIST_INSTRUMENT", plausibility: "undetermined" },
              ]),
            }
          : gap,
      ),
    };
    const { candidates, stats } = computeGapAnalysis(
      stateOf(canonicalSubjects, { report: withHint }),
    );
    const substitutions = candidates.filter((candidate) => candidate.substitution !== undefined);
    expect(substitutions).toHaveLength(2); // undetermined is skipped
    for (const candidate of substitutions) {
      expect(candidate.substitution?.originalMethod).toBe("DEPTH_SENSING");
      expect(["CALIBRATED_REFERENCE", "MANUAL_MEASUREMENT"]).toContain(candidate.method);
      // R3: the substituted method retains ITS OWN semantics — explicitly.
      expect(candidate.substitution?.semanticsNote).toContain("does NOT satisfy");
      expect(candidate.substitution?.semanticsNote).toContain("ITS OWN method/uncertainty semantics");
      expect(candidate.score.derivation.expectedUncertaintyReduction).toContain("own semantics");
    }
    // The substituted methods' reduction uses their OWN valid counts
    // (CALIBRATED_REFERENCE: 0 valid → 1; MANUAL_MEASUREMENT: 1 valid → 0.292893).
    const calibrated = substitutions.find((candidate) => candidate.method === "CALIBRATED_REFERENCE");
    expect(calibrated?.score.expectedUncertaintyReduction).toBe(1);
    const manual = substitutions.find((candidate) => candidate.method === "MANUAL_MEASUREMENT");
    expect(manual?.score.expectedUncertaintyReduction).toBe(0.292893);
    expect(stats.substitutionCandidates).toBe(2);
    // The PRIMARY requirement candidate still exists alongside.
    expect(candidates.some((candidate) => candidate.method === "DEPTH_SENSING")).toBe(true);
  });

  test("input digest: every perturbed input class changes it; identical inputs keep it", () => {
    const base = {
      profile: CANONICAL_PROFILE,
      realityVersion: buildRealityVersion(),
      evidenceFacts: buildEvidenceFacts(),
      annotations: [] as readonly ObservationStatusAnnotation[],
      uncertaintyAnnotations: buildCanonicalInput().uncertaintyAnnotations,
      taskFocus: buildCanonicalInput().taskFocus,
      effortModel: resolveEffortModel({}),
      methodPreferences: resolveMethodPreferences({}),
      deviceProfile: null,
    };
    const baseline = gapAnalysisInputDigest(base);
    expect(gapAnalysisInputDigest(base)).toBe(baseline); // stability
    // Coverage change (evidence state):
    expect(
      gapAnalysisInputDigest({ ...base, evidenceFacts: buildEvidenceFacts().slice(0, 8) }),
    ).not.toBe(baseline);
    // Uncertainty change:
    expect(
      gapAnalysisInputDigest({
        ...base,
        uncertaintyAnnotations: [
          { nodeId: "room-lobby", propertyKey: "room.width", sigma: 0.01, unit: "m" },
        ],
      }),
    ).not.toBe(baseline);
    // Effort change:
    expect(
      gapAnalysisInputDigest({ ...base, effortModel: resolveEffortModel({ STILL_IMAGERY: 0.9 }) }),
    ).not.toBe(baseline);
    // Task-impact change (profile weights):
    expect(
      gapAnalysisInputDigest({
        ...base,
        profile: {
          ...CANONICAL_PROFILE,
          dimensions: CANONICAL_PROFILE.dimensions.map((dimension) =>
            dimension.dimensionId === "surface-coverage" ? { ...dimension, weight: 0.2 } : dimension,
          ),
        },
      }),
    ).not.toBe(baseline);
    // Recoverability-relevant seam change (annotation state):
    expect(
      gapAnalysisInputDigest({
        ...base,
        annotations: [{ targetNodeId: "duct-shaft", observationStatus: "OCCLUDED", evidenceIds: [EV_DUCT] }],
      }),
    ).not.toBe(baseline);
    // Device capability change:
    expect(
      gapAnalysisInputDigest({
        ...base,
        deviceProfile: { capabilityFacts: { "capability.depth_sensing": "unavailable" } },
      }),
    ).not.toBe(baseline);
    // Evidence-fact ORDER insensitivity:
    expect(
      gapAnalysisInputDigest({ ...base, evidenceFacts: [...buildEvidenceFacts()].reverse() }),
    ).toBe(baseline);
  });
});

describe("gap model: stored-record parser (corruption guards)", () => {
  /** A minimal well-formed record object (history digest fixed up below). */
  const minimalRecord = (): Record<string, unknown> => ({
    analysisId: ANALYSIS_ID,
    taskRef: { projectId: "p", versionId: "v001", profileId: "assurance-profile/x/v1" },
    annotations: [],
    uncertaintyAnnotations: [{ nodeId: "n", propertyKey: "k", sigma: 0.1, unit: "m", basis: "b" }],
    taskFocus: [{ subjectNodeId: "s", impactWeight: 1 }],
    effortModel: resolveEffortModel({}),
    methodPreferences: resolveMethodPreferences({}),
    deviceCapabilityFacts: null,
    readinessReport: buildCanonicalReport(),
    gaps: [
      {
        gapId: "gap-0000000000000000",
        kind: "MISSING",
        state: "NOT_OBSERVED",
        gapClass: "coverage_unsupported",
        description: "d",
        subjectNodeId: "s",
        propertyKey: null,
        dimensionIds: ["surface-coverage"],
        critical: true,
        evidenceIds: [],
        addressesTaskFocus: false,
      },
    ],
    candidates: [
      {
        candidateId: "cand-0000000000000000",
        actionKind: "observe_node",
        method: "STILL_IMAGERY",
        subjectNodeId: "s",
        propertyKey: null,
        addressesGapIds: ["gap-0000000000000000"],
        score: {
          taskImpact: 0.7,
          expectedUncertaintyReduction: 1,
          operatorEffort: 0.15,
          recoverability: 0.6,
          compositeValue: 0.505,
          derivation: {
            taskImpact: "d1",
            expectedUncertaintyReduction: "d2",
            operatorEffort: "d3",
            recoverability: "d4",
            composite: "d5",
          },
        },
        instructions: "i",
      },
    ],
    stats: {
      totalGaps: 1,
      missingGaps: 1,
      weakGaps: 0,
      ambiguousGaps: 0,
      observedStateGaps: 0,
      unknownStateGaps: 0,
      notObservedStateGaps: 1,
      occludedStateGaps: 0,
      tombstonedSubjectGaps: 0,
      totalCandidates: 1,
      substitutionCandidates: 0,
      topCandidateId: "cand-0000000000000000",
      evidenceReferenced: 0,
    },
    inputDigest: "a".repeat(64),
    computedAt: fixedClock(),
    history: [
      {
        eventId: "evt-000001",
        eventType: "gap_analysis_recorded",
        occurredAt: fixedClock(),
        recordDigest: "b".repeat(64),
      },
    ],
  });

  test("a well-formed record parses; a mismatched history digest is typed corruption", () => {
    // Fix the history digest to the real content digest → parses cleanly.
    const valid = minimalRecord();
    const parsedOnce = (() => {
      try {
        return parseGapAnalysisRecord(valid);
      } catch {
        return null;
      }
    })();
    expect(parsedOnce).toBeNull(); // "b"*64 does not pin the content
    const recordWithPlaceholder = { ...valid, history: [{ ...(valid["history"] as Record<string, unknown>[])[0] as Record<string, unknown>, recordDigest: "c".repeat(64) }] };
    const parsed = (() => {
      try {
        return parseGapAnalysisRecord(recordWithPlaceholder);
      } catch {
        return null;
      }
    })();
    expect(parsed).toBeNull(); // still not the content digest
    // The genuinely-valid case: compute via the exported digest helper.
    const asRecord = {
      ...(valid as unknown as import("./model").GapAnalysisRecord),
      history: [],
    };
    const trueDigest = gapAnalysisContentDigest(asRecord);
    const wellFormed = {
      ...valid,
      history: [
        { ...(valid["history"] as Record<string, unknown>[])[0] as Record<string, unknown>, recordDigest: trueDigest },
      ],
    };
    const ok = parseGapAnalysisRecord(wellFormed);
    expect(ok.analysisId).toBe(ANALYSIS_ID);
    expect(ok.gaps).toHaveLength(1);
    expect(ok.candidates[0]?.addressesGapIds).toEqual(["gap-0000000000000000"]);
    // Round-trip through canonical JSON unchanged.
    expect(canonicalJsonStringify(parseGapAnalysisRecord(JSON.parse(canonicalJsonStringify(ok))))).toBe(
      canonicalJsonStringify(ok),
    );
  });

  test("inconsistent stats, phantom gap references and bad digests are typed corruption", () => {
    const bad = minimalRecord();
    (bad["stats"] as Record<string, unknown>)["totalGaps"] = 2;
    expect(refusalOf(() => parseGapAnalysisRecord(bad)).code).toBe("invalid_analysis_record");
    expect(refusalOf(() => parseGapAnalysisRecord("nope")).code).toBe("invalid_analysis_record");
    expect(refusalOf(() => parseGapAnalysisRecord(null)).code).toBe("invalid_analysis_record");
    // A candidate addressing an unknown gap is corruption.
    const phantom = minimalRecord();
    phantom["candidates"] = [
      {
        candidateId: "cand-0000000000000001",
        actionKind: "observe_node",
        method: "STILL_IMAGERY",
        subjectNodeId: "s",
        propertyKey: null,
        addressesGapIds: ["gap-doesnotexist00"],
        score: {
          taskImpact: 0.5,
          expectedUncertaintyReduction: 0,
          operatorEffort: 0.1,
          recoverability: 0.6,
          compositeValue: 0.145,
          derivation: { taskImpact: "a", expectedUncertaintyReduction: "b", operatorEffort: "c", recoverability: "d", composite: "e" },
        },
        instructions: "i",
      },
    ];
    expect(refusalOf(() => parseGapAnalysisRecord(phantom)).code).toBe("invalid_analysis_record");
    // Missing readinessReport is corruption (the consumed context is mandatory).
    const noReport = minimalRecord();
    delete noReport["readinessReport"];
    expect(refusalOf(() => parseGapAnalysisRecord(noReport)).code).toBe("invalid_analysis_record");
  });
});
