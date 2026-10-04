/**
 * WORLD-P3 — the AUTHORING family's committed fixture corpus.
 *
 * The wall-upgrade authoring world, mirroring the DEMO world of the
 * solution-contract/engine/BOQ fixture lineage (solution-demo-001, the
 * node-wall-002 / geo-wall-* reality anchors, the excavation + wall
 * repair + plaster operation set). The semantics are deliberately
 * IDENTICAL to the committed contract fixture intents so the
 * equivalence tests can prove: a direct-manipulation stream and an NL
 * utterance authored through THIS lane derive the SAME operation
 * identity as the committed contract fixtures (the strongest
 * cross-package DM↔NL equivalence proof).
 *
 * PURE DATA — no I/O, no clock, no randomness.
 */

import { REFERENCE_BUILDING_DOMAIN } from "@aise/solution-contract";
import {
  translation,
  type ComposedScene,
  type SceneNode,
} from "@aise/world-reality-substrate";
import type { LaneOperator } from "../seam";
import type {
  AuthoringScope,
  DirectManipulationStream,
  ScopedElementDescriptor,
  ScopedOperationType,
} from "./contract";
import type { ManipulationGesture } from "./contract";

/* ------------------------------------------------------------------ */
/* The world scene (the ground-floor wall-repair world)                 */
/* ------------------------------------------------------------------ */

const SITE_TERRAIN: SceneNode = {
  elementId: "node-site-001",
  kind: "terrain",
  parentId: null,
  transform: translation(0, 0, 0),
  geometry: null,
  material: null,
  layerIds: ["reality"],
  isGhost: false,
  evidenceContentIds: ["evidence-site-survey-0001"],
  label: "Site terrain (south yard)",
};

const DAMAGED_WALL: SceneNode = {
  elementId: "node-wall-002",
  kind: "plan_model",
  parentId: null,
  transform: translation(0, 0, 0),
  geometry: { assetId: "asset-wall-002", partId: "mesh:0", format: "gltf-json" },
  material: null,
  layerIds: ["reality"],
  isGhost: false,
  evidenceContentIds: ["evidence-wall-photo-0007"],
  label: "Ground-floor wall (damaged section)",
};

const GROUND_SLAB: SceneNode = {
  elementId: "node-slab-006",
  kind: "plan_model",
  parentId: null,
  transform: translation(0, 0, 0),
  geometry: { assetId: "asset-slab-006", partId: "mesh:0", format: "gltf-json" },
  material: null,
  layerIds: ["reality"],
  isGhost: false,
  evidenceContentIds: [],
  label: "Ground-floor slab",
};

const OVERHEAD_BEAM: SceneNode = {
  elementId: "node-beam-007",
  kind: "element",
  parentId: null,
  transform: translation(2, 3, 0),
  geometry: { assetId: "asset-beam-007", partId: "mesh:0", format: "gltf-json" },
  material: null,
  layerIds: ["reality"],
  isGhost: false,
  evidenceContentIds: [],
  label: "Overhead beam (clash-relevant)",
};

/** The composed authoring world (revision 3 — the P2 world at rest). */
export const FIXTURE_AUTHORING_WORLD: ComposedScene = {
  revision: 3,
  nodes: [SITE_TERRAIN, DAMAGED_WALL, GROUND_SLAB, OVERHEAD_BEAM],
  layers: [
    { layerId: "reality", name: "Captured reality", visibleByDefault: true },
    { layerId: "solution", name: "Solution proposal", visibleByDefault: true },
  ],
  siteFrame: {
    origin: [0, 0, 0],
    northHeading: 0,
    units: "metre",
  },
  ghostSummary: null,
};

/* ------------------------------------------------------------------ */
/* The scoped element descriptors (the declared target anchors)         */
/* ------------------------------------------------------------------ */

export const FIXTURE_ELEMENT_DESCRIPTORS: readonly ScopedElementDescriptor[] = [
  {
    elementId: "node-site-001",
    selectionModes: [
      {
        selectorKind: "volume",
        geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
        units: { linear: "m", angular: "rad" },
        description: "The pit excavation area south of the building footprint",
      },
    ],
  },
  {
    elementId: "node-wall-002",
    selectionModes: [
      {
        selectorKind: "face-set",
        geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
        units: { linear: "m", angular: "rad" },
        description: "The affected ground-floor wall faces",
      },
      {
        selectorKind: "line-extent",
        geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
        units: { linear: "m", angular: "rad" },
        description: "The wall line along the damaged section",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* The operation palette (the declared catalogue slice + defaults)      */
/* ------------------------------------------------------------------ */

export const FIXTURE_OPERATION_PALETTE: readonly ScopedOperationType[] = [
  {
    operationType: "excavation",
    targetSelectorKind: "volume",
    defaultParameters: [
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ],
  },
  {
    operationType: "demolition-removal",
    targetSelectorKind: "face-set",
    defaultParameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 2.4, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
    ],
  },
  {
    operationType: "block-wall-placement",
    targetSelectorKind: "line-extent",
    defaultParameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ],
  },
  {
    operationType: "plaster-application",
    targetSelectorKind: "face-set",
    defaultParameters: [
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* The authoring scope                                                 */
/* ------------------------------------------------------------------ */

export const FIXTURE_AUTHORING_SCOPE: AuthoringScope = {
  solutionId: "solution-demo-001",
  versionNumber: 1,
  worldScene: FIXTURE_AUTHORING_WORLD,
  elementDescriptors: FIXTURE_ELEMENT_DESCRIPTORS,
  operationPalette: FIXTURE_OPERATION_PALETTE,
  domain: REFERENCE_BUILDING_DOMAIN,
};

/* ------------------------------------------------------------------ */
/* Operators + declared instants                                       */
/* ------------------------------------------------------------------ */

export const FIXTURE_OPERATOR_ENGINEER: LaneOperator = {
  operatorId: "user-demo-engineer",
  role: "engineer",
};

export const FIXTURE_OPERATOR_AGENT: LaneOperator = {
  operatorId: "agent-demo-assistant",
  role: "bounded_agent",
};

export const FIXTURE_DM_AUTHORED_AT = "2026-09-16T09:00:00.000Z";
export const FIXTURE_NL_AUTHORED_AT = "2026-09-16T09:05:00.000Z";

/* ------------------------------------------------------------------ */
/* The NL utterance corpus (the committed shapes the grammar matches)   */
/* ------------------------------------------------------------------ */

/** The canonical DM↔NL equivalence pair (the contract's own pair). */
export const FIXTURE_UTTERANCE_EXCAVATION =
  "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.";

export const FIXTURE_UTTERANCE_BLOCK_WALL =
  "Lay blocks to a height of 1 m along this wall.";

export const FIXTURE_UTTERANCE_DEMOLITION =
  "Remove the damaged wall section.";

export const FIXTURE_UTTERANCE_PLASTER =
  "Apply 30 mm plaster to the affected wall faces.";

/** The selection contexts the utterances resolve against. */
export const FIXTURE_SELECTION_SITE = "node-site-001";
export const FIXTURE_SELECTION_WALL = "node-wall-002";

/* ------------------------------------------------------------------ */
/* The direct-manipulation stream corpus                                */
/* ------------------------------------------------------------------ */

const EXCAVATION_DM_GESTURES: readonly ManipulationGesture[] = [
  { gesture: "pick-element", elementId: "node-site-001" },
  { gesture: "begin-grab", elementId: "node-site-001" },
  {
    gesture: "edit-parameter",
    parameter: { name: "depth", value: 1.5, unit: "m" },
  },
  { gesture: "commit", commandKind: "add", operationType: "excavation" },
];

/** The DM stream that authors the SAME excavation command as the utterance. */
export const FIXTURE_DM_STREAM_EXCAVATION: DirectManipulationStream = {
  streamId: "dm-stream-demo-0001",
  operator: FIXTURE_OPERATOR_ENGINEER,
  sceneRevision: FIXTURE_AUTHORING_WORLD.revision,
  gestures: EXCAVATION_DM_GESTURES,
  authoredAt: FIXTURE_DM_AUTHORED_AT,
};

const BLOCK_WALL_DM_GESTURES: readonly ManipulationGesture[] = [
  { gesture: "pick-element", elementId: "node-wall-002" },
  {
    gesture: "edit-parameter",
    parameter: { name: "height", value: 1, unit: "m" },
  },
  { gesture: "commit", commandKind: "add", operationType: "block-wall-placement" },
];

/** The DM stream that authors the SAME block-wall command as the utterance. */
export const FIXTURE_DM_STREAM_BLOCK_WALL: DirectManipulationStream = {
  streamId: "dm-stream-demo-0002",
  operator: FIXTURE_OPERATOR_ENGINEER,
  sceneRevision: FIXTURE_AUTHORING_WORLD.revision,
  gestures: BLOCK_WALL_DM_GESTURES,
  authoredAt: "2026-09-16T09:10:00.000Z",
};

/** The DM stream that authors a MOVE of the overhead beam (for the move law drills). */
export const FIXTURE_DM_STREAM_MOVE_BEAM: DirectManipulationStream = {
  streamId: "dm-stream-demo-0003",
  operator: FIXTURE_OPERATOR_ENGINEER,
  sceneRevision: FIXTURE_AUTHORING_WORLD.revision,
  gestures: [
    { gesture: "pick-element", elementId: "node-beam-007" },
    { gesture: "begin-grab", elementId: "node-beam-007" },
    { gesture: "drag-by", deltaMetres: [0.5, 0, 0] },
    { gesture: "drop-at", deltaMetres: [0.5, 0, 0] },
    { gesture: "commit", commandKind: "move", operationType: "building-service-installation" },
  ],
  authoredAt: "2026-09-16T09:20:00.000Z",
};

/** A DM stream that fails the ONE-command-per-stream law (re-pick). */
export const FIXTURE_DM_STREAM_REPICK: DirectManipulationStream = {
  streamId: "dm-stream-demo-0004",
  operator: FIXTURE_OPERATOR_ENGINEER,
  sceneRevision: FIXTURE_AUTHORING_WORLD.revision,
  gestures: [
    { gesture: "pick-element", elementId: "node-wall-002" },
    { gesture: "pick-element", elementId: "node-beam-007" },
    { gesture: "commit", commandKind: "add", operationType: "block-wall-placement" },
  ],
  authoredAt: "2026-09-16T09:25:00.000Z",
};

/** A DM stream recorded against a STALE world revision. */
export const FIXTURE_DM_STREAM_STALE_REVISION: DirectManipulationStream = {
  streamId: "dm-stream-demo-0005",
  operator: FIXTURE_OPERATOR_ENGINEER,
  sceneRevision: FIXTURE_AUTHORING_WORLD.revision - 1,
  gestures: [
    { gesture: "pick-element", elementId: "node-wall-002" },
    { gesture: "commit", commandKind: "add", operationType: "block-wall-placement" },
  ],
  authoredAt: "2026-09-16T09:30:00.000Z",
};

/** The ghost presentation asset (the valid minimal glTF asset). */
export const FIXTURE_GHOST_GLTF_JSON = JSON.stringify({
  asset: { version: "2.0", generator: "AISE WORLD-P3 fixture" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "ghost-part" }],
  meshes: [{ primitives: [{ mode: 4, attributes: { POSITION: 0 } }] }],
  accessors: [{ componentType: 5126, count: 3, type: "VEC3", bufferView: 0 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  buffers: [{ byteLength: 36 }],
});

export const FIXTURE_GHOST_GLTF_BYTES = new TextEncoder().encode(
  FIXTURE_GHOST_GLTF_JSON,
);
