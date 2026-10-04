/**
 * WORLD-P2 — the EVIDENCE family corpus (`src/evidence/`).
 *
 * The committed, deterministic fixtures of the EVIDENCE +
 * MISSING-EVIDENCE stages: the fixture evidence records (the documents/
 * drawings/measurements/photos information continuity — every one of them
 * Evidence, content-addressed and immutable), the provenance links, the
 * bundles, and the declared requirement sets of the two fixture
 * scenarios:
 *
 *  - SCENARIO A ("insufficient"): one crack photo, no measured
 *    remaining-steel-section property → a MISSING gap → verdict
 *    NOT_READY → the bounded reasoner must REFUSE (insufficient
 *    evidence) → the lane emits an explicit request-evidence action.
 *    This is the flagship HONEST fail-closed drill.
 *  - SCENARIO B ("ready"): two crack photos, the steel-section property
 *    observed with 1σ 2.0 mm ≤ the 3.0 mm bound, the material at the
 *    OBSERVED floor → verdict READY → the lane proceeds to bounded
 *    reasoning, deterministic checks and governed action.
 */

import type {
  Evidence,
  EvidenceBundle,
  Measurement,
  PropertyAssertion,
  ProvenanceLink,
} from "@aise/shared-contracts";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import { textDigestOf } from "../seam";
import type { BindEvidenceInput } from "./contract";
import {
  FIXTURE_ACTOR_FIELD_ENGINEER,
  FIXTURE_EVIDENCE_CRACK_PHOTO_1,
  FIXTURE_EVIDENCE_CRACK_PHOTO_2,
  FIXTURE_EVIDENCE_DIAL_GAUGE,
  FIXTURE_EVIDENCE_DRAWING_SHEET,
  FIXTURE_PROBLEM_ID,
  FIXTURE_WALL_OBJECT_ID,
  PROBLEM_FIXTURE_RECORDED_AT,
} from "../problem/corpus";

/* ------------------------------------------------------------------ */
/* The fixture evidence records                                         */
/* ------------------------------------------------------------------ */

/** Declared instants of the fixture acquisitions (no clock reads). */
const CAPTURED_AT = "2026-10-01T09:30:00.000Z" as const;
const DRAWING_REGISTERED_AT = "2026-09-12T14:00:00.000Z" as const;
const GAUGE_READ_AT = "2026-10-01T10:05:00.000Z" as const;

/** The crack photos (STILL_IMAGERY). */
export const FIXTURE_EVIDENCE_PHOTO_1: Evidence = {
  contractVersion: CONTRACT_VERSION,
  contentId: FIXTURE_EVIDENCE_CRACK_PHOTO_1,
  byteSize: 2_411_004,
  mediaType: "image/jpeg",
  capturedAt: CAPTURED_AT,
  acquisitionMethod: "STILL_IMAGERY",
  acquisitionMetadata: {
    "mission.id": "mission-lintel-walk",
    "session.id": "session-2026-10-01-am",
    "device.id": "device-field-04",
    "capture.kind": "crack_documentation",
  },
};

export const FIXTURE_EVIDENCE_PHOTO_2: Evidence = {
  contractVersion: CONTRACT_VERSION,
  contentId: FIXTURE_EVIDENCE_CRACK_PHOTO_2,
  byteSize: 2_518_871,
  mediaType: "image/jpeg",
  capturedAt: CAPTURED_AT,
  acquisitionMethod: "STILL_IMAGERY",
  acquisitionMetadata: {
    "mission.id": "mission-lintel-walk",
    "session.id": "session-2026-10-01-am",
    "device.id": "device-field-04",
    "capture.kind": "crack_documentation",
  },
};

/** The drawing sheet (DOCUMENT_REGION — the drawings/documents continuity). */
export const FIXTURE_EVIDENCE_DRAWING: Evidence = {
  contractVersion: CONTRACT_VERSION,
  contentId: FIXTURE_EVIDENCE_DRAWING_SHEET,
  byteSize: 483_211,
  mediaType: "application/pdf",
  capturedAt: DRAWING_REGISTERED_AT,
  acquisitionMethod: "DOCUMENT_REGION",
  acquisitionMetadata: {
    "mission.id": "mission-drawing-registration",
    "session.id": "session-docs-2026-09",
    "device.id": "device-office-01",
    "capture.kind": "drawing_sheet_registration",
  },
};

/** The dial-gauge reading (MANUAL_MEASUREMENT). */
export const FIXTURE_EVIDENCE_GAUGE: Evidence = {
  contractVersion: CONTRACT_VERSION,
  contentId: FIXTURE_EVIDENCE_DIAL_GAUGE,
  byteSize: 1_204,
  mediaType: "text/csv",
  capturedAt: GAUGE_READ_AT,
  acquisitionMethod: "MANUAL_MEASUREMENT",
  acquisitionMetadata: {
    "mission.id": "mission-lintel-walk",
    "session.id": "session-2026-10-01-am",
    "device.id": "device-gauge-01",
    "capture.kind": "deflection_reading",
  },
};

/* ------------------------------------------------------------------ */
/* The fixture provenance links + bundles                               */
/* ------------------------------------------------------------------ */

/** Links: photos + gauge SUPPORT the wall; the drawing is CONTEXT. */
export const FIXTURE_PROVENANCE_LINKS: readonly ProvenanceLink[] = [
  {
    contractVersion: CONTRACT_VERSION,
    subjectKind: "reality_object",
    subjectId: FIXTURE_WALL_OBJECT_ID,
    evidenceContentId: FIXTURE_EVIDENCE_CRACK_PHOTO_1,
    role: "SUPPORTS",
  },
  {
    contractVersion: CONTRACT_VERSION,
    subjectKind: "reality_object",
    subjectId: FIXTURE_WALL_OBJECT_ID,
    evidenceContentId: FIXTURE_EVIDENCE_CRACK_PHOTO_2,
    role: "SUPPORTS",
  },
  {
    contractVersion: CONTRACT_VERSION,
    subjectKind: "reality_object",
    subjectId: FIXTURE_WALL_OBJECT_ID,
    evidenceContentId: FIXTURE_EVIDENCE_DRAWING_SHEET,
    role: "CONTEXT",
  },
  {
    contractVersion: CONTRACT_VERSION,
    subjectKind: "reality_object",
    subjectId: FIXTURE_WALL_OBJECT_ID,
    evidenceContentId: FIXTURE_EVIDENCE_DIAL_GAUGE,
    role: "SUPPORTS",
  },
];

/** The links of scenario A (photo 2 not yet captured). */
export const SCENARIO_A_PROVENANCE_LINKS: readonly ProvenanceLink[] = [
  FIXTURE_PROVENANCE_LINKS[0]!,
  FIXTURE_PROVENANCE_LINKS[2]!,
  FIXTURE_PROVENANCE_LINKS[3]!,
];

/** The described groupings (the RFI/submittal-set translation: bundles). */
export const FIXTURE_BUNDLES: readonly EvidenceBundle[] = [
  {
    contractVersion: CONTRACT_VERSION,
    bundleId: textDigestOf("AISE-WORLD-P2-fixture-bundle-crack-evidence"),
    description:
      "Field evidence of the lintel-bearing crack above Opening-001 (photos + gauge reading).",
    evidenceContentIds: [
      FIXTURE_EVIDENCE_CRACK_PHOTO_1,
      FIXTURE_EVIDENCE_CRACK_PHOTO_2,
      FIXTURE_EVIDENCE_DIAL_GAUGE,
    ],
  },
  {
    contractVersion: CONTRACT_VERSION,
    bundleId: textDigestOf("AISE-WORLD-P2-fixture-bundle-drawing-set"),
    description:
      "Registered drawing sheets relevant to the wall/opening context (the document set).",
    evidenceContentIds: [FIXTURE_EVIDENCE_DRAWING_SHEET],
  },
];

/** The bundles of scenario A (photo 2 not yet captured). */
export const SCENARIO_A_BUNDLES: readonly EvidenceBundle[] = [
  {
    contractVersion: CONTRACT_VERSION,
    bundleId: textDigestOf("AISE-WORLD-P2-fixture-bundle-crack-evidence-partial"),
    description:
      "Partial field evidence of the lintel-bearing crack (photo 1 + gauge reading; photo 2 pending).",
    evidenceContentIds: [FIXTURE_EVIDENCE_CRACK_PHOTO_1, FIXTURE_EVIDENCE_DIAL_GAUGE],
  },
  FIXTURE_BUNDLES[1]!,
];

/* ------------------------------------------------------------------ */
/* The AISE-side fixture property assertions + measurement              */
/* ------------------------------------------------------------------ */

/**
 * The material assertion (OBSERVED, evidence-bound) — satisfies the
 * epistemic floor in both scenarios. The BIM file's LoadBearing property
 * (an INFERRED substrate candidate) deliberately does NOT satisfy this
 * floor: a file says so, the site may differ.
 */
export const FIXTURE_ASSERTION_MATERIAL: PropertyAssertion = {
  contractVersion: CONTRACT_VERSION,
  assertionId: textDigestOf("AISE-WORLD-P2-fixture-assertion-material"),
  subjectRef: FIXTURE_WALL_OBJECT_ID,
  property: "structural_material",
  value: "reinforced-concrete-C30/37-lintel-on-masonry",
  unit: null,
  status: "OBSERVED",
  method: "field walk material identification against drawing A-101",
  source_evidence: [FIXTURE_EVIDENCE_CRACK_PHOTO_1, FIXTURE_EVIDENCE_DRAWING_SHEET],
  verified_by: null,
  verified_at: null,
};

/**
 * The measured deflection (OBSERVED with declared 1σ) — supports the
 * uncertainty-bound requirement of scenario B and the deflection
 * narrative of both scenarios.
 */
export const FIXTURE_ASSERTION_DEFLECTION: PropertyAssertion = {
  contractVersion: CONTRACT_VERSION,
  assertionId: textDigestOf("AISE-WORLD-P2-fixture-assertion-deflection"),
  subjectRef: FIXTURE_WALL_OBJECT_ID,
  property: "midspan_deflection",
  value: 12,
  unit: "mm",
  status: "OBSERVED",
  uncertainty: { kind: "STATISTICAL", plusMinus: 1.5, level: "1σ" },
  method: "dial-gauge reading at lintel midspan, three repeated setups",
  source_evidence: [FIXTURE_EVIDENCE_DIAL_GAUGE],
  verified_by: null,
  verified_at: null,
};

/**
 * The remaining steel section (OBSERVED with declared 1σ) — present ONLY
 * in scenario B. Its absence in scenario A is the flagship MISSING gap.
 */
export const FIXTURE_ASSERTION_STEEL_SECTION: PropertyAssertion = {
  contractVersion: CONTRACT_VERSION,
  assertionId: textDigestOf("AISE-WORLD-P2-fixture-assertion-steel-section"),
  subjectRef: FIXTURE_WALL_OBJECT_ID,
  property: "remaining_steel_section",
  value: 62,
  unit: "mm2",
  status: "OBSERVED",
  uncertainty: { kind: "STATISTICAL", plusMinus: 2, level: "1σ" },
  method: "cover-meter scan along the crack line, calibrated on the drawing bar schedule",
  source_evidence: [FIXTURE_EVIDENCE_CRACK_PHOTO_2, FIXTURE_EVIDENCE_DRAWING_SHEET],
  verified_by: null,
  verified_at: null,
};

/** The scenario-A assertion set (the steel section is NOT yet observed). */
export const SCENARIO_A_ASSERTIONS: readonly PropertyAssertion[] = [
  FIXTURE_ASSERTION_MATERIAL,
  FIXTURE_ASSERTION_DEFLECTION,
];

/** The scenario-B assertion set (everything above). */
export const SCENARIO_B_ASSERTIONS: readonly PropertyAssertion[] = [
  FIXTURE_ASSERTION_MATERIAL,
  FIXTURE_ASSERTION_DEFLECTION,
  FIXTURE_ASSERTION_STEEL_SECTION,
];

/** The fixture measurement (typed units, evidence-bound, OBSERVED). */
export const FIXTURE_MEASUREMENT_DEFLECTION: Measurement = {
  contractVersion: CONTRACT_VERSION,
  measurementId: textDigestOf("AISE-WORLD-P2-fixture-measurement-deflection"),
  subjectRef: FIXTURE_WALL_OBJECT_ID,
  quantity: "midspan_deflection",
  value: 12,
  unit: "mm",
  status: "OBSERVED",
  uncertainty: { kind: "STATISTICAL", plusMinus: 1.5, level: "1σ" },
  method: "dial-gauge reading at lintel midspan, three repeated setups",
  evidenceContentIds: [FIXTURE_EVIDENCE_DIAL_GAUGE],
  measuredAt: GAUGE_READ_AT,
};

/* ------------------------------------------------------------------ */
/* The fixture requirement sets                                         */
/* ------------------------------------------------------------------ */

/** Requirement ids (stable, content-derived). */
export const REQ_ID_IMAGERY = textDigestOf("AISE-WORLD-P2-fixture-req-imagery");
export const REQ_ID_STEEL_SECTION = textDigestOf("AISE-WORLD-P2-fixture-req-steel-section");
export const REQ_ID_MATERIAL = textDigestOf("AISE-WORLD-P2-fixture-req-material");

/**
 * The fixture requirement set (both scenarios declare the SAME needs —
 * the difference is only what the problem HAS; that is the entire point
 * of missing-evidence detection):
 *
 *  1. evidence_sufficiency: ≥ 2 valid STILL_IMAGERY records SUPPORTing
 *     the wall (scenario A has 1 → WEAK);
 *  2. uncertainty_bound: "remaining_steel_section" in mm2 with 1σ ≤ 3.0
 *     (scenario A has no assertion at all → MISSING → NOT_READY);
 *  3. epistemic_floor: "structural_material" at OBSERVED (both scenarios
 *     satisfy it — the field engineer observed and evidence-bounded it).
 */
export const FIXTURE_REQUIREMENT_SET = {
  problemId: FIXTURE_PROBLEM_ID,
  requirements: [
    {
      kind: "evidence_sufficiency" as const,
      requirementId: REQ_ID_IMAGERY,
      subjectRef: FIXTURE_WALL_OBJECT_ID,
      method: "STILL_IMAGERY" as const,
      requiredCount: 2,
      description:
        "At least two independent still images of the crack at the lintel bearing, linked to the wall.",
    },
    {
      kind: "uncertainty_bound" as const,
      requirementId: REQ_ID_STEEL_SECTION,
      subjectRef: FIXTURE_WALL_OBJECT_ID,
      propertyKey: "remaining_steel_section",
      requiredUnit: "mm2",
      maxSigma: 3,
      description:
        "The remaining steel section at the crack line measured in mm2 with declared 1σ ≤ 3.0 — " +
        "the section loss determines the bearing capacity assessment.",
    },
    {
      kind: "epistemic_floor" as const,
      requirementId: REQ_ID_MATERIAL,
      subjectRef: FIXTURE_WALL_OBJECT_ID,
      propertyKey: "structural_material",
      minStatus: "OBSERVED" as const,
      description:
        "The lintel's structural material must be observed (field-verified), not merely BIM-asserted.",
    },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* The fixture envelopes                                                */
/* ------------------------------------------------------------------ */

/** Scenario A's envelope: photo 1 + drawing + gauge (photo 2 pending). */
export const SCENARIO_A_EVIDENCE_INPUT: BindEvidenceInput = {
  problemId: FIXTURE_PROBLEM_ID,
  evidence: [FIXTURE_EVIDENCE_PHOTO_1, FIXTURE_EVIDENCE_DRAWING, FIXTURE_EVIDENCE_GAUGE],
  provenanceLinks: SCENARIO_A_PROVENANCE_LINKS,
  bundles: SCENARIO_A_BUNDLES,
  invalidatedContentIds: [],
  sealedAt: PROBLEM_FIXTURE_RECORDED_AT,
};

/** Scenario B's envelope: everything captured. */
export const SCENARIO_B_EVIDENCE_INPUT: BindEvidenceInput = {
  problemId: FIXTURE_PROBLEM_ID,
  evidence: [
    FIXTURE_EVIDENCE_PHOTO_1,
    FIXTURE_EVIDENCE_PHOTO_2,
    FIXTURE_EVIDENCE_DRAWING,
    FIXTURE_EVIDENCE_GAUGE,
  ],
  provenanceLinks: FIXTURE_PROVENANCE_LINKS,
  bundles: FIXTURE_BUNDLES,
  invalidatedContentIds: [],
  sealedAt: PROBLEM_FIXTURE_RECORDED_AT,
};

/* ------------------------------------------------------------------ */
/* Negative fixtures (fail-closed drills)                               */
/* ------------------------------------------------------------------ */

/** An envelope with a DUPLICATE evidence identity (refused by law #1). */
export const DUPLICATE_EVIDENCE_INPUT: BindEvidenceInput = {
  ...SCENARIO_B_EVIDENCE_INPUT,
  evidence: [FIXTURE_EVIDENCE_PHOTO_1, FIXTURE_EVIDENCE_PHOTO_1],
};

/** An envelope whose link cites evidence not in the envelope (refused). */
export const UNRESOLVED_LINK_INPUT: BindEvidenceInput = {
  ...SCENARIO_B_EVIDENCE_INPUT,
  provenanceLinks: [
    ...FIXTURE_PROVENANCE_LINKS,
    {
      contractVersion: CONTRACT_VERSION,
      subjectKind: "reality_object",
      subjectId: FIXTURE_WALL_OBJECT_ID,
      evidenceContentId: textDigestOf("AISE-WORLD-P2-fixture-evidence-not-registered"),
      role: "SUPPORTS",
    },
  ],
};

/** An envelope whose link cites a subject not in the context (refused). */
export const UNRESOLVED_SUBJECT_INPUT: BindEvidenceInput = {
  ...SCENARIO_B_EVIDENCE_INPUT,
  provenanceLinks: [
    ...FIXTURE_PROVENANCE_LINKS,
    {
      contractVersion: CONTRACT_VERSION,
      subjectKind: "reality_object",
      subjectId: textDigestOf("AISE-WORLD-P2-fixture-subject-not-in-context"),
      evidenceContentId: FIXTURE_EVIDENCE_CRACK_PHOTO_1,
      role: "SUPPORTS",
    },
  ],
};

/** An empty requirement set (the detector refuses — never vacuously ready). */
export const EMPTY_REQUIREMENT_SET = {
  problemId: FIXTURE_PROBLEM_ID,
  requirements: [],
} as const;

/** A requirement whose subject does not resolve in the context (refused). */
export const UNRESOLVED_SUBJECT_REQUIREMENT_SET = {
  problemId: FIXTURE_PROBLEM_ID,
  requirements: [
    {
      kind: "evidence_sufficiency" as const,
      requirementId: textDigestOf("AISE-WORLD-P2-fixture-req-unresolved-subject"),
      subjectRef: textDigestOf("AISE-WORLD-P2-fixture-subject-not-in-context"),
      method: "STILL_IMAGERY" as const,
      requiredCount: 1,
      description: "A requirement scoped to a subject that does not exist.",
    },
  ],
} as const;

/** A requirement with an out-of-range requiredCount (validator refusal). */
export const BAD_COUNT_REQUIREMENT_SET = {
  problemId: FIXTURE_PROBLEM_ID,
  requirements: [
    {
      kind: "evidence_sufficiency" as const,
      requirementId: textDigestOf("AISE-WORLD-P2-fixture-req-bad-count"),
      subjectRef: FIXTURE_WALL_OBJECT_ID,
      method: "STILL_IMAGERY" as const,
      requiredCount: 0,
      description: "A requirement with an out-of-range required count.",
    },
  ],
} as const;

/**
 * The evidence-actor fixture (used by the audit records): the field
 * engineer who captured the evidence. Re-exported from the problem
 * corpus for one import surface.
 */
export { FIXTURE_ACTOR_FIELD_ENGINEER };
