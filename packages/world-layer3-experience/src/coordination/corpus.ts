/**
 * WORLD-P3 — the COORDINATION family's committed fixture corpus.
 *
 * The coordinated wall-repair world: the REALITY model (the authoring
 * world's captured elements), the BIM model (the plan discipline's
 * elements — deliberately id-quarantined against the reality ids), and
 * the SOLUTION model (the ghost proposal from the authoring stage).
 * The clash fixtures cover the three verdict classes: the proposed
 * block-wall ghost vs the overhead beam (CLASH), a near-boundary pair
 * (WITHIN-TOLERANCE) and a separated pair (CLEAR).
 *
 * PURE DATA — no I/O, no clock, no randomness.
 */

import { CONTRACT_VERSION } from "@aise/shared-contracts";
import type { EngineeringProblem, LaneActor } from "@aise/world-layer2-experience";
import { translation, type ComposedScene, type SceneNode } from "@aise/world-reality-substrate";
import type { LaneOperator } from "../seam";
import type { ClashPair, ClashTestRequest, CoordinationModelSource } from "./contract";

/* ------------------------------------------------------------------ */
/* The three discipline models                                          */
/* ------------------------------------------------------------------ */

function realityNode(
  elementId: string,
  kind: SceneNode["kind"],
  transform: ReturnType<typeof translation>,
  label: string,
  evidence: readonly string[],
): SceneNode {
  return {
    elementId,
    kind,
    parentId: null,
    transform,
    geometry: null,
    material: null,
    layerIds: ["reality"],
    isGhost: false,
    evidenceContentIds: [...evidence],
    label,
  };
}

/** The REALITY model (the captured site — mirrors the authoring world). */
export const FIXTURE_REALITY_MODEL: CoordinationModelSource = {
  modelId: "model-reality-capture-001",
  placementMetres: [0, 0, 0],
  scene: {
    revision: 3,
    nodes: [
      realityNode("node-site-001", "terrain", translation(0, 0, 0), "Site terrain", ["evidence-site-survey-0001"]),
      realityNode("node-wall-002", "plan_model", translation(0, 0, 0), "Ground-floor wall (damaged)", ["evidence-wall-photo-0007"]),
      realityNode("node-slab-006", "plan_model", translation(0, 0, 0), "Ground-floor slab", []),
      realityNode("node-beam-007", "element", translation(2, 3, 0), "Overhead beam", []),
    ],
    layers: [
      { layerId: "reality", name: "Captured reality", visibleByDefault: true },
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  },
};

function bimNode(elementId: string, label: string): SceneNode {
  return {
    elementId,
    kind: "plan_model",
    parentId: null,
    transform: translation(0, 0, 0),
    geometry: { assetId: `asset-${elementId}`, partId: "mesh:0", format: "gltf-json" },
    material: null,
    layerIds: ["bim"],
    isGhost: false,
    evidenceContentIds: [],
    label,
  };
}

/** The BIM model (the plan discipline — id-quarantined against reality). */
export const FIXTURE_BIM_MODEL: CoordinationModelSource = {
  modelId: "model-bim-discipline-002",
  placementMetres: [0, 0, 0],
  scene: {
    revision: 7,
    nodes: [
      bimNode("bim-wall-W1", "Design wall W1 (level 0)"),
      bimNode("bim-door-D3", "Design door D3 (level 0)"),
    ],
    layers: [
      { layerId: "bim", name: "BIM design model", visibleByDefault: true },
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  },
};

/**
 * The SOLUTION model (the ghost proposal from the authoring stage —
 * every node a GHOST, the ghost-distinctness law carried into the
 * coordinated world).
 */
export const FIXTURE_SOLUTION_MODEL: CoordinationModelSource = {
  modelId: "model-solution-proposal-003",
  placementMetres: [0, 0, 0],
  scene: {
    revision: 1,
    nodes: [
      {
        elementId: "ghost-add-block-wall-0001",
        kind: "ghost",
        parentId: null,
        transform: translation(0, 0, 0),
        geometry: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
        material: null,
        layerIds: ["solution"],
        isGhost: true,
        evidenceContentIds: [],
        label: "Proposed block wall (ghost)",
      },
    ],
    layers: [
      { layerId: "solution", name: "Solution proposal", visibleByDefault: true },
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: {
      operationId: "72ec9c913958934c4c10e4b2c1452676ca39f0c8ced106f328174dd0f024b699",
      proposedElementIds: ["ghost-add-block-wall-0001"],
      removedElementIds: [],
    },
  },
};

/** The coordination aggregation request (all three models). */
export function fixtureCoordinationRequest(): {
  readonly models: readonly CoordinationModelSource[];
  readonly siteFrame: ComposedScene["siteFrame"];
  readonly layers: readonly ComposedScene["layers"][number][];
} {
  return {
    models: [FIXTURE_REALITY_MODEL, FIXTURE_BIM_MODEL, FIXTURE_SOLUTION_MODEL],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    layers: [
      { layerId: "reality", name: "Captured reality", visibleByDefault: true },
      { layerId: "bim", name: "BIM design model", visibleByDefault: true },
      { layerId: "solution", name: "Solution proposal", visibleByDefault: true },
    ],
  };
}

/**
 * The ID-COLLISION sabotage model: a BIM model whose wall re-uses the
 * REALITY model's element id (the cross-model identity-quarantine
 * drill).
 */
export const FIXTURE_COLLIDING_MODEL: CoordinationModelSource = {
  modelId: "model-bim-colliding-999",
  placementMetres: [0, 0, 0],
  scene: {
    revision: 1,
    nodes: [
      bimNode("node-wall-002", "Design wall colliding with the reality id"),
    ],
    layers: [
      { layerId: "bim", name: "BIM design model", visibleByDefault: true },
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  },
};

/* ------------------------------------------------------------------ */
/* The clash fixtures (the three verdict classes)                       */
/* ------------------------------------------------------------------ */

/** The declared tolerance of the coordination world (50 mm — declared). */
export const FIXTURE_CLASH_TOLERANCE = { linear: 0.05, angular: 0.001 } as const;

export const FIXTURE_CLASH_UNITS = { linear: "m", angular: "rad" } as const;

export const FIXTURE_CLASH_DECLARED_AT = "2026-10-05T09:00:00.000Z";

/** Pair 1: the proposed ghost wall vs the overhead beam — deep CLASH.
 *  The wall (x 0..5, thickness y 0..0.1, height z 0..3) is crossed at
 *  its top by the beam (x 1.5..2.5, y -0.5..0.6, z 2.8..3.2): the
 *  minimum separation translation is 0.1 m (the y overlap) → a clash
 *  well beyond the 0.05 m tolerance. */
export const FIXTURE_CLASH_PAIR_WALL_BEAM: ClashPair = {
  pairId: "clash-pair-001",
  elementA: "ghost-add-block-wall-0001",
  elementB: "node-beam-007",
  shapeA: {
    kind: "box",
    name: null,
    min: { x: 0, y: 0, z: 0 },
    max: { x: 5, y: 0.1, z: 3 },
  },
  shapeB: {
    kind: "box",
    name: null,
    min: { x: 1.5, y: -0.5, z: 2.8 },
    max: { x: 2.5, y: 0.6, z: 3.2 },
  },
};

/** Pair 2: the slab vs the BIM door — separated by 1.0 m (CLEAR). */
export const FIXTURE_CLASH_PAIR_SLAB_DOOR: ClashPair = {
  pairId: "clash-pair-002",
  elementA: "node-slab-006",
  elementB: "bim-door-D3",
  shapeA: {
    kind: "box",
    name: null,
    min: { x: 0, y: 0, z: -0.2 },
    max: { x: 12, y: 12, z: 0 },
  },
  shapeB: {
    kind: "box",
    name: null,
    min: { x: 6, y: 6, z: 1.05 },
    max: { x: 7, y: 7, z: 2.5 },
  },
};

/** Pair 3: the design wall W1 vs the BIM door — 0.02 m gap (WITHIN-TOLERANCE of 0.05). */
export const FIXTURE_CLASH_PAIR_WALL_DOOR: ClashPair = {
  pairId: "clash-pair-003",
  elementA: "bim-wall-W1",
  elementB: "bim-door-D3",
  shapeA: {
    kind: "box",
    name: null,
    min: { x: 0, y: 0, z: 0 },
    max: { x: 5, y: 0.2, z: 3 },
  },
  shapeB: {
    kind: "box",
    name: null,
    min: { x: 5.02, y: 1, z: 0 },
    max: { x: 6.02, y: 2, z: 2.5 },
  },
};

/** The canonical clash request (the three verdict classes). */
export function fixtureClashTestRequest(): ClashTestRequest {
  return {
    pairs: [
      FIXTURE_CLASH_PAIR_WALL_BEAM,
      FIXTURE_CLASH_PAIR_SLAB_DOOR,
      FIXTURE_CLASH_PAIR_WALL_DOOR,
    ],
    tolerance: FIXTURE_CLASH_TOLERANCE,
    units: FIXTURE_CLASH_UNITS,
    declaredAt: FIXTURE_CLASH_DECLARED_AT,
  };
}

/* ------------------------------------------------------------------ */
/* The P2 problem-lane fixtures (the conflict bindings)                 */
/* ------------------------------------------------------------------ */

export const FIXTURE_COORDINATION_OPERATOR: LaneOperator = {
  operatorId: "user-demo-engineer",
  role: "engineer",
};

/** The P2 problem-lane actor (the who of the problem record — P2 shape). */
export const FIXTURE_COORDINATION_ACTOR: LaneActor = {
  actorId: "user-demo-engineer",
  role: "engineer",
};

/**
 * The declared engineering problem of the coordinated world — composed
 * through the P2 problem-lane types (the conflict binding target).
 */
export const FIXTURE_COORDINATION_PROBLEM: EngineeringProblem = {
  kind: "engineering-problem",
  schemaVersion: "engineering-problem/1",
  contractVersion: CONTRACT_VERSION,
  problemId: "problem-demo-coordination-001",
  title: "Proposed block wall conflicts with the overhead beam",
  statement:
    "The solution proposal's block wall intersects the overhead beam's reserved " +
    "clearance in the coordinated model set — the proposal must be revised or the " +
    "beam relocated before acceptance.",
  questionKind: "coordination_conflict",
  status: "open",
  spatialBinding: {
    sceneRevision: 3,
    elementIds: ["node-beam-007", "ghost-add-block-wall-0001"],
    captureEvidenceContentIds: ["evidence-wall-photo-0007"],
  },
  openedBy: FIXTURE_COORDINATION_ACTOR,
  openedAt: "2026-10-05T09:05:00.000Z",
};

/**
 * The second declared problem — the near-boundary wall/door clearance
 * (the within-tolerance conflict's P2 problem-lane binding).
 */
export const FIXTURE_COORDINATION_PROBLEM_2: EngineeringProblem = {
  kind: "engineering-problem",
  schemaVersion: "engineering-problem/1",
  contractVersion: CONTRACT_VERSION,
  problemId: "problem-demo-coordination-002",
  title: "Design wall W1 sits within the coordination tolerance of door D3",
  statement:
    "The BIM design wall W1 and door D3 are separated by 0.02 m — inside the " +
    "declared 0.05 m coordination tolerance. The near-boundary verdict is honest " +
    "evidence: the consumer decides whether the clearance is acceptable.",
  questionKind: "coordination_conflict",
  status: "open",
  spatialBinding: {
    sceneRevision: 3,
    elementIds: ["bim-wall-W1", "bim-door-D3"],
    captureEvidenceContentIds: [],
  },
  openedBy: FIXTURE_COORDINATION_ACTOR,
  openedAt: "2026-10-05T09:06:00.000Z",
};

/** The declared problems of the coordinated world (the binding scope). */
export const FIXTURE_COORDINATION_PROBLEMS: readonly EngineeringProblem[] = [
  FIXTURE_COORDINATION_PROBLEM,
  FIXTURE_COORDINATION_PROBLEM_2,
];
