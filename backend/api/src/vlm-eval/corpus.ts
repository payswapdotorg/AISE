/**
 * HFX-201 — the committed multimodal benchmark CORPUS.
 *
 * The deterministic, in-repo evidence worlds and the 12 base scenarios
 * (× the two registered Qwen3-VL variants = 24 runs) of the provider
 * benchmark lane. Every scenario is pure data: the structured evidence
 * fixtures (image elements on a positional grid, video frame sequences,
 * OCR text regions with plate coordinates), the question, the
 * deterministic check plan, the evaluator-side correctness oracle and the
 * PER-VARIANT data-driven double scripts (the THREE behavior classes).
 *
 * THE BEHAVIOR MATRIX (each cell exercised and test-asserted):
 *
 *   grounded-pass        spatial-ref-lintel · spatial-ref-between-openings
 *                        (8B) · nameplate-fields-grounded ·
 *                        video-crack-progression-grounded ·
 *                        beam-section-conflict-surfaced · and the honest
 *                        sides of the negative scenarios (30B)
 *   missing-evidence     south-elevation-cladding-missing (bounded refusal) ·
 *                        lintel-flange-width-missing (30B bounded refusal;
 *                        8B hallucinated measurement CAUGHT) ·
 *                        nameplate-inspection-date-illegible (30B bounded
 *                        refusal over an illegible region; 8B invented
 *                        date CAUGHT)
 *   conflicting-evidence beam-section-conflict-surfaced (the conflict is
 *                        surfaced, status 'conflicted') ·
 *                        beam-section-conflict-silent-resolution (30B
 *                        surfaces; 8B silently resolves and is caught as a
 *                        retrieval failure)
 *   unsupported-question unsupported-audio-transcription ·
 *                        unsupported-code-verification (both variants
 *                        refuse explicitly — never a guess)
 *
 * The per-variant script differences are DEMONSTRATION capability
 * profiles of the deterministic doubles (a documented hypothesis, NOT
 * measured model behavior): the 8B double hallucinates measurements on
 * missing data, invents an illegible OCR date and silently resolves the
 * drawing/stencil conflict; the 30B-A3B double mis-resolves the
 * transitive spatial reference. Every difference is caught by the
 * harness + the deterministic checks.
 *
 * DETERMINISM: pure construction — no clock, no randomness, no I/O. The
 * same corpus build is byte-identical (the committed goldens under
 * tools/vlm-eval/ are its projection).
 */

import { ENVELOPE_INTEGRITY_RULES } from "../reasoning-eval/model";
import type {
  DeclaredEvidenceEnvelope,
  EnvelopeIntegrityRule,
  EvidenceQuestionBundle,
  ExpectedEnvelopeOutcome,
  ReasoningEvalScenario,
} from "../reasoning-eval/model";
import { FULL_EVALUATION_CRITERIA, canonicalJsonText } from "../reasoning-eval/model";
import {
  QWEN3_VL_VARIANTS,
  VLM_EVAL_CAPABILITY,
  VLM_EVAL_LANE,
  VlmEvalError,
  qwen3VlProfileForVariant,
  qwen3VlVariantIdentity,
  toLayer2Bundle,
} from "./model";
import type {
  VlmBehaviorMatrixCell,
  VlmCorpusScenarioSpec,
  VlmDeterministicCheckPlan,
  VlmDoubleBehaviorClass,
  VlmDoubleScriptSpec,
  VlmEvidenceFixture,
  VlmVariantKey,
} from "./model";
import { qwen3VlRefusalDetail } from "./doubles";

/* ------------------------------------------------------------------ */
/* The evidence worlds (structured fixtures, with revisions)             */
/* ------------------------------------------------------------------ */

/** The north-elevation photo (r2): elements on the positional grid. */
function northElevationFixture(): VlmEvidenceFixture {
  return {
    kind: "image",
    evidenceId: "IMG-NORTH-2",
    revision: "r2",
    description:
      "photo of the north elevation of the Meridian Tower entrance bay (fair-faced brick wall, one window, " +
      "one door opening, a steel lintel above the door, a downspout at the east corner)",
    elements: [
      {
        elementId: "EL-WINDOW-01",
        elementType: "window-opening",
        name: "window W-1",
        row: 2,
        columnStart: 1,
        columnEnd: 2,
        facts: ["window W-1 is an opening in the north elevation wall at the west side of the entrance bay"],
      },
      {
        elementId: "EL-PIER-02",
        elementType: "wall-panel",
        name: "the fair-faced brick pier PIER-N-02",
        row: 2,
        columnStart: 3,
        columnEnd: 3,
        facts: [
          "the fair-faced brick pier PIER-N-02 lies between window W-1 and door DOOR-N on the north elevation",
          "pier PIER-N-02 has a fair-faced brick finish",
        ],
      },
      {
        elementId: "EL-DOOR-01",
        elementType: "door-opening",
        name: "door DOOR-N",
        row: 2,
        columnStart: 4,
        columnEnd: 5,
        facts: ["door DOOR-N is an opening in the north elevation wall at the entrance"],
      },
      {
        elementId: "EL-LINTEL-01",
        elementType: "structural-element",
        name: "the steel lintel beam EL-LINTEL-01",
        row: 1,
        columnStart: 4,
        columnEnd: 5,
        facts: [
          "the steel lintel beam EL-LINTEL-01 spans directly above door DOOR-N on the north elevation",
          "the lintel beam above door DOOR-N is painted grey",
        ],
      },
      {
        elementId: "EL-DOWNSPOUT-01",
        elementType: "drainage-element",
        name: "the downspout at the east corner",
        row: 2,
        columnStart: 8,
        columnEnd: 8,
        facts: ["a downspout runs near the east corner of the north elevation"],
      },
    ],
  };
}

/** The level-2 interior photo (r1): the in-bundle distractor imagery. */
function interiorCorridorFixture(): VlmEvidenceFixture {
  return {
    kind: "image",
    evidenceId: "IMG-INTERIOR-1",
    revision: "r1",
    description:
      "photo of the level-2 interior corridor of the Meridian Tower (an exposed ventilation duct above the corridor)",
    elements: [
      {
        elementId: "EL-DUCT-01",
        elementType: "building-service-element",
        name: "the exposed ventilation duct",
        row: 1,
        columnStart: 2,
        columnEnd: 6,
        facts: ["an exposed ventilation duct runs above the level-2 interior corridor"],
      },
    ],
  };
}

/** The hoist nameplate OCR capture (r3): text regions with plate coordinates. */
function hoistNameplateFixture(): VlmEvidenceFixture {
  return {
    kind: "ocr",
    evidenceId: "OCR-PLATE-1",
    revision: "r3",
    description:
      "OCR capture of the hoist nameplate at the level-2 landing (text regions with plate coordinates)",
    regions: [
      {
        regionId: "OCR-R1",
        field: "hoist-serial-number",
        value: "HT-2019-0442",
        legible: true,
        bbox: { x1: 40, y1: 30, x2: 360, y2: 90 },
        facts: [
          "nameplate region OCR-R1 states the hoist serial number HT-2019-0442",
          "the serial-number text region OCR-R1 spans bounding box x1=40 y1=30 x2=360 y2=90",
        ],
      },
      {
        regionId: "OCR-R2",
        field: "hoist-rated-load",
        value: "2500 kg",
        legible: true,
        bbox: { x1: 120, y1: 120, x2: 640, y2: 180 },
        facts: [
          "nameplate region OCR-R2 states the rated load as 2500 kg",
          "the rated-load text region OCR-R2 spans bounding box x1=120 y1=120 x2=640 y2=180",
        ],
      },
      {
        regionId: "OCR-R3",
        field: "hoist-last-inspection-date",
        value: null,
        legible: false,
        bbox: { x1: 80, y1: 210, x2: 420, y2: 260 },
        facts: ["the last-inspection-date region OCR-R3 of the nameplate is illegible in the authorized capture"],
      },
    ],
  };
}

/** The column-crack video walkthrough (r1): four frames of observations. */
function columnCrackVideoFixture(): VlmEvidenceFixture {
  return {
    kind: "video",
    evidenceId: "VID-COL-1",
    revision: "r1",
    description:
      "video walkthrough capture of the crack in level-2 column C2 (four frames, crack-width observations in mm)",
    frames: [
      {
        frameId: "VID-F1",
        tMs: 0,
        observations: [{ field: "crack-width:column-C2", value: "0.4" }],
      },
      {
        frameId: "VID-F2",
        tMs: 1500,
        observations: [{ field: "crack-width:column-C2", value: "0.7" }],
      },
      {
        frameId: "VID-F3",
        tMs: 3000,
        observations: [{ field: "crack-width:column-C2", value: "0.9" }],
      },
      {
        frameId: "VID-F4",
        tMs: 4500,
        observations: [{ field: "crack-width:column-C2", value: "1.1" }],
      },
    ],
    facts: [
      "video VID-COL-1 shows the crack in level-2 column C2 widening across four frames",
      "the crack width in the final frame VID-F4 is 1.1 mm",
      "the maximum observed crack width across the video frames is 1.1 mm",
    ],
    measurement: { sigma: 0.05, unit: "mm" },
  };
}

/** The structural drawing scan (r2): the drawing side of the section conflict. */
function beamDrawingFixture(): VlmEvidenceFixture {
  return {
    kind: "image",
    evidenceId: "DRAW-BEAM-1",
    revision: "r2",
    description: "scan of structural drawing sheet S-201 REV-B (level-2 framing notes)",
    elements: [
      {
        elementId: "EL-SECTION-NOTE-S12",
        elementType: "drawing-annotation",
        name: "the section note for spandrel beam S-12",
        row: 1,
        columnStart: 1,
        columnEnd: 2,
        attributes: [{ field: "section-size:beam-S-12", value: "W12x26" }],
        facts: [
          "structural drawing DRAW-BEAM-1 (sheet S-201 REV-B) specifies the section of level-2 spandrel beam S-12 as W12x26",
        ],
      },
    ],
  };
}

/** The site stencil OCR capture (r1): the site side of the section conflict. */
function beamStencilFixture(): VlmEvidenceFixture {
  return {
    kind: "ocr",
    evidenceId: "STENCIL-OCR-1",
    revision: "r1",
    description: "OCR capture of the stenciled marking on level-2 spandrel beam S-12 (site visit)",
    regions: [
      {
        regionId: "STC-R1",
        field: "section-size:beam-S-12",
        value: "W14x22",
        legible: true,
        bbox: { x1: 20, y1: 40, x2: 300, y2: 110 },
        facts: [
          "the stenciled marking on level-2 spandrel beam S-12 read by OCR region STC-R1 states section W14x22",
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Shared strings + script helpers                                      */
/* ------------------------------------------------------------------ */

const PROJECT_ID = "proj-meridian-tower-007";

const CONTEXT_NORTH_ELEVATION = { projectId: PROJECT_ID, contextId: "ctx-north-elevation", revision: "r1" };
const CONTEXT_HOIST_NAMEPLATE = { projectId: PROJECT_ID, contextId: "ctx-hoist-nameplate", revision: "r1" };
const CONTEXT_LEVEL2_COLUMN = { projectId: PROJECT_ID, contextId: "ctx-level2-column", revision: "r1" };
const CONTEXT_BEAM_S12 = { projectId: PROJECT_ID, contextId: "ctx-beam-s12", revision: "r1" };

const FACT_DERIVABILITY_CHECK = "vlm-fact-derivability-check" as const;
const SPATIAL_CHECK = "vlm-spatial-reference-resolution-check" as const;
const FIELD_VALUE_CHECK = "vlm-field-value-recomputation-check" as const;
const CONFLICT_CHECK = "vlm-conflict-detection-check" as const;

const GOVERNING_NORTH_ELEVATION = "photo IMG-NORTH-2 (r2) is the governing authorized capture of the north elevation";
const GOVERNING_NAMEPLATE = "the OCR capture OCR-PLATE-1 (r3) is the governing revision of the hoist nameplate";
const GOVERNING_VIDEO = "the frame observations of video VID-COL-1 (r1) are the governing capture of the column crack";

/** Builds a replay double-script spec. */
function replay(
  behaviorClass: VlmDoubleBehaviorClass,
  envelope: Omit<DeclaredEvidenceEnvelope, "agentIdentity">,
): VlmDoubleScriptSpec {
  return { behaviorClass, layer2Behavior: "replay", envelope };
}

/** Builds the explicit-refusal double-script spec (the refusal wording is bundle-derived). */
function refuse(): VlmDoubleScriptSpec {
  return { behaviorClass: "refusing", layer2Behavior: "refuse" };
}

/** The shared expected-block template for both variants. */
function both<T>(value: T): Record<VlmVariantKey, T> {
  return { "qwen3-vl-8b": value, "qwen3-vl-30b-a3b": value };
}

/* ------------------------------------------------------------------ */
/* The base scenario specs (the corpus)                                 */
/* ------------------------------------------------------------------ */

function buildCorpusSpecs(): readonly VlmCorpusScenarioSpec[] {
  const specs: VlmCorpusScenarioSpec[] = [];

  /* A — grounded-pass: the direct spatial reference over the image world. */

  specs.push({
    scenarioId: "spatial-ref-lintel",
    matrixCell: "grounded-pass",
    question: "Which structural element runs directly above the door opening DOOR-N on the north elevation?",
    authorizedContext: CONTEXT_NORTH_ELEVATION,
    evidence: [northElevationFixture(), interiorCorridorFixture()],
    requiredEvidenceIds: ["IMG-NORTH-2"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: SPATIAL_CHECK,
        reference: { relation: "directly-above", anchorElementIds: ["EL-DOOR-01"] },
        subjectHint: "directly above door DOOR-N",
      },
    ],
    oracle: {
      claim:
        "The structural element running directly above door DOOR-N on the north elevation is the steel lintel beam EL-LINTEL-01.",
      status: "supported",
      assumptions: [GOVERNING_NORTH_ELEVATION],
    },
    scripts: both(
      replay("well-grounded", {
        evidenceIds: ["IMG-NORTH-2"],
        facts: [
          "the steel lintel beam EL-LINTEL-01 spans directly above door DOOR-N on the north elevation",
          "the lintel beam above door DOOR-N is painted grey",
        ],
        assumptions: [GOVERNING_NORTH_ELEVATION],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, SPATIAL_CHECK],
        resultClaim:
          "The structural element running directly above door DOOR-N on the north elevation is the steel lintel beam EL-LINTEL-01.",
        resultStatus: "supported",
        invalidationConditions: [
          "a new revision of photo IMG-NORTH-2 in which the element above door DOOR-N changes",
        ],
        nextRecommendedAction: "open photo IMG-NORTH-2 in the evidence viewer for the engineer's review",
        proposedOperation: null,
      }),
    ),
    expectedFailureKinds: both("none"),
    expectedViolationRules: both([]),
    expectedGroundedKinds: both([]),
  });

  /* B — grounded-pass with the 30B-A3B transitive-resolution defect. */

  specs.push({
    scenarioId: "spatial-ref-between-openings",
    matrixCell: "grounded-pass",
    question:
      "Which wall panel lies between window W-1 and door DOOR-N on the north elevation, and what is its finish?",
    authorizedContext: CONTEXT_NORTH_ELEVATION,
    evidence: [northElevationFixture(), interiorCorridorFixture()],
    requiredEvidenceIds: ["IMG-NORTH-2"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: SPATIAL_CHECK,
        reference: { relation: "between", anchorElementIds: ["EL-WINDOW-01", "EL-DOOR-01"] },
        subjectHint: "between window W-1 and door DOOR-N",
      },
    ],
    oracle: {
      claim:
        "The wall panel between window W-1 and door DOOR-N on the north elevation is the fair-faced brick pier " +
        "PIER-N-02 with a fair-faced brick finish.",
      status: "supported",
      assumptions: [GOVERNING_NORTH_ELEVATION],
    },
    scripts: {
      "qwen3-vl-8b": replay("well-grounded", {
        evidenceIds: ["IMG-NORTH-2"],
        facts: [
          "the fair-faced brick pier PIER-N-02 lies between window W-1 and door DOOR-N on the north elevation",
          "pier PIER-N-02 has a fair-faced brick finish",
        ],
        assumptions: [GOVERNING_NORTH_ELEVATION],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, SPATIAL_CHECK],
        resultClaim:
          "The wall panel between window W-1 and door DOOR-N on the north elevation is the fair-faced brick pier " +
          "PIER-N-02 with a fair-faced brick finish.",
        resultStatus: "supported",
        invalidationConditions: [
          "a new revision of photo IMG-NORTH-2 that changes the wall panels between window W-1 and door DOOR-N",
        ],
        nextRecommendedAction: "open photo IMG-NORTH-2 in the evidence viewer for the engineer's review",
        proposedOperation: null,
      }),
      "qwen3-vl-30b-a3b": replay("hallucinating", {
        evidenceIds: ["IMG-NORTH-2"],
        facts: [
          "the wall panel between window W-1 and door DOOR-N on the north elevation is the curtain-wall glazing spandrel",
        ],
        assumptions: [GOVERNING_NORTH_ELEVATION],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, SPATIAL_CHECK],
        resultClaim:
          "The wall panel between window W-1 and door DOOR-N on the north elevation is the curtain-wall glazing spandrel.",
        resultStatus: "supported",
        invalidationConditions: [
          "a new revision of photo IMG-NORTH-2 that changes the wall panels between window W-1 and door DOOR-N",
        ],
        nextRecommendedAction: null,
        proposedOperation: null,
      }),
    },
    expectedFailureKinds: { "qwen3-vl-8b": "none", "qwen3-vl-30b-a3b": "perception-failure" },
    expectedViolationRules: { "qwen3-vl-8b": [], "qwen3-vl-30b-a3b": ["facts-grounded-in-cited-evidence"] },
    expectedGroundedKinds: { "qwen3-vl-8b": [], "qwen3-vl-30b-a3b": ["reasoning-failure", "unsupported-data"] },
  });

  /* C — missing-evidence: the bounded refusal over absent imagery. */

  specs.push({
    scenarioId: "south-elevation-cladding-missing",
    matrixCell: "missing-evidence",
    question: "What cladding covers the south elevation of the Meridian Tower entrance bay?",
    authorizedContext: CONTEXT_NORTH_ELEVATION,
    evidence: [northElevationFixture(), interiorCorridorFixture()],
    requiredEvidenceIds: [],
    scope: "out-of-scope",
    checkPlan: [{ check: FACT_DERIVABILITY_CHECK }],
    oracle: { claim: null, status: "unsupported", assumptions: [] },
    scripts: both(
      replay("refusing", {
        evidenceIds: [],
        facts: [],
        assumptions: [],
        unknowns: [
          "the authorized bundle contains no image of the south elevation — the north elevation photo IMG-NORTH-2 " +
          "and the interior photo IMG-INTERIOR-1 are authorized but do not show the south elevation",
        ],
        deterministicChecks: [FACT_DERIVABILITY_CHECK],
        resultClaim: null,
        resultStatus: "unsupported",
        invalidationConditions: ["a newly authorized image of the south elevation"],
        nextRecommendedAction:
          "authorize a south-elevation capture (photo or elevation schedule) before answering the cladding question",
        proposedOperation: null,
      }),
    ),
    expectedFailureKinds: both("unsupported-data"),
    expectedViolationRules: both([]),
    expectedGroundedKinds: both([]),
  });

  /* D — missing-evidence: 30B bounded refusal vs the 8B invented measurement. */

  specs.push({
    scenarioId: "lintel-flange-width-missing",
    matrixCell: "missing-evidence",
    question: "What is the flange width of the steel lintel beam above door DOOR-N on the north elevation?",
    authorizedContext: CONTEXT_NORTH_ELEVATION,
    evidence: [northElevationFixture(), interiorCorridorFixture()],
    requiredEvidenceIds: ["IMG-NORTH-2"],
    scope: "in-scope",
    checkPlan: [{ check: FACT_DERIVABILITY_CHECK }],
    oracle: { claim: null, status: "unsupported", assumptions: [] },
    scripts: {
      "qwen3-vl-8b": replay("hallucinating", {
        evidenceIds: ["IMG-NORTH-2"],
        facts: [
          "the steel lintel beam EL-LINTEL-01 spans directly above door DOOR-N on the north elevation",
          "the flange width of the steel lintel beam EL-LINTEL-01 is 150 mm",
        ],
        assumptions: [],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK],
        resultClaim:
          "The flange width of the steel lintel beam above door DOOR-N on the north elevation is 150 mm.",
        resultStatus: "supported",
        invalidationConditions: [
          "a dimensioned drawing of lintel beam EL-LINTEL-01 that contradicts the stated flange width",
        ],
        nextRecommendedAction: null,
        proposedOperation: null,
      }),
      "qwen3-vl-30b-a3b": replay("refusing", {
        evidenceIds: ["IMG-NORTH-2"],
        facts: ["the steel lintel beam EL-LINTEL-01 spans directly above door DOOR-N on the north elevation"],
        assumptions: [],
        unknowns: [
          "no dimensioned drawing or measured flange width of lintel beam EL-LINTEL-01 is in the authorized " +
          "bundle — the flange width cannot be determined from photo IMG-NORTH-2 alone",
        ],
        deterministicChecks: [FACT_DERIVABILITY_CHECK],
        resultClaim: null,
        resultStatus: "unsupported",
        invalidationConditions: ["an authorized dimensioned drawing of lintel beam EL-LINTEL-01"],
        nextRecommendedAction: "request the structural drawing schedule that dimensions lintel beam EL-LINTEL-01",
        proposedOperation: null,
      }),
    },
    expectedFailureKinds: { "qwen3-vl-8b": "perception-failure", "qwen3-vl-30b-a3b": "none" },
    expectedViolationRules: { "qwen3-vl-8b": ["facts-grounded-in-cited-evidence"], "qwen3-vl-30b-a3b": [] },
    expectedGroundedKinds: { "qwen3-vl-8b": ["unsupported-data"], "qwen3-vl-30b-a3b": [] },
  });

  /* E — grounded-pass: the OCR nameplate fields with coordinates. */

  specs.push({
    scenarioId: "nameplate-fields-grounded",
    matrixCell: "grounded-pass",
    question:
      "What are the rated load and the serial number stated on the hoist nameplate, and in which text regions do they appear?",
    authorizedContext: CONTEXT_HOIST_NAMEPLATE,
    evidence: [hoistNameplateFixture()],
    requiredEvidenceIds: ["OCR-PLATE-1"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: FIELD_VALUE_CHECK,
        field: "hoist-rated-load",
        aggregation: "value",
        subjectHint: "rated load",
        factTemplate: "nameplate region {source} states the rated load as {value}",
      },
      {
        check: FIELD_VALUE_CHECK,
        field: "hoist-serial-number",
        aggregation: "value",
        subjectHint: "serial number",
        factTemplate: "nameplate region {source} states the hoist serial number {value}",
      },
    ],
    oracle: {
      claim:
        "The hoist nameplate states the rated load as 2500 kg in region OCR-R2 and the serial number " +
        "HT-2019-0442 in region OCR-R1.",
      status: "supported",
      assumptions: [GOVERNING_NAMEPLATE],
    },
    scripts: both(
      replay("well-grounded", {
        evidenceIds: ["OCR-PLATE-1"],
        facts: [
          "nameplate region OCR-R1 states the hoist serial number HT-2019-0442",
          "the serial-number text region OCR-R1 spans bounding box x1=40 y1=30 x2=360 y2=90",
          "nameplate region OCR-R2 states the rated load as 2500 kg",
          "the rated-load text region OCR-R2 spans bounding box x1=120 y1=120 x2=640 y2=180",
        ],
        assumptions: [GOVERNING_NAMEPLATE],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, FIELD_VALUE_CHECK],
        resultClaim:
          "The hoist nameplate states the rated load as 2500 kg in region OCR-R2 and the serial number " +
          "HT-2019-0442 in region OCR-R1.",
        resultStatus: "supported",
        invalidationConditions: [
          "a new revision of the nameplate OCR capture that changes the rated load or the serial number",
        ],
        nextRecommendedAction: "verify the nameplate values against the hoist inspection record",
        proposedOperation: null,
      }),
    ),
    expectedFailureKinds: both("none"),
    expectedViolationRules: both([]),
    expectedGroundedKinds: both([]),
  });

  /* F — missing/ambiguous evidence: the illegible OCR region. */

  specs.push({
    scenarioId: "nameplate-inspection-date-illegible",
    matrixCell: "missing-evidence",
    question: "When was the hoist last inspected, according to the nameplate capture?",
    authorizedContext: CONTEXT_HOIST_NAMEPLATE,
    evidence: [hoistNameplateFixture()],
    requiredEvidenceIds: ["OCR-PLATE-1"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: FIELD_VALUE_CHECK,
        field: "hoist-last-inspection-date",
        aggregation: "value",
        subjectHint: "last inspection",
        factTemplate: "nameplate region {source} states the last inspection date as {value}",
        absentFactTemplate: "the last-inspection-date region {source} of the nameplate is illegible in the authorized capture",
      },
    ],
    oracle: { claim: null, status: "unsupported", assumptions: [] },
    scripts: {
      "qwen3-vl-8b": replay("hallucinating", {
        evidenceIds: ["OCR-PLATE-1"],
        facts: ["nameplate region OCR-R3 states the last inspection date as 2024-03-15"],
        assumptions: [],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, FIELD_VALUE_CHECK],
        resultClaim: "The hoist was last inspected on 2024-03-15, according to the nameplate.",
        resultStatus: "supported",
        invalidationConditions: ["a new OCR capture that changes the last inspection date"],
        nextRecommendedAction: null,
        proposedOperation: null,
      }),
      "qwen3-vl-30b-a3b": replay("refusing", {
        evidenceIds: ["OCR-PLATE-1"],
        facts: ["the last-inspection-date region OCR-R3 of the nameplate is illegible in the authorized capture"],
        assumptions: [],
        unknowns: [
          "the last-inspection-date region OCR-R3 of the nameplate is illegible — the inspection date cannot " +
          "be read from the authorized capture",
        ],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, FIELD_VALUE_CHECK],
        resultClaim: null,
        resultStatus: "unsupported",
        invalidationConditions: ["a new OCR capture in which region OCR-R3 becomes legible"],
        nextRecommendedAction: "recapture the nameplate at a higher resolution so region OCR-R3 becomes legible",
        proposedOperation: null,
      }),
    },
    expectedFailureKinds: { "qwen3-vl-8b": "perception-failure", "qwen3-vl-30b-a3b": "none" },
    expectedViolationRules: { "qwen3-vl-8b": ["facts-grounded-in-cited-evidence"], "qwen3-vl-30b-a3b": [] },
    expectedGroundedKinds: { "qwen3-vl-8b": ["reasoning-failure", "unsupported-data"], "qwen3-vl-30b-a3b": [] },
  });

  /* G — grounded-pass: the video frame progression with the measurement. */

  specs.push({
    scenarioId: "video-crack-progression-grounded",
    matrixCell: "grounded-pass",
    question:
      "How does the crack width on level-2 column C2 develop across the video frames, and what is the maximum observed width?",
    authorizedContext: CONTEXT_LEVEL2_COLUMN,
    evidence: [columnCrackVideoFixture()],
    requiredEvidenceIds: ["VID-COL-1"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: FIELD_VALUE_CHECK,
        field: "crack-width:column-C2",
        aggregation: "max",
        subjectHint: "crack width",
        factTemplate: "the maximum observed crack width across the video frames is {value} mm",
      },
    ],
    oracle: {
      claim:
        "The crack in level-2 column C2 widens from 0.4 mm to 1.1 mm across the four frames of video VID-COL-1; " +
        "the maximum observed width is 1.1 mm.",
      status: "supported",
      assumptions: [GOVERNING_VIDEO],
    },
    scripts: both(
      replay("well-grounded", {
        evidenceIds: ["VID-COL-1"],
        facts: [
          "video VID-COL-1 shows the crack in level-2 column C2 widening across four frames",
          "the crack width in the final frame VID-F4 is 1.1 mm",
          "the maximum observed crack width across the video frames is 1.1 mm",
        ],
        assumptions: [GOVERNING_VIDEO],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, FIELD_VALUE_CHECK],
        resultClaim:
          "The crack in level-2 column C2 widens from 0.4 mm to 1.1 mm across the four frames of video VID-COL-1; " +
          "the maximum observed width is 1.1 mm.",
        resultStatus: "supported",
        invalidationConditions: ["a new revision of video VID-COL-1 with different frame observations"],
        nextRecommendedAction:
          "open video VID-COL-1 in the evidence viewer and compare the crack width against the repair threshold",
        proposedOperation: null,
      }),
    ),
    expectedFailureKinds: both("none"),
    expectedViolationRules: both([]),
    expectedGroundedKinds: both([]),
  });

  /* H — the hallucination catch over the measured video world. */

  specs.push({
    scenarioId: "video-crack-width-hallucination",
    matrixCell: "grounded-pass",
    question:
      "How does the crack width on level-2 column C2 develop across the video frames, and what is the maximum observed width?",
    authorizedContext: CONTEXT_LEVEL2_COLUMN,
    evidence: [columnCrackVideoFixture()],
    requiredEvidenceIds: ["VID-COL-1"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: FIELD_VALUE_CHECK,
        field: "crack-width:column-C2",
        aggregation: "max",
        subjectHint: "crack width",
        factTemplate: "the maximum observed crack width across the video frames is {value} mm",
      },
    ],
    oracle: {
      claim:
        "The crack in level-2 column C2 widens from 0.4 mm to 1.1 mm across the four frames of video VID-COL-1; " +
        "the maximum observed width is 1.1 mm.",
      status: "supported",
      assumptions: [GOVERNING_VIDEO],
    },
    scripts: {
      "qwen3-vl-8b": replay("hallucinating", {
        evidenceIds: ["VID-COL-1"],
        facts: ["the crack width in the final frame VID-F4 is 1.4 mm"],
        assumptions: [GOVERNING_VIDEO],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, FIELD_VALUE_CHECK],
        resultClaim:
          "The crack width on level-2 column C2 reaches 1.4 mm at the final frame of video VID-COL-1.",
        resultStatus: "supported",
        invalidationConditions: ["a revised frame observation that contradicts the stated width"],
        nextRecommendedAction: null,
        proposedOperation: null,
      }),
      "qwen3-vl-30b-a3b": replay("well-grounded", {
        evidenceIds: ["VID-COL-1"],
        facts: [
          "video VID-COL-1 shows the crack in level-2 column C2 widening across four frames",
          "the crack width in the final frame VID-F4 is 1.1 mm",
          "the maximum observed crack width across the video frames is 1.1 mm",
        ],
        assumptions: [GOVERNING_VIDEO],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, FIELD_VALUE_CHECK],
        resultClaim:
          "The crack in level-2 column C2 widens from 0.4 mm to 1.1 mm across the four frames of video VID-COL-1; " +
          "the maximum observed width is 1.1 mm.",
        resultStatus: "supported",
        invalidationConditions: ["a new revision of video VID-COL-1 with different frame observations"],
        nextRecommendedAction:
          "open video VID-COL-1 in the evidence viewer and compare the crack width against the repair threshold",
        proposedOperation: null,
      }),
    },
    expectedFailureKinds: { "qwen3-vl-8b": "perception-failure", "qwen3-vl-30b-a3b": "none" },
    expectedViolationRules: { "qwen3-vl-8b": ["facts-grounded-in-cited-evidence"], "qwen3-vl-30b-a3b": [] },
    expectedGroundedKinds: { "qwen3-vl-8b": ["reasoning-failure", "unsupported-data"], "qwen3-vl-30b-a3b": [] },
  });

  /* I — conflicting-evidence: the surfaced drawing/stencil conflict. */

  const conflictOracleClaim =
    "The authorized evidence conflicts on the section size of level-2 spandrel beam S-12: structural drawing " +
    "DRAW-BEAM-1 (r2) specifies W12x26 while the stenciled site marking STENCIL-OCR-1 (r1) reads W14x22 — " +
    "the conflict must be resolved before the value is used.";
  const conflictSurfacedScript = replay("well-grounded", {
    evidenceIds: ["DRAW-BEAM-1", "STENCIL-OCR-1"],
    facts: [
      "structural drawing DRAW-BEAM-1 (sheet S-201 REV-B) specifies the section of level-2 spandrel beam S-12 as W12x26",
      "the stenciled marking on level-2 spandrel beam S-12 read by OCR region STC-R1 states section W14x22",
    ],
    assumptions: [],
    unknowns: ["which of the two authorized values for the section of level-2 spandrel beam S-12 governs is unresolved"],
    deterministicChecks: [FACT_DERIVABILITY_CHECK, CONFLICT_CHECK],
    resultClaim: conflictOracleClaim,
    resultStatus: "conflicted",
    invalidationConditions: [
      "a revision of DRAW-BEAM-1 or STENCIL-OCR-1 that resolves the section-size disagreement",
    ],
    nextRecommendedAction:
      "raise an engineering query to resolve the governing section size of beam S-12 before using it",
    proposedOperation: null,
  });
  specs.push({
    scenarioId: "beam-section-conflict-surfaced",
    matrixCell: "conflicting-evidence",
    question: "What is the section size of level-2 spandrel beam S-12?",
    authorizedContext: CONTEXT_BEAM_S12,
    evidence: [beamDrawingFixture(), beamStencilFixture()],
    requiredEvidenceIds: ["DRAW-BEAM-1", "STENCIL-OCR-1"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: CONFLICT_CHECK,
        field: "section-size:beam-S-12",
        subjectHint: "section of level-2 spandrel beam S-12",
      },
    ],
    oracle: { claim: conflictOracleClaim, status: "conflicted", assumptions: [] },
    scripts: both(conflictSurfacedScript),
    expectedFailureKinds: both("none"),
    expectedViolationRules: both([]),
    expectedGroundedKinds: both([]),
  });

  /* J — conflicting-evidence negative: the 8B silent resolution (caught). */

  specs.push({
    scenarioId: "beam-section-conflict-silent-resolution",
    matrixCell: "conflicting-evidence",
    question: "What is the section size of level-2 spandrel beam S-12?",
    authorizedContext: CONTEXT_BEAM_S12,
    evidence: [beamDrawingFixture(), beamStencilFixture()],
    requiredEvidenceIds: ["DRAW-BEAM-1", "STENCIL-OCR-1"],
    scope: "in-scope",
    checkPlan: [
      { check: FACT_DERIVABILITY_CHECK },
      {
        check: CONFLICT_CHECK,
        field: "section-size:beam-S-12",
        subjectHint: "section of level-2 spandrel beam S-12",
      },
    ],
    oracle: { claim: conflictOracleClaim, status: "conflicted", assumptions: [] },
    scripts: {
      "qwen3-vl-8b": replay("hallucinating", {
        evidenceIds: ["DRAW-BEAM-1"],
        facts: [
          "structural drawing DRAW-BEAM-1 (sheet S-201 REV-B) specifies the section of level-2 spandrel beam S-12 as W12x26",
        ],
        assumptions: [],
        unknowns: [],
        deterministicChecks: [FACT_DERIVABILITY_CHECK, CONFLICT_CHECK],
        resultClaim:
          "The section size of level-2 spandrel beam S-12 is W12x26 per structural drawing DRAW-BEAM-1.",
        resultStatus: "supported",
        invalidationConditions: [
          "a revision of structural drawing DRAW-BEAM-1 that changes the section of beam S-12",
        ],
        nextRecommendedAction: null,
        proposedOperation: null,
      }),
      "qwen3-vl-30b-a3b": conflictSurfacedScript,
    },
    expectedFailureKinds: { "qwen3-vl-8b": "retrieval-failure", "qwen3-vl-30b-a3b": "none" },
    expectedViolationRules: { "qwen3-vl-8b": [], "qwen3-vl-30b-a3b": [] },
    expectedGroundedKinds: { "qwen3-vl-8b": ["retrieval-failure"], "qwen3-vl-30b-a3b": [] },
  });

  /* K — unsupported-question: the audio-transcription capability gap. */

  specs.push({
    scenarioId: "unsupported-audio-transcription",
    matrixCell: "unsupported-question",
    question: "Transcribe the spoken safety instructions from the site briefing audio recording.",
    authorizedContext: CONTEXT_NORTH_ELEVATION,
    evidence: [northElevationFixture(), interiorCorridorFixture()],
    requiredEvidenceIds: [],
    scope: "out-of-scope",
    checkPlan: [{ check: FACT_DERIVABILITY_CHECK }],
    oracle: { claim: null, status: "unsupported", assumptions: [] },
    scripts: both(refuse()),
    expectedFailureKinds: both("unsupported-data"),
    expectedViolationRules: both([]),
    expectedGroundedKinds: both([]),
  });

  /* L — unsupported-question: the engineering-verification authority gap. */

  specs.push({
    scenarioId: "unsupported-code-verification",
    matrixCell: "unsupported-question",
    question:
      "Does the steel lintel beam above door DOOR-N on the north elevation satisfy the EC3 bending utilization " +
      "limit for the documented loads?",
    authorizedContext: CONTEXT_NORTH_ELEVATION,
    evidence: [northElevationFixture(), interiorCorridorFixture()],
    requiredEvidenceIds: [],
    scope: "out-of-scope",
    checkPlan: [{ check: FACT_DERIVABILITY_CHECK }],
    oracle: { claim: null, status: "unsupported", assumptions: [] },
    scripts: both(refuse()),
    expectedFailureKinds: both("unsupported-data"),
    expectedViolationRules: both([]),
    expectedGroundedKinds: both([]),
  });

  return specs;
}

/** The committed base corpus (12 scenarios — deterministic construction). */
export const VLM_EVAL_CORPUS: readonly VlmCorpusScenarioSpec[] = buildCorpusSpecs();

/** A fresh deterministic construction of the base corpus (byte-identical to the constant). */
export function vlmEvalCorpus(): readonly VlmCorpusScenarioSpec[] {
  return buildCorpusSpecs();
}

/* ------------------------------------------------------------------ */
/* Materialization: base scenario × variant → the run unit              */
/* ------------------------------------------------------------------ */

/** ONE benchmark run unit: a base corpus scenario materialized for one variant. */
export interface VlmEvalScenario {
  /** The composed run id: `<baseScenarioId>@<variant>`. */
  readonly scenarioId: string;
  readonly baseScenarioId: string;
  readonly variant: VlmVariantKey;
  readonly matrixCell: VlmBehaviorMatrixCell;
  readonly behaviorClass: VlmDoubleBehaviorClass;
  /** The canonical Layer-2 bundle projection (the question side the provider receives). */
  readonly bundle: EvidenceQuestionBundle;
  /** The structured corpus fixtures (the deterministic recomputation side — never sent to the provider). */
  readonly fixtures: readonly VlmEvidenceFixture[];
  readonly checkPlan: readonly VlmDeterministicCheckPlan[];
  /** The expected grounded-check observation kinds (my golden's deterministic-check assertion). */
  readonly expectedGroundedKinds: readonly string[];
  /** The Layer-2 scenario (input + expected outcome + criteria), consumed by evaluateScenario. */
  readonly scenario: ReasoningEvalScenario;
}

function integrityRulesOf(rules: readonly string[]): readonly EnvelopeIntegrityRule[] {
  return rules.map((rule) => {
    if (!(ENVELOPE_INTEGRITY_RULES as readonly string[]).includes(rule)) {
      throw new VlmEvalError(
        "invalid_corpus",
        `expected violation rule '${rule}' is not in the Layer-2 integrity-rule vocabulary`,
      );
    }
    return rule as EnvelopeIntegrityRule;
  });
}

/** Materializes one base scenario for one variant (deterministic). */
export function buildVlmEvalScenario(
  spec: VlmCorpusScenarioSpec,
  variant: VlmVariantKey,
): VlmEvalScenario {
  const identity = qwen3VlVariantIdentity(variant);
  const profile = qwen3VlProfileForVariant(variant);
  const script = spec.scripts[variant];
  const composedId = `${spec.scenarioId}@${variant}`;
  const offeredChecks = [...new Set(spec.checkPlan.map((plan) => plan.check))];
  const bundle = toLayer2Bundle({
    scenarioId: composedId,
    question: spec.question,
    authorizedContext: spec.authorizedContext,
    evidence: spec.evidence,
    requiredEvidenceIds: spec.requiredEvidenceIds,
    scope: spec.scope,
    offeredChecks,
  });

  let prediction: {
    readonly status: DeclaredEvidenceEnvelope["resultStatus"];
    readonly claim: string | null;
    readonly facts: readonly string[];
    readonly assumptions: readonly string[];
    readonly unknowns: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly checks: readonly string[];
    readonly invalidation: readonly string[];
  };
  let variantScript: string | undefined;
  if (script.layer2Behavior === "replay") {
    const envelope = script.envelope;
    if (envelope === undefined) {
      throw new VlmEvalError(
        "invalid_script",
        `scenario '${spec.scenarioId}' (${variant}): the replay behavior requires the scripted envelope`,
      );
    }
    prediction = {
      status: envelope.resultStatus,
      claim: envelope.resultClaim,
      facts: envelope.facts,
      assumptions: envelope.assumptions,
      unknowns: envelope.unknowns,
      evidenceIds: envelope.evidenceIds,
      checks: envelope.deterministicChecks,
      invalidation: envelope.invalidationConditions,
    };
    variantScript = canonicalJsonText({
      ...envelope,
      agentIdentity: {
        providerId: identity.providerId,
        technologyVersion: identity.technologyVersion,
        capability: identity.capability,
      },
    });
  } else {
    // The explicit refusal: the provider-failure path (the degenerate
    // honest-refusal envelope), with the double's bundle-derived wording.
    prediction = {
      status: "unsupported",
      claim: null,
      facts: [],
      assumptions: [],
      unknowns: [qwen3VlRefusalDetail(bundle, profile)],
      evidenceIds: [],
      checks: [],
      invalidation: [],
    };
  }

  const expected: ExpectedEnvelopeOutcome = {
    resultStatus: prediction.status,
    resultClaim: prediction.claim,
    facts: prediction.facts,
    assumptions: prediction.assumptions,
    unknowns: prediction.unknowns,
    evidenceIds: prediction.evidenceIds,
    deterministicChecks: prediction.checks,
    invalidationConditions: prediction.invalidation,
    correctResultStatus: spec.oracle.status,
    correctResultClaim: spec.oracle.claim,
    correctAssumptions: spec.oracle.assumptions,
    expectedFailureKind: spec.expectedFailureKinds[variant],
    expectedViolationRules: integrityRulesOf(spec.expectedViolationRules[variant]),
  };

  return {
    scenarioId: composedId,
    baseScenarioId: spec.scenarioId,
    variant,
    matrixCell: spec.matrixCell,
    behaviorClass: script.behaviorClass,
    bundle,
    fixtures: spec.evidence,
    checkPlan: spec.checkPlan,
    expectedGroundedKinds: spec.expectedGroundedKinds[variant],
    scenario: {
      scenarioId: composedId,
      lane: VLM_EVAL_LANE,
      providerRef: {
        providerId: identity.providerId,
        technologyVersion: identity.technologyVersion,
      },
      capability: VLM_EVAL_CAPABILITY,
      input: {
        kind: "provider-input",
        capability: VLM_EVAL_CAPABILITY,
        payload: {
          bundleJson: canonicalJsonText(bundle),
          behaviorTag: script.layer2Behavior,
          ...(variantScript === undefined ? {} : { variantScript }),
        },
      },
      expected,
      criteria: FULL_EVALUATION_CRITERIA,
    },
  };
}

/** Materializes the full run corpus: every base scenario × both variants (24 runs, deterministic order). */
export function buildVlmEvalRuns(): readonly VlmEvalScenario[] {
  return vlmEvalCorpus().flatMap((spec) =>
    QWEN3_VL_VARIANTS.map((variant) => buildVlmEvalScenario(spec, variant)),
  );
}

/** The committed run corpus (24 runs — deterministic construction). */
export const VLM_EVAL_RUNS: readonly VlmEvalScenario[] = buildVlmEvalRuns();

/** A fresh deterministic construction of the run corpus (byte-identical to the constant). */
export function vlmEvalRuns(): readonly VlmEvalScenario[] {
  return buildVlmEvalRuns();
}

/** The runs of one variant (corpus order). */
export function vlmEvalRunsForVariant(variant: VlmVariantKey): readonly VlmEvalScenario[] {
  return buildVlmEvalRuns().filter((scenario) => scenario.variant === variant);
}
