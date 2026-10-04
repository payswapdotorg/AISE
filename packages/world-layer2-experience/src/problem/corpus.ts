/**
 * WORLD-P2 — the PROBLEM family corpus (`src/problem/`).
 *
 * The committed, deterministic fixtures of the PROBLEM + CONTEXT stages:
 * a composed scene (P0-A scene-composition types), a real IFC extraction
 * produced by the P0-B understanding substrate's OWN in-memory double
 * (the cross-package composition proof — this lane composes BOTH P0
 * packages), the AISE-side records of the fixture world, and the
 * engineering problem itself.
 *
 * THE FIXTURE STORY (the directive's own Layer-2 example, translated into
 * the AISE evidence/case architecture — an AISE problem, NOT a Procore
 * issue): the ground-floor masonry wall of Building A shows a diagonal
 * crack originating at the lintel bearing above Opening-001. The problem
 * is bound into the spatial world; the context view composes the BIM
 * model's INFERRED candidates (the P0-B extraction) with the AISE-side
 * observed records.
 *
 * Every id in this corpus is either a 64-hex content-derived digest or a
 * stable AISE-side scene element id — never a substrate id (the seam's
 * identity law; IFC GUIDs stay namespaced external labels inside the
 * extraction result).
 */

import type { Observation } from "@aise/shared-contracts";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import {
  FULL_INTENTS_REQUEST,
  MINIMAL_IFC4_EVIDENCE_CONTENT_ID,
  referenceIfcDouble,
  type IfcExtractionResult,
  type NamespacedExternalLabel,
} from "@aise/world-understanding-substrate";
import type {
  ComposedScene,
  SceneNode,
} from "@aise/world-reality-substrate";
import { IDENTITY_TRANSFORM, translation } from "@aise/world-reality-substrate";
import { textDigestOf } from "../seam";
import type {
  EngineeringProblem,
  SpatialWorldBinding,
  SubstrateCandidateSet,
} from "./contract";
import { defineEngineeringProblem } from "./contract";

/* ------------------------------------------------------------------ */
/* The fixture world (stable AISE-side identities)                      */
/* ------------------------------------------------------------------ */

/** The declared fixture recording instant (deterministic — no clock reads). */
export const PROBLEM_FIXTURE_RECORDED_AT = "2026-10-02T08:00:00.000Z" as const;

/** Stable AISE scene element ids (content-derived, never substrate ids). */
export const FIXTURE_ELEMENT_SITE_ROOT = textDigestOf(
  "AISE-WORLD-P2-fixture-element-site-root",
);
export const FIXTURE_ELEMENT_WALL = textDigestOf(
  "AISE-WORLD-P2-fixture-element-wall-001",
);
export const FIXTURE_ELEMENT_OPENING = textDigestOf(
  "AISE-WORLD-P2-fixture-element-opening-001",
);
export const FIXTURE_ELEMENT_CAPTURE_CLOUD = textDigestOf(
  "AISE-WORLD-P2-fixture-element-capture-cloud-001",
);

/** The fixture scene layers. */
const STRUCTURE_LAYER_ID = textDigestOf("AISE-WORLD-P2-fixture-layer-structure");
const CAPTURE_LAYER_ID = textDigestOf("AISE-WORLD-P2-fixture-layer-capture");

/** Fixture evidence content ids (declared — the gateway registers them). */
export const FIXTURE_EVIDENCE_CRACK_PHOTO_1 = textDigestOf(
  "AISE-WORLD-P2-fixture-evidence-crack-photo-1",
);
export const FIXTURE_EVIDENCE_CRACK_PHOTO_2 = textDigestOf(
  "AISE-WORLD-P2-fixture-evidence-crack-photo-2",
);
export const FIXTURE_EVIDENCE_DIAL_GAUGE = textDigestOf(
  "AISE-WORLD-P2-fixture-evidence-dial-gauge-reading",
);
export const FIXTURE_EVIDENCE_DRAWING_SHEET = textDigestOf(
  "AISE-WORLD-P2-fixture-evidence-drawing-sheet-a-101",
);

/** The fixture asset/material identity helpers. */
function fixtureAssetId(name: string): string {
  return textDigestOf(`AISE-WORLD-P2-fixture-asset-${name}`);
}

const WALL_MATERIAL = {
  materialId: textDigestOf("AISE-WORLD-P2-fixture-material-masonry"),
  baseColor: [0.72, 0.66, 0.55] as [number, number, number],
  opacity: 1,
  wireframe: false,
  evidenceContentIds: [] as string[],
};

const CAPTURE_MATERIAL = {
  materialId: textDigestOf("AISE-WORLD-P2-fixture-material-pointcloud"),
  baseColor: [0.2, 0.75, 0.9] as [number, number, number],
  opacity: 0.55,
  wireframe: false,
  evidenceContentIds: [FIXTURE_EVIDENCE_CRACK_PHOTO_1, FIXTURE_EVIDENCE_CRACK_PHOTO_2],
};

/**
 * The fixture composed scene (revision 1): site root → wall + opening
 * (structure layer) + the capture cloud that materialized the observed
 * state (capture layer, evidence-bound).
 */
export const FIXTURE_SCENE: ComposedScene = {
  revision: 1,
  nodes: [
    {
      elementId: FIXTURE_ELEMENT_SITE_ROOT,
      kind: "group",
      parentId: null,
      transform: IDENTITY_TRANSFORM,
      geometry: null,
      material: null,
      layerIds: [],
      isGhost: false,
      evidenceContentIds: [],
      label: "Site Alpha / Building A",
    },
    {
      elementId: FIXTURE_ELEMENT_WALL,
      kind: "element",
      parentId: FIXTURE_ELEMENT_SITE_ROOT,
      transform: translation(0, 0, 0),
      geometry: { assetId: fixtureAssetId("wall-001"), partId: "body", format: "ingested-mesh" },
      material: WALL_MATERIAL,
      layerIds: [STRUCTURE_LAYER_ID],
      isGhost: false,
      evidenceContentIds: [],
      label: "Wall-001 (masonry, ground floor)",
    },
    {
      elementId: FIXTURE_ELEMENT_OPENING,
      kind: "element",
      parentId: FIXTURE_ELEMENT_WALL,
      transform: translation(2.4, 0, 0),
      geometry: { assetId: fixtureAssetId("opening-001"), partId: "void", format: "ingested-mesh" },
      material: null,
      layerIds: [STRUCTURE_LAYER_ID],
      isGhost: false,
      evidenceContentIds: [],
      label: "Opening-001 (door opening)",
    },
    {
      elementId: FIXTURE_ELEMENT_CAPTURE_CLOUD,
      kind: "capture_cloud",
      parentId: FIXTURE_ELEMENT_SITE_ROOT,
      transform: translation(0, 0, 0),
      geometry: { assetId: fixtureAssetId("capture-cloud-001"), partId: "cloud", format: "ingested-mesh" },
      material: CAPTURE_MATERIAL,
      layerIds: [CAPTURE_LAYER_ID],
      isGhost: false,
      evidenceContentIds: [FIXTURE_EVIDENCE_CRACK_PHOTO_1, FIXTURE_EVIDENCE_CRACK_PHOTO_2],
      label: "Capture cloud (2026-10-01 field walk)",
    },
  ],
  layers: [
    { layerId: STRUCTURE_LAYER_ID, name: "Structure (BIM-derived)", visibleByDefault: true },
    { layerId: CAPTURE_LAYER_ID, name: "Field capture", visibleByDefault: true },
  ],
  siteFrame: {
    origin: [0, 0, 0],
    northHeading: 0,
    units: "metre",
  },
  ghostSummary: null,
} as const;

/** The scene nodes keyed by element id (fixture convenience). */
export const FIXTURE_SCENE_NODES: readonly SceneNode[] = FIXTURE_SCENE.nodes;

/* ------------------------------------------------------------------ */
/* The substrate candidates (the P0-B composition)                      */
/* ------------------------------------------------------------------ */

/**
 * Collects every namespaced external label one extraction result carries
 * (spatial nodes, elements, property/quantity set relations,
 * relationships, omissions) — the identity-law scan set for the
 * candidate-set validation.
 */
export function labelsOfExtraction(
  extraction: IfcExtractionResult,
): NamespacedExternalLabel[] {
  const labels: NamespacedExternalLabel[] = [];
  for (const node of extraction.spatialNodes) {
    labels.push(node.label);
    if (node.containedBy !== null) {
      labels.push(node.containedBy);
    }
  }
  for (const element of extraction.elements) {
    labels.push(element.label);
    if (element.containedBy !== null) {
      labels.push(element.containedBy);
    }
  }
  for (const set of extraction.propertySets) {
    labels.push(set.relates);
  }
  for (const set of extraction.quantitySets) {
    labels.push(set.relates);
  }
  for (const relationship of extraction.relationships) {
    if (relationship.label !== null) {
      labels.push(relationship.label);
    }
    labels.push(relationship.relating);
    for (const related of relationship.related) {
      labels.push(related);
    }
  }
  for (const omission of extraction.omissions) {
    labels.push(omission.stepRef);
  }
  return labels;
}

/**
 * The fixture substrate-candidate set: the P0-B understanding substrate's
 * REFERENCE IFC double interpreting the committed minimal IFC4 model with
 * full intents. Deterministic: the same request through the same double
 * always yields the same byte-identical extraction, so this corpus value
 * is stable across runs. The alternate IFC double yields the SAME
 * extraction (the P0-B substitution pair) — proven by that package's own
 * tests and re-proven at the lane level in `lane.test.ts`.
 */
export function fixtureIfcExtraction(
  provider: typeof referenceIfcDouble,
): IfcExtractionResult {
  const outcome = provider.interpret(FULL_INTENTS_REQUEST);
  if (!outcome.ok) {
    /* The committed fixture + the committed double always succeed; a
     * failure here is a corpus defect, surfaced as a hard error at
     * fixture-build time. */
    throw new Error(
      `the fixture IFC extraction failed unexpectedly: ${outcome.failure.kind} — ${outcome.failure.detail}`,
    );
  }
  return outcome.value;
}

/** The fixture extraction through the reference IFC double. */
export const FIXTURE_IFC_EXTRACTION = fixtureIfcExtraction(referenceIfcDouble);

/** The substrate candidate set composed from the fixture extraction. */
export const FIXTURE_SUBSTRATE_CANDIDATES: readonly SubstrateCandidateSet[] = [
  {
    family: "ifc",
    resultId: FIXTURE_IFC_EXTRACTION.resultId,
    evidenceContentId: MINIMAL_IFC4_EVIDENCE_CONTENT_ID,
    method: "interpretation.ifc",
    externalLabels: labelsOfExtraction(FIXTURE_IFC_EXTRACTION),
    aise: FIXTURE_IFC_EXTRACTION.aise,
  },
];

/* ------------------------------------------------------------------ */
/* The AISE-side fixture records                                         */
/* ------------------------------------------------------------------ */

/** The accepted Reality-Graph identity of Wall-001 (the AISE authority side). */
export const FIXTURE_WALL_OBJECT_ID = textDigestOf(
  "AISE-WORLD-P2-fixture-reality-object-wall-001",
);

/** The fixture actors (typed who — the ownership translation). */
export const FIXTURE_ACTOR_ENGINEER = {
  actorId: textDigestOf("AISE-WORLD-P2-fixture-actor-engineer-e"),
  role: "engineer",
} as const;

export const FIXTURE_ACTOR_FIELD_ENGINEER = {
  actorId: textDigestOf("AISE-WORLD-P2-fixture-actor-field-engineer-f"),
  role: "field_engineer",
} as const;

export const FIXTURE_ACTOR_REVIEWER = {
  actorId: textDigestOf("AISE-WORLD-P2-fixture-actor-reviewer-r"),
  role: "reviewer",
} as const;

/** The observed facts (evidence-bound, always OBSERVED). */
export const FIXTURE_OBSERVATIONS: readonly Observation[] = [
  {
    contractVersion: CONTRACT_VERSION,
    observationId: textDigestOf("AISE-WORLD-P2-fixture-observation-crack"),
    subjectRef: FIXTURE_WALL_OBJECT_ID,
    statement:
      "Diagonal crack approximately 1.2 m long originates at the lintel bearing above " +
      "Opening-001 and runs down-right at roughly 35 degrees; maximum width approximately 3 mm " +
      "at the bearing.",
    observedAt: PROBLEM_FIXTURE_RECORDED_AT,
    observer: FIXTURE_ACTOR_FIELD_ENGINEER.actorId,
    evidenceContentIds: [FIXTURE_EVIDENCE_CRACK_PHOTO_1],
  },
  {
    contractVersion: CONTRACT_VERSION,
    observationId: textDigestOf("AISE-WORLD-P2-fixture-observation-drawing-context"),
    subjectRef: FIXTURE_WALL_OBJECT_ID,
    statement:
      "Drawing sheet A-101 shows the lintel above Opening-001 as a reinforced-concrete " +
      "element bearing on the masonry wall; the observed crack follows the bearing line.",
    observedAt: PROBLEM_FIXTURE_RECORDED_AT,
    observer: FIXTURE_ACTOR_FIELD_ENGINEER.actorId,
    evidenceContentIds: [FIXTURE_EVIDENCE_DRAWING_SHEET],
  },
];

/* ------------------------------------------------------------------ */
/* The fixture engineering problems                                      */
/* ------------------------------------------------------------------ */

/** The fixture spatial binding (the problem lives in the world). */
export const FIXTURE_PROBLEM_BINDING: SpatialWorldBinding = {
  sceneRevision: FIXTURE_SCENE.revision,
  elementIds: [FIXTURE_ELEMENT_WALL, FIXTURE_ELEMENT_OPENING],
  captureEvidenceContentIds: [FIXTURE_EVIDENCE_CRACK_PHOTO_1, FIXTURE_EVIDENCE_CRACK_PHOTO_2],
};

/** The fixture problem statement (the directive's cracked-lintel story). */
export const FIXTURE_PROBLEM_INPUT = {
  title: "Diagonal crack at lintel bearing above Opening-001",
  statement:
    "The ground-floor masonry wall of Building A shows a diagonal crack originating at the " +
    "lintel bearing above Opening-001. Determine whether the lintel bearing is distressed, " +
    "what the as-built condition is, and which governed intervention applies. The answer must " +
    "be grounded in field evidence and the BIM-derived context, never in an unverified guess.",
  questionKind: "condition_assessment" as const,
  spatialBinding: FIXTURE_PROBLEM_BINDING,
  openedBy: FIXTURE_ACTOR_ENGINEER,
  openedAt: PROBLEM_FIXTURE_RECORDED_AT,
} as const;

/**
 * The sealed fixture problem (PROBLEM-stage output). Deterministic: the
 * same input + scene always seal to the same content-derived problemId.
 */
export const FIXTURE_PROBLEM: EngineeringProblem = (() => {
  const outcome = defineEngineeringProblem(FIXTURE_PROBLEM_INPUT, FIXTURE_SCENE);
  if (!outcome.ok) {
    throw new Error(
      `the fixture problem failed to seal: ${outcome.failure.kind} — ${outcome.failure.detail}`,
    );
  }
  return outcome.value;
})();

/** The fixture problem's content-derived id (stable across runs). */
export const FIXTURE_PROBLEM_ID = FIXTURE_PROBLEM.problemId;

/* ------------------------------------------------------------------ */
/* Negative fixtures (fail-closed drills)                               */
/* ------------------------------------------------------------------ */

/** A problem input whose binding cites an element absent from the scene. */
export const UNRESOLVED_BINDING_PROBLEM_INPUT = {
  ...FIXTURE_PROBLEM_INPUT,
  spatialBinding: {
    sceneRevision: 1,
    elementIds: [textDigestOf("AISE-WORLD-P2-fixture-element-not-in-scene")],
    captureEvidenceContentIds: [],
  },
} as const;

/** A problem input whose binding cites the wrong scene revision. */
export const WRONG_REVISION_PROBLEM_INPUT = {
  ...FIXTURE_PROBLEM_INPUT,
  spatialBinding: {
    ...FIXTURE_PROBLEM_BINDING,
    sceneRevision: 2,
  },
} as const;

/**
 * A scene with a duplicate element id (structurally invalid per the P0-A
 * validator) — the PROBLEM transform must refuse to bind against it.
 */
export const INVALID_SCENE: ComposedScene = {
  ...FIXTURE_SCENE,
  nodes: [
    ...FIXTURE_SCENE.nodes,
    { ...FIXTURE_SCENE.nodes[0]! } as SceneNode,
  ],
};
