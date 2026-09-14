/**
 * AISE-027 deterministic viewer fixtures — TEST SUPPORT ONLY, never
 * imported by the viewer rendering modules (mirrors the workspace/
 * boqlens fixtures + backend testkit conventions).
 *
 * apps/web CANNOT import backend sources (boundary matrix: apps →
 * apps/packages only), so this file HAND-BUILDS a structural fixture that
 * mirrors the AISE-026 testkit's canonical scenario (backend/api/src/
 * intervention/testkit.ts — read as reference): the synthetic office-refit
 * storey (mixed CONFIRMED/OBSERVED/INFERRED baseline content, all
 * flattened to PROPOSED by 026's overlay), the three canonical steps
 * (fire-rating upgrade on wall-north, partition addition, wall-east
 * proposed removal) and the four materialized layers 0..3 those steps
 * produce. The states below are hand-materialized to mirror what AISE-026's
 * deterministic projection emits (nodes nodeId-sorted, every node PROPOSED,
 * origin baseline/baseline_touched/scenario, tombstones for proposed
 * removals); the AUTHORITATIVE materialization stays in the backend.
 *
 * Geometry follows the AISE-020/021 fixture convention (axis-aligned wall
 * rectangles in world metres, honest un-projectable cases: a mesh-ref
 * column, an unresolved railing ref, a geometry-less paint node, a
 * ceiling plane without boundary, a one-point degenerate polygon).
 *
 * All ids/timestamps fixed; no clock, no randomness, no network.
 */

import type { InterventionReader } from "./read";
import type {
  GeometryRecord,
  Vec3,
  ViewerApprovalReference,
  ViewerInput,
  ViewerInterventionState,
  ViewerInterventionStep,
  ViewerProposedNode,
  ViewerProposedProperty,
  ViewerScenario,
  ViewerStateNode,
  ViewerStateRelationship,
} from "./model";

/* ------------------------------------------------------------------ */
/* Fixed constants (mirrors of the AISE-026 testkit seeds)             */
/* ------------------------------------------------------------------ */

export const FIXED_NOW = "2026-02-02T09:00:00.000Z";
export const FIXED_LATER = "2026-02-02T09:30:00.000Z";
export const FIXED_EVEN_LATER = "2026-02-02T10:15:00.000Z";
export const FIXED_APPROVAL = "2026-02-02T11:00:00.000Z";

export const PROJECT_ID = "project-zurich-hq";
export const SCENARIO_ID = "scenario-office-refit";
export const BASELINE_VERSION_ID = "v001";
export const SCENARIO_TITLE = "Office refit — fire upgrade, partition and demolition";

/** Fixed 64-hex state ids (026's sha256 authority is mirrored, not re-derived). */
export const STATE0_ID = "e0".repeat(32);
export const STATE1_ID = "e1".repeat(32);
export const STATE2_ID = "e2".repeat(32);
export const STATE3_ID = "e3".repeat(32);
export const STATE4_ID = "e4".repeat(32);

/** Fixed 026-style step ids (`step-<16 hex>`, content-derived in 026). */
export const STEP1_ID = "step-0000000000000001";
export const STEP2_ID = "step-0000000000000002";
export const STEP3_ID = "step-0000000000000003";
export const STEP4_ID = "step-0000000000000004";

/** Fixed 64-hex evidence ids (provenance carried verbatim, never interpreted). */
export const EV_POINT_CLOUD = "aa".repeat(32);
export const EV_FIRE_SPEC = "ab".repeat(32);
export const EV_LAYOUT_OPTION_B = "ac".repeat(32);

/** 4.2 m × 3.0 m storey, walls 2.7 m high (the workspace fixture scale). */
const WALL_HEIGHT = 2.7;

/* ------------------------------------------------------------------ */
/* Node/property builders                                              */
/* ------------------------------------------------------------------ */

function prop(
  key: string,
  value: string | number | boolean,
  unit?: string,
): ViewerProposedProperty {
  return {
    key,
    value,
    ...(unit === undefined ? {} : { unit }),
    epistemicStatus: "PROPOSED",
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  };
}

function baselineNode(
  nodeId: string,
  kind: string,
  properties: readonly ViewerProposedProperty[],
  geometry?: { kind: string; ref: string },
): ViewerStateNode {
  const node: ViewerProposedNode = {
    nodeId,
    kind,
    epistemicStatus: "PROPOSED",
    properties: [...properties],
    ...(geometry === undefined ? {} : { geometry }),
    provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
  };
  return { nodeId, origin: "baseline", appliedStepIds: [], node };
}

/** A vertical wall rectangle at a constant plane coordinate (world metres). */
function verticalRect(
  axis: "x" | "y",
  at: number,
  min: number,
  max: number,
): readonly Vec3[] {
  if (axis === "x") {
    return [
      [at, min, 0],
      [at, max, 0],
      [at, max, WALL_HEIGHT],
      [at, min, WALL_HEIGHT],
    ];
  }
  return [
    [min, at, 0],
    [max, at, 0],
    [max, at, WALL_HEIGHT],
    [min, at, WALL_HEIGHT],
  ];
}

/* ------------------------------------------------------------------ */
/* Baseline overlay content (layer 0 — everything origin "baseline")   */
/* ------------------------------------------------------------------ */

/**
 * The synthetic baseline overlay (mirrors 026's buildBaselineStorey plus
 * the deliberate un-projectable cases). Node-id (code-unit) sorted.
 */
export function baselineStateNodes(): ViewerStateNode[] {
  return [
    baselineNode("building-a", "building", []),
    baselineNode("ceiling-1", "element", [prop("semantic.kind", "ceiling")], {
      kind: "plane",
      ref: "plane-ceiling-1",
    }),
    baselineNode("column-mesh-1", "element", [prop("semantic.kind", "column")], {
      kind: "mesh-ref",
      ref: "mesh-column-1",
    }),
    baselineNode("door-101", "opening", [prop("width", 0.9, "m")], {
      kind: "polygon",
      ref: "poly-door-101",
    }),
    baselineNode("floor-slab-101", "element", [prop("thickness", 260, "mm")], {
      kind: "plane",
      ref: "plane-floor-slab-101",
    }),
    baselineNode("paint-1", "element", [prop("semantic.kind", "paint")]),
    baselineNode("project-zurich-hq", "project", []),
    baselineNode("railing-1", "element", [prop("semantic.kind", "railing")], {
      kind: "plane",
      ref: "plane-railing-1",
    }),
    baselineNode("site-north", "site", []),
    baselineNode("skirting-1", "element", [prop("semantic.kind", "skirting")], {
      kind: "polygon",
      ref: "poly-skirting-1",
    }),
    baselineNode("space-office-101", "space", [prop("area", 42.5, "m2")]),
    baselineNode("storey-01", "storey", [prop("level", 4.2, "m")]),
    baselineNode("wall-east", "element", [prop("thickness", 180, "mm")], {
      kind: "plane",
      ref: "plane-wall-east-001",
    }),
    baselineNode("wall-north", "element", [
      prop("thickness", 240, "mm"),
      prop("fireRating", "REI60"),
    ], { kind: "plane", ref: "plane-wall-north-001" }),
  ];
}

function baselineRelationships(): ViewerStateRelationship[] {
  const relation = (
    relationshipId: string,
    fromNodeId: string,
    toNodeId: string,
    kind: string,
  ): ViewerStateRelationship => ({
    relationshipId,
    origin: "baseline",
    relationship: {
      relationshipId,
      fromNodeId,
      toNodeId,
      kind,
      provenance: [{ role: "SUPPORTS", evidenceId: EV_POINT_CLOUD, recordedAt: FIXED_NOW }],
    },
  });
  return [
    relation("rel-bounded-north", "space-office-101", "wall-north", "bounded-by"),
    relation("rel-contains-building", "site-north", "building-a", "contains"),
    relation("rel-contains-floor", "space-office-101", "floor-slab-101", "contains"),
    relation("rel-contains-site", "project-zurich-hq", "site-north", "contains"),
    relation("rel-contains-space", "storey-01", "space-office-101", "contains"),
    relation("rel-contains-storey", "building-a", "storey-01", "contains"),
    relation("rel-contains-wall-east", "space-office-101", "wall-east", "contains"),
    relation("rel-contains-wall-north", "space-office-101", "wall-north", "contains"),
    relation("rel-door-opens", "door-101", "space-office-101", "opens-into"),
  ];
}

/* ------------------------------------------------------------------ */
/* Geometry table (server-assembled, AISE-020/021 convention)          */
/* ------------------------------------------------------------------ */

/**
 * The resolved geometry records for the scenario's refs — including the
 * deliberate honesty cases: no boundary polygon on the ceiling plane, no
 * record at all for plane-railing-1, a one-point degenerate polygon.
 */
export function viewerGeometries(): GeometryRecord[] {
  return [
    {
      geometryId: "plane-wall-north-001",
      kind: "plane",
      plane: { normal: [0, -1, 0], d: 3 },
      offsetSigma: 0.02,
      boundaryPolygon: verticalRect("y", 3, 0, 4.2),
    },
    {
      geometryId: "plane-wall-east-001",
      kind: "plane",
      plane: { normal: [-1, 0, 0], d: 4.2 },
      offsetSigma: 0.01,
      boundaryPolygon: verticalRect("x", 4.2, 0, 3),
    },
    {
      geometryId: "plane-wall-partition-001",
      kind: "plane",
      plane: { normal: [1, 0, 0], d: 2.1 },
      boundaryPolygon: verticalRect("x", 2.1, 0, 3),
    },
    {
      geometryId: "plane-floor-slab-101",
      kind: "plane",
      plane: { normal: [0, 0, 1], d: 0 },
      offsetSigma: 0.005,
      boundaryPolygon: [
        [0, 0, 0],
        [4.2, 0, 0],
        [4.2, 3, 0],
        [0, 3, 0],
      ],
    },
    {
      // Plane WITHOUT boundary polygon: extent unknown — honestly omitted.
      geometryId: "plane-ceiling-1",
      kind: "plane",
      plane: { normal: [0, 0, -1], d: WALL_HEIGHT },
    },
    {
      geometryId: "poly-door-101",
      kind: "polygon",
      polygon: [
        [0.5, 3, 0],
        [1.4, 3, 0],
        [1.4, 3, 2.1],
        [0.5, 3, 2.1],
      ],
    },
    {
      // ONE point: a degenerate boundary — honestly omitted.
      geometryId: "poly-skirting-1",
      kind: "polygon",
      polygon: [[1, 3, 0]],
    },
    // NOTE: no plane-railing-1 record — the ref is deliberately unresolved.
  ];
}

/* ------------------------------------------------------------------ */
/* The canonical steps (mirrors of 026's CANONICAL_STEPS)              */
/* ------------------------------------------------------------------ */

export function canonicalSteps(): ViewerInterventionStep[] {
  return [
    {
      stepId: STEP1_ID,
      stepIndex: 1,
      kind: "property_change",
      targetNodeId: "wall-north",
      rationale: "Upgrading the compartment line to REI90 per the fire strategy.",
      provenance: { evidenceIds: [EV_FIRE_SPEC] },
      recordedAt: FIXED_NOW,
    },
    {
      stepId: STEP2_ID,
      stepIndex: 2,
      kind: "element_addition",
      targetNodeId: "wall-partition-new",
      rationale: "New partition to split the open office.",
      provenance: {
        evidenceIds: [],
        derivationNote: "Partition per drawing A-101 rev C; geometry to be surveyed after erection.",
      },
      recordedAt: FIXED_LATER,
    },
    {
      stepId: STEP3_ID,
      stepIndex: 3,
      kind: "proposed_removal",
      targetNodeId: "wall-east",
      rationale: "Layout change per option B.",
      provenance: { evidenceIds: [EV_LAYOUT_OPTION_B] },
      recordedAt: FIXED_EVEN_LATER,
    },
  ];
}

/** The extra NOTE step (annotates wall-north, changes no model content). */
export const NOTE_STEP: ViewerInterventionStep = {
  stepId: STEP4_ID,
  stepIndex: 4,
  kind: "note",
  targetNodeId: "wall-north",
  rationale: "Coordinate the upgraded rating with the door schedule.",
  provenance: {
    evidenceIds: [],
    derivationNote: "Remark from the fire engineering review meeting.",
  },
  recordedAt: FIXED_APPROVAL,
};

/* ------------------------------------------------------------------ */
/* The four materialized layers (hand-mirrored 026 projection output)  */
/* ------------------------------------------------------------------ */

function state(
  stateId: string,
  stateIndex: number,
  appliedStepIds: readonly string[],
  nodes: readonly ViewerStateNode[],
  relationships: readonly ViewerStateRelationship[],
  proposedTombstones: ViewerInterventionState["proposedTombstones"] = [],
  materializedAt = FIXED_EVEN_LATER,
): ViewerInterventionState {
  return {
    stateId,
    scenarioId: SCENARIO_ID,
    stateIndex,
    baselineVersionId: BASELINE_VERSION_ID,
    appliedStepIds: [...appliedStepIds],
    nodes: [...nodes],
    relationships: [...relationships],
    proposedTombstones: [...proposedTombstones],
    materializedAt,
  };
}

/** Layer 0: the pure baseline overlay (everything origin "baseline"). */
export function buildState0(): ViewerInterventionState {
  return state(STATE0_ID, 0, [], baselineStateNodes(), baselineRelationships(), [], FIXED_NOW);
}

/** Layer 1: + the fire-rating property change on wall-north (touched). */
export function buildState1(): ViewerInterventionState {
  const nodes = baselineStateNodes().map((stateNode) =>
    stateNode.nodeId === "wall-north"
      ? {
          ...stateNode,
          origin: "baseline_touched",
          appliedStepIds: [STEP1_ID],
          node: {
            ...stateNode.node,
            properties: [
              prop("thickness", 240, "mm"),
              prop("fireRating", "REI90"),
            ],
          },
        }
      : stateNode,
  );
  return state(STATE1_ID, 1, [STEP1_ID], nodes, baselineRelationships(), [], FIXED_NOW);
}

/** Layer 2: + the scenario-authored partition wall (with its contains edge). */
export function buildState2(): ViewerInterventionState {
  const partition: ViewerStateNode = {
    nodeId: "wall-partition-new",
    origin: "scenario",
    appliedStepIds: [STEP2_ID],
    node: {
      nodeId: "wall-partition-new",
      kind: "element",
      epistemicStatus: "PROPOSED",
      properties: [prop("thickness", 120, "mm"), prop("fireRating", "REI30")],
      geometry: { kind: "plane", ref: "plane-wall-partition-001" },
      provenance: [
        {
          role: "DERIVED_FROM",
          derivationNote: "Partition per drawing A-101 rev C; geometry to be surveyed after erection.",
          recordedAt: FIXED_LATER,
        },
      ],
    },
  };
  const touchedNorth = baselineStateNodes().map((stateNode) =>
    stateNode.nodeId === "wall-north"
      ? {
          ...stateNode,
          origin: "baseline_touched",
          appliedStepIds: [STEP1_ID],
          node: {
            ...stateNode.node,
            properties: [prop("thickness", 240, "mm"), prop("fireRating", "REI90")],
          },
        }
      : stateNode,
  );
  const nodes = [...touchedNorth, partition].sort((a, b) =>
    a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0,
  );
  const partitionEdge: ViewerStateRelationship = {
    relationshipId: "rel-contains-partition",
    origin: "scenario",
    relationship: {
      relationshipId: "rel-contains-partition",
      fromNodeId: "space-office-101",
      toNodeId: "wall-partition-new",
      kind: "contains",
      provenance: [
        {
          role: "DERIVED_FROM",
          derivationNote: "Partition per drawing A-101 rev C.",
          recordedAt: FIXED_LATER,
        },
      ],
    },
  };
  const relationships = [...baselineRelationships(), partitionEdge].sort((a, b) =>
    a.relationshipId < b.relationshipId ? -1 : a.relationshipId > b.relationshipId ? 1 : 0,
  );
  return state(STATE2_ID, 2, [STEP1_ID, STEP2_ID], nodes, relationships, [], FIXED_LATER);
}

/** Layer 3: + the proposed removal of wall-east (tombstoned, edge severed). */
export function buildState3(): ViewerInterventionState {
  const state2 = buildState2();
  const nodes = state2.nodes.filter((stateNode) => stateNode.nodeId !== "wall-east");
  const relationships = state2.relationships.filter(
    (relationship) => relationship.relationshipId !== "rel-contains-wall-east",
  );
  const tombstones = [
    {
      nodeId: "wall-east",
      reason: "Obsolete partition demolished to open the floor plan.",
      proposedByStepId: STEP3_ID,
      severedRelationshipIds: ["rel-contains-wall-east"],
    },
  ];
  return state(
    STATE3_ID,
    3,
    [STEP1_ID, STEP2_ID, STEP3_ID],
    nodes,
    relationships,
    tombstones,
    FIXED_EVEN_LATER,
  );
}

/** Layer 4 (note scenario): SAME content as layer 3, re-identified only. */
export function buildState4(): ViewerInterventionState {
  const state3 = buildState3();
  return {
    ...state3,
    stateId: STATE4_ID,
    stateIndex: 4,
    appliedStepIds: [STEP1_ID, STEP2_ID, STEP3_ID, STEP4_ID],
    materializedAt: FIXED_APPROVAL,
  };
}

/* ------------------------------------------------------------------ */
/* Scenario records                                                    */
/* ------------------------------------------------------------------ */

function scenarioRecord(
  steps: readonly ViewerInterventionStep[],
  states: readonly ViewerInterventionState[],
  overrides: {
    status?: string;
    approvalReference?: ViewerApprovalReference;
    transitions?: readonly { status: string; at: string }[];
    scenarioId?: string;
    baselineVersionId?: string;
  } = {},
): ViewerScenario {
  return {
    scenarioId: overrides.scenarioId ?? SCENARIO_ID,
    projectId: PROJECT_ID,
    title: SCENARIO_TITLE,
    baselineVersionId: overrides.baselineVersionId ?? BASELINE_VERSION_ID,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_EVEN_LATER,
    status: overrides.status ?? "draft",
    steps: [...steps],
    states: [...states],
    ...(overrides.approvalReference === undefined
      ? {}
      : { approvalReference: overrides.approvalReference }),
    transitions: overrides.transitions ?? [{ status: "draft", at: FIXED_NOW }],
  };
}

/**
 * The canonical 3-step scenario: 4 materialized layers (0..3), status
 * draft, no approval reference — tests drive the governed extras
 * themselves.
 */
export function canonicalScenario(): ViewerScenario {
  return scenarioRecord(canonicalSteps(), [
    buildState0(),
    buildState1(),
    buildState2(),
    buildState3(),
  ]);
}

/** The canonical scenario with a RECORDED approval reference + approved. */
export function approvedScenario(): ViewerScenario {
  return scenarioRecord(canonicalSteps(), [
    buildState0(),
    buildState1(),
    buildState2(),
    buildState3(),
  ], {
    status: "approved",
    approvalReference: {
      caseId: "case-fire-strategy",
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    },
    transitions: [
      { status: "draft", at: FIXED_NOW },
      { status: "under_review", at: FIXED_LATER },
      { status: "approved", at: FIXED_APPROVAL },
    ],
  });
}

/**
 * The 4-step note scenario: the canonical 3 steps + a NOTE step — layer 4
 * carries layer 3's content VERBATIM with a new identity (stateIndex 4,
 * one more applied step id, a different stateId).
 */
export function noteScenario(): ViewerScenario {
  return scenarioRecord([...canonicalSteps(), NOTE_STEP], [
    buildState0(),
    buildState1(),
    buildState2(),
    buildState3(),
    buildState4(),
  ]);
}

/** A minimal scenario: zero steps, one state (the layer-0 overlay only). */
export function singleStateScenario(): ViewerScenario {
  return scenarioRecord([], [buildState0()], {
    transitions: [{ status: "draft", at: FIXED_NOW }],
  });
}

/**
 * The canonical scenario with every state's nodes/relationships arrays and
 * the geometry table REVERSED — a byte-different input ORDER of the same
 * content. The viewer must render it byte-identically (order-insensitive
 * projections; state ids are carried verbatim, never re-derived).
 */
export function shuffledScenario(): ViewerScenario {
  const canonical = canonicalScenario();
  return {
    ...canonical,
    states: canonical.states.map((stateLayer) => ({
      ...stateLayer,
      nodes: [...stateLayer.nodes].reverse(),
      relationships: [...stateLayer.relationships].reverse(),
      proposedTombstones: [...stateLayer.proposedTombstones].reverse(),
    })),
  };
}

/** viewerGeometries() in REVERSED order (same records, different order). */
export function shuffledGeometries(): GeometryRecord[] {
  return [...viewerGeometries()].reverse();
}

/* ------------------------------------------------------------------ */
/* Assembled viewer inputs                                             */
/* ------------------------------------------------------------------ */

/**
 * The base viewer input: canonical scenario + resolved geometry, viewing
 * LAYER 2 (fire-rating change + scenario-authored partition — the richest
 * live-content layer), no selection. Pass overrides to move around.
 */
export function viewerInput(overrides: Partial<ViewerInput> = {}): ViewerInput {
  return {
    scenario: canonicalScenario(),
    geometries: viewerGeometries(),
    stateIndex: 2,
    ...overrides,
  };
}

/** A viewer input viewing a specific layer of a specific scenario. */
export function viewerInputAt(
  stateIndex: number,
  overrides: { scenario?: ViewerScenario; geometries?: readonly GeometryRecord[] } = {},
): ViewerInput {
  return viewerInput({
    stateIndex,
    ...(overrides.scenario === undefined ? {} : { scenario: overrides.scenario }),
    ...(overrides.geometries === undefined ? {} : { geometries: overrides.geometries }),
  });
}

/** A viewer input WITH a selected node (the full presentation surface). */
export function selectedViewerInput(selectedNodeId = "wall-north", stateIndex = 2): ViewerInput {
  return viewerInput({ stateIndex, selectedNodeId });
}

/* ------------------------------------------------------------------ */
/* Read-only reader fixtures (the injected seam)                       */
/* ------------------------------------------------------------------ */

/** An in-memory reader over one scenario record (reads only, returns clones). */
export function makeReader(scenario: ViewerScenario): InterventionReader {
  return {
    readScenario: async (scenarioId: string) =>
      scenarioId === scenario.scenarioId ? scenario : null,
    readState: async (scenarioId: string, stateIndex: number) => {
      if (scenarioId !== scenario.scenarioId) {
        return null;
      }
      return scenario.states[stateIndex] ?? null;
    },
  };
}

/** One recorded reader call (method + arguments). */
export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

/** A reader that RECORDS every member access and every call (the tripwire). */
export interface RecordingReader extends InterventionReader {
  /** Every call made through the seam, in order. */
  readonly calls: () => readonly RecordedCall[];
  /** Every string member name accessed on the seam, in order (meta-free). */
  readonly memberAccesses: () => readonly string[];
}

const READER_META_MEMBERS: readonly string[] = ["calls", "memberAccesses"];

/**
 * A Proxy-wrapped reader that records EVERY member access and EVERY call —
 * the no-mutation discrimination fixture: after driving the full viewer
 * flow, tests assert the accessed members are EXACTLY the read vocabulary
 * (`READER_MEMBERS`) and that no banned (write-shaped) member was ever
 * touched.
 */
export function makeRecordingReader(scenario: ViewerScenario): RecordingReader {
  const base = makeReader(scenario);
  const recordedCalls: RecordedCall[] = [];
  const accesses: string[] = [];
  const self: RecordingReader = {
    readScenario: async (scenarioId: string) => {
      recordedCalls.push({ method: "readScenario", args: [scenarioId] });
      return base.readScenario(scenarioId);
    },
    readState: async (scenarioId: string, stateIndex: number) => {
      recordedCalls.push({ method: "readState", args: [scenarioId, stateIndex] });
      return base.readState(scenarioId, stateIndex);
    },
    calls: () => [...recordedCalls],
    memberAccesses: () => accesses.filter((name) => !READER_META_MEMBERS.includes(name)),
  };
  return new Proxy(self, {
    get(target: RecordingReader, property: string | symbol, receiver: unknown): unknown {
      if (typeof property === "string") {
        accesses.push(property);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/** A reader that resolves NO scenario (the scenario_not_found path). */
export function nullScenarioReader(): InterventionReader {
  return {
    readScenario: async () => null,
    readState: async () => null,
  };
}

/** A reader whose readState resolves NOTHING (the state_not_found path). */
export function nullStateReader(scenario: ViewerScenario): InterventionReader {
  return {
    readScenario: async (scenarioId: string) =>
      scenarioId === scenario.scenarioId ? scenario : null,
    readState: async () => null,
  };
}

/**
 * A reader whose readState returns a TAMPERED clone of the record's layer
 * (the alignment cross-check discrimination path). `tamper` receives the
 * recorded layer and returns the tampered one.
 */
export function tamperingStateReader(
  scenario: ViewerScenario,
  tamper: (stateLayer: ViewerInterventionState) => ViewerInterventionState,
): InterventionReader {
  return {
    readScenario: async (scenarioId: string) =>
      scenarioId === scenario.scenarioId ? scenario : null,
    readState: async (scenarioId: string, stateIndex: number) => {
      if (scenarioId !== scenario.scenarioId) {
        return null;
      }
      const recorded = scenario.states[stateIndex];
      return recorded === undefined ? null : tamper(recorded);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Purity helpers                                                      */
/* ------------------------------------------------------------------ */

/** Deep-freeze an object graph (mutation attempts throw). */
export function deepFreeze<T>(value: T): T {
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}
