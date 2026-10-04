/**
 * WORLD-P3 — the QUANTIFY family's committed fixture corpus.
 *
 * THE CORPUS DRIVES THE REAL SEAMS (the lane never replaces them): the
 * three wall-upgrade intents are compiled through the contract's ONE
 * constructor surface, replayed through the ENGINE's `replaySolution`
 * (the deterministic solution engine — the authority), validated
 * through the ENGINE's `validateSolutionVersion`, and the BOQ is
 * derived through the REAL `deriveSolutionBoq` seam. The resulting
 * `SolutionBoq` is what the BOQ-graph view doubles serve — the lane
 * VIEWS the authority's own output, never a parallel derivation.
 *
 * The what-if fixtures: two alternatives over the block-wall ghost
 * (revise the wall geometry vs reduce the height), with declared
 * variant sets (AISE scene-composition types) and declared comparable
 * shapes for the deviation comparison.
 *
 * PURE DETERMINISTIC COMPUTATION — no I/O, no clock reads (every
 * instant is a declared input), no randomness.
 */

import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  createOperationIntent,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  type EngineeringOperationIntent,
  type OperationDependency,
  type TypedOperationParameter,
} from "@aise/solution-contract";
import {
  TableBaselineGeometryResolver,
  replaySolution,
  steppedMaterializeClock,
  validateSolutionVersion,
} from "@aise/solution-engine";
import { deriveSolutionBoq, type SolutionBoq } from "@aise/solution-boq";
import type { ComposedScene, UsdVariantSet } from "@aise/world-reality-substrate";
import type { ComparableShape } from "@aise/world-layer1-experience";
import type {
  QuantityConsequenceProjectionRequest,
  WhatIfAlternative,
  WhatIfComparisonRequest,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The demo world constants (mirrors the engine/BOQ testkit lineage)    */
/* ------------------------------------------------------------------ */

export const QUANTIFY_WORLD = {
  solutionId: "solution-demo-001",
  projectId: "proj-demo-001",
  title: "Ground-floor wall upgrade solution",
  problemStatement:
    "The ground-floor wall section is distressed; demolish, rebuild and plaster it.",
  baselineRealityVersionId: "rgv-demo-0007",
  createdAt: "2026-09-16T08:00:00.000Z",
  validatedAt: "2026-09-16T11:00:00.000Z",
  clockStartMs: Date.UTC(2026, 8, 16, 10, 0, 0, 0),
  clockStepMs: 60_000,
} as const;

/**
 * The read-only baseline geometry table (the engine's committed
 * wall-world fixture values, inlined as declared data — the engine
 * fixture file itself stays the engine's own artifact).
 */
export const QUANTIFY_BASELINE_GEOMETRY: Readonly<
  Record<string, { readonly value: number; readonly unit: string }>
> = {
  "geo-wall-faces-002": { value: 12.5, unit: "m2" },
  "geo-wall-line-003": { value: 5, unit: "m2" },
  "geo-slab-region-005": { value: 12, unit: "m2" },
  "geo-pit-outline-001": { value: 6, unit: "m2" },
};

/* ------------------------------------------------------------------ */
/* The wall-upgrade intent sequence (compiled, dependency-chained)      */
/* ------------------------------------------------------------------ */

const DEMOLITION_PARAMETERS: readonly TypedOperationParameter[] = [
  { name: "length", value: 5, unit: "m" },
  { name: "height", value: 2.4, unit: "m" },
  { name: "thickness", value: 0.1, unit: "m" },
];

const BLOCK_WALL_PARAMETERS: readonly TypedOperationParameter[] = [
  { name: "length", value: 5, unit: "m" },
  { name: "height", value: 1, unit: "m" },
  { name: "thickness", value: 0.1, unit: "m" },
  { name: "material", value: "concrete-block" },
];

const PLASTER_PARAMETERS: readonly TypedOperationParameter[] = [
  { name: "thickness", value: 30, unit: "mm" },
  { name: "material", value: "cement-plaster" },
];

function wallFacesTarget() {
  return {
    contractVersion: "1.0.0" as const,
    selectorKind: "face-set" as const,
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "polygon" as const, ref: "geo-wall-faces-002" }],
    units: { linear: "m", angular: "rad" },
    description: "The affected ground-floor wall faces",
  };
}

function wallLineTarget() {
  return {
    contractVersion: "1.0.0" as const,
    selectorKind: "line-extent" as const,
    nodeRefs: ["node-wall-002"],
    geometryRefs: [{ kind: "plane" as const, ref: "geo-wall-line-003" }],
    units: { linear: "m", angular: "rad" },
    description: "The wall line along the damaged section",
  };
}

/** The demolition intent (step 1 — no dependencies). */
export const FIXTURE_INTENT_DEMOLITION: EngineeringOperationIntent =
  createOperationIntent({
    intentId: "intent-p3-0001",
    operationType: "demolition-removal",
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [...DEMOLITION_PARAMETERS],
    target: wallFacesTarget(),
    dependsOn: [],
    provenance: {
      origin: "direct-manipulation",
      authoredBy: "user-demo-engineer",
      authoredAt: "2026-09-16T09:00:00.000Z",
      evidenceIds: [],
      derivationNote:
        "operator removed the damaged plaster and wall section by direct selection in the interactive world",
      interactionDetail:
        "operator selected the damaged wall faces and invoked remove in the interactive world",
    },
    proposedTo: {
      solutionId: QUANTIFY_WORLD.solutionId,
      versionNumber: 1,
    },
  });

/** The demolition operation's derived identity (the dependency anchor). */
export const FIXTURE_DEMOLITION_OPERATION_ID = deriveEngineeringOperationId(
  operationSemanticIdentityOfIntent(FIXTURE_INTENT_DEMOLITION, {
    solutionId: QUANTIFY_WORLD.solutionId,
    versionNumber: 1,
    operationIndex: 1,
  }),
);

const DEMOLITION_DEPENDENCY: readonly OperationDependency[] = [
  {
    contractVersion: "1.0.0",
    operationRef: FIXTURE_DEMOLITION_OPERATION_ID,
    dependencyKind: "completion-before",
    rationale: "the rebuilt wall section requires the damaged section removed first",
  },
];

/** The block-wall intent (step 2 — completion-after demolition). */
export const FIXTURE_INTENT_BLOCK_WALL: EngineeringOperationIntent =
  createOperationIntent({
    intentId: "intent-p3-0002",
    operationType: "block-wall-placement",
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [...BLOCK_WALL_PARAMETERS],
    target: wallLineTarget(),
    dependsOn: [...DEMOLITION_DEPENDENCY],
    provenance: {
      origin: "agent",
      authoredBy: "agent-demo-assistant",
      authoredAt: "2026-09-16T09:10:00.000Z",
      evidenceIds: [],
      commandText: "Lay blocks to a height of 1 m along this wall.",
    },
    proposedTo: {
      solutionId: QUANTIFY_WORLD.solutionId,
      versionNumber: 1,
    },
  });

/** The block-wall operation's derived identity. */
export const FIXTURE_BLOCK_WALL_OPERATION_ID = deriveEngineeringOperationId(
  operationSemanticIdentityOfIntent(FIXTURE_INTENT_BLOCK_WALL, {
    solutionId: QUANTIFY_WORLD.solutionId,
    versionNumber: 1,
    operationIndex: 2,
  }),
);

const BLOCK_WALL_DEPENDENCY: readonly OperationDependency[] = [
  {
    contractVersion: "1.0.0",
    operationRef: FIXTURE_BLOCK_WALL_OPERATION_ID,
    dependencyKind: "completion-before",
    rationale: "plaster applies to the rebuilt wall after the block wall is placed",
  },
];

/** The plaster intent (step 3 — completion-after the block wall). */
export const FIXTURE_INTENT_PLASTER: EngineeringOperationIntent =
  createOperationIntent({
    intentId: "intent-p3-0003",
    operationType: "plaster-application",
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [...PLASTER_PARAMETERS],
    target: wallFacesTarget(),
    dependsOn: [...BLOCK_WALL_DEPENDENCY],
    provenance: {
      origin: "agent",
      authoredBy: "agent-demo-assistant",
      authoredAt: "2026-09-16T09:15:00.000Z",
      evidenceIds: [],
      commandText: "Apply 30 mm plaster to the affected wall faces.",
    },
    proposedTo: {
      solutionId: QUANTIFY_WORLD.solutionId,
      versionNumber: 1,
    },
  });

/** The plaster operation's derived identity. */
export const FIXTURE_PLASTER_OPERATION_ID = deriveEngineeringOperationId(
  operationSemanticIdentityOfIntent(FIXTURE_INTENT_PLASTER, {
    solutionId: QUANTIFY_WORLD.solutionId,
    versionNumber: 1,
    operationIndex: 3,
  }),
);

/** The ordered wall-upgrade intent sequence. */
export const FIXTURE_WALL_UPGRADE_INTENTS: readonly EngineeringOperationIntent[] = [
  FIXTURE_INTENT_DEMOLITION,
  FIXTURE_INTENT_BLOCK_WALL,
  FIXTURE_INTENT_PLASTER,
];

/* ------------------------------------------------------------------ */
/* The replayed + validated + BOQ-derived world (THE REAL SEAMS)        */
/* ------------------------------------------------------------------ */

interface QuantifyWorldFixture {
  /** The engine-replayed solution version (the authority's record). */
  readonly version: ReturnType<typeof replayFixtureVersion>;
  /** The engine's deterministic validation snapshot. */
  readonly snapshot: ReturnType<typeof validateSolutionVersion>;
  /** The REAL derived BOQ (deriveSolutionBoq output — the authority). */
  readonly boq: SolutionBoq;
  /** The engine-recorded operations, ordered. */
  readonly operations: readonly ReturnType<typeof replayFixtureVersion>["operations"][number][];
}

function replayFixtureVersion() {
  const replay = replaySolution({
    solutionId: QUANTIFY_WORLD.solutionId,
    projectId: QUANTIFY_WORLD.projectId,
    title: QUANTIFY_WORLD.title,
    problemStatement: QUANTIFY_WORLD.problemStatement,
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: QUANTIFY_WORLD.baselineRealityVersionId,
    intents: FIXTURE_WALL_UPGRADE_INTENTS,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: steppedMaterializeClock(
      QUANTIFY_WORLD.clockStartMs,
      QUANTIFY_WORLD.clockStepMs,
    ),
    createdAt: QUANTIFY_WORLD.createdAt,
    versionNumber: 1,
    baselineGeometry: new TableBaselineGeometryResolver(QUANTIFY_BASELINE_GEOMETRY),
  });
  if (replay.outcome !== "complete") {
    throw new Error(
      `the WORLD-P3 quantify fixture replay failed: ${replay.outcome} at step ${"failedAtStep" in replay ? String(replay.failedAtStep) : "?"}`,
    );
  }
  return replay.version;
}

/** THE fixture world — replayed + validated + BOQ-derived through the REAL seams. */
export const FIXTURE_QUANTIFY_WORLD: QuantifyWorldFixture = (() => {
  const version = replayFixtureVersion();
  const snapshot = validateSolutionVersion({
    version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    validatedAt: QUANTIFY_WORLD.validatedAt,
  });
  const boq = deriveSolutionBoq({ version, snapshot });
  return { version, snapshot, boq, operations: version.operations };
})();

/* ------------------------------------------------------------------ */
/* The live-projection request (the QUANTIFY stage input)              */
/* ------------------------------------------------------------------ */

/**
 * The projection request: the solution's NEW authored operation (the
 * plaster pass, recorded by the engine with quantity effects) projected
 * live against the derived BOQ.
 */
export function fixtureProjectionRequest(): QuantityConsequenceProjectionRequest {
  const plaster = FIXTURE_QUANTIFY_WORLD.operations.find(
    (operation) => operation.operationId === FIXTURE_PLASTER_OPERATION_ID,
  );
  if (plaster === undefined) {
    throw new Error("the fixture world lost its plaster operation");
  }
  return {
    solutionId: QUANTIFY_WORLD.solutionId,
    versionNumber: 1,
    proposedOperations: [plaster],
    baselineBoq: FIXTURE_QUANTIFY_WORLD.boq,
  };
}

/** A projection request whose operation belongs to the WRONG version context. */
export function fixtureWrongVersionProjectionRequest(): QuantityConsequenceProjectionRequest {
  const demolition = FIXTURE_QUANTIFY_WORLD.operations[0];
  if (demolition === undefined) {
    throw new Error("the fixture world lost its demolition operation");
  }
  return {
    solutionId: "solution-other-999",
    versionNumber: 2,
    proposedOperations: [demolition],
    baselineBoq: FIXTURE_QUANTIFY_WORLD.boq,
  };
}

/* ------------------------------------------------------------------ */
/* The what-if fixtures (the WHAT-IF stage inputs)                      */
/* ------------------------------------------------------------------ */

/** The base scene for what-if composition (ghosts + reality). */
export const FIXTURE_WHAT_IF_BASE_SCENE: ComposedScene = {
  revision: 4,
  nodes: [
    {
      elementId: "node-wall-002",
      kind: "plan_model",
      parentId: null,
      transform: {
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
      geometry: { assetId: "asset-wall-002", partId: "mesh:0", format: "gltf-json" },
      material: null,
      layerIds: ["reality"],
      isGhost: false,
      evidenceContentIds: [],
      label: "Ground-floor wall",
    },
    {
      elementId: "ghost-add-block-wall-0001",
      kind: "ghost",
      parentId: null,
      transform: {
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
      geometry: { assetId: "asset-ghost-lintel", partId: "mesh:0", format: "gltf-json" },
      material: null,
      layerIds: ["solution"],
      isGhost: true,
      evidenceContentIds: [],
      label: "Proposed block wall (ghost)",
    },
  ],
  layers: [
    { layerId: "reality", name: "Captured reality", visibleByDefault: true },
    { layerId: "solution", name: "Solution proposal", visibleByDefault: true },
  ],
  siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
  ghostSummary: {
    operationId: FIXTURE_BLOCK_WALL_OPERATION_ID,
    proposedElementIds: ["ghost-add-block-wall-0001"],
    removedElementIds: [],
  },
};

/** The variant sets (AISE scene-composition types — P0-A). */
export const FIXTURE_WHAT_IF_VARIANT_SETS: readonly UsdVariantSet[] = [
  {
    variantSetId: "wall-clearance",
    variants: [
      {
        variantId: "shift-wall-south",
        overrides: [
          {
            elementId: "ghost-add-block-wall-0001",
            transform: {
              matrix: [1, 0, 0, 0, 0, 1, 0, 0.3, 0, 0, 1, 0, 0, 0, 0, 1],
            },
          },
        ],
      },
      {
        variantId: "reduce-height",
        overrides: [
          {
            elementId: "ghost-add-block-wall-0001",
            label: "Proposed block wall (reduced height, ghost)",
          },
        ],
      },
    ],
  },
];

/** The USD path bindings (the identity law carrier). */
export const FIXTURE_WHAT_IF_PATH_BINDINGS: readonly {
  readonly usdPath: string;
  readonly elementId: string;
}[] = [
  { usdPath: "/World/Solution/BlockWall", elementId: "ghost-add-block-wall-0001" },
];

/** The baseline's declared comparable shapes. */
export const FIXTURE_WHAT_IF_BASELINE_SHAPES: readonly {
  readonly elementId: string;
  readonly shape: ComparableShape;
}[] = [
  {
    elementId: "ghost-add-block-wall-0001",
    shape: {
      kind: "box",
      name: null,
      min: { x: 0, y: 0, z: 0 },
      max: { x: 5, y: 0.1, z: 1 },
    },
  },
];

/** Alternative A: shift the wall south — declared geometry + quantity delta. */
export const FIXTURE_WHAT_IF_ALTERNATIVE_A: WhatIfAlternative = {
  alternativeId: "what-if-shift-wall-south",
  label: "Shift the proposed wall 0.3 m south (clear the beam)",
  variantSelections: [{ variantSetId: "wall-clearance", variantId: "shift-wall-south" }],
  declaredQuantityDeltas: [
    { dimension: "area", unit: "m2", deltaValue: 0, direction: "changed" },
  ],
  elementShapes: [
    {
      elementId: "ghost-add-block-wall-0001",
      shape: {
        kind: "box",
        name: null,
        min: { x: 0, y: 0.3, z: 0 },
        max: { x: 5, y: 0.4, z: 1 },
      },
    },
  ],
};

/** Alternative B: reduce the wall height — declared geometry + quantity delta. */
export const FIXTURE_WHAT_IF_ALTERNATIVE_B: WhatIfAlternative = {
  alternativeId: "what-if-reduce-height",
  label: "Reduce the proposed wall height to 0.8 m (clear the beam by height)",
  variantSelections: [{ variantSetId: "wall-clearance", variantId: "reduce-height" }],
  declaredQuantityDeltas: [
    { dimension: "area", unit: "m2", deltaValue: -1, direction: "changed" },
  ],
  elementShapes: [
    {
      elementId: "ghost-add-block-wall-0001",
      shape: {
        kind: "box",
        name: null,
        min: { x: 0, y: 0, z: 0 },
        max: { x: 5, y: 0.1, z: 0.8 },
      },
    },
  ],
};

/** The canonical what-if comparison request. */
export function fixtureWhatIfComparisonRequest(): WhatIfComparisonRequest {
  return {
    solutionId: QUANTIFY_WORLD.solutionId,
    versionNumber: 1,
    baseScene: FIXTURE_WHAT_IF_BASE_SCENE,
    variantSets: FIXTURE_WHAT_IF_VARIANT_SETS,
    payloads: [],
    pathBindings: FIXTURE_WHAT_IF_PATH_BINDINGS,
    alternatives: [FIXTURE_WHAT_IF_ALTERNATIVE_A, FIXTURE_WHAT_IF_ALTERNATIVE_B],
    baselineElementShapes: FIXTURE_WHAT_IF_BASELINE_SHAPES,
    tolerance: { linear: 0.05, angular: 0.001 },
    nearBoundaryBand: 0.02,
    units: { linear: "m", angular: "rad" },
    declaredAt: "2026-10-05T10:00:00.000Z",
    comparisonLabel: "Beam-clearance alternatives for the proposed wall",
  };
}
