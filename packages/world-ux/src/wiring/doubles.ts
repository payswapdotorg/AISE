/**
 * WORLD-P4 — the wiring family's two in-memory SUBSTITUTION DOUBLES:
 * the WORLD-STATION SOURCE DOUBLES (the route-binding seam).
 *
 * Both implement the complete `WorldStationSources` port WITHOUT any
 * substrate — no Babylon, no Cesium, no OCCT, no clash engine, no LLM,
 * no database: every source composes the REAL lane code over the
 * COMMITTED fixtures (the P1 fixture world, the P2 lane run, the P3
 * lane run + the solution-engine replay/BOQ seams). This is the
 * substitution-law proof: the world station's HUD and surface are
 * implementable with zero substrate, and the reference and alternate
 * kits produce BYTE-IDENTICAL station models (the panel/surface
 * projections are pure functions of substrate-independent lane
 * identities — proven by the substitution test).
 *
 *  - `referenceWorldStationSources` — the all-reference kit (the P2
 *    reference lane kit, the P3 default kit, the P0-C reference
 *    simulation double, the L3 reference clash predicate);
 *  - `alternateWorldStationSources` — the fully-alternate kit (the P2
 *    alternate lane kit, the P3 alternate NL/clash/BOQ/replay
 *    doubles, the P0-C alternate scene-usage + simulation doubles) —
 *    the same station through the fully-alternate substrate seam.
 *
 * HONESTY OF THE DOUBLES (no fabrication — law #3):
 *
 *  - every HUD value traces to a REAL lane record: the problem is the
 *    P2 fixture problem; the readiness report, actions and check gate
 *    are the P2 lane run's own outputs; the quantity projection is
 *    derived through the REAL `projectLiveQuantityConsequences` over
 *    the REAL engine-replayed operations and the REAL derived BOQ; the
 *    execution sequence is the REAL `sequenceExecution` over the P0-C
 *    simulation port; the clash conflicts are the REAL
 *    `recordCoordinationConflicts` binding of the L3 clash report to
 *    the P2 problem (wiring note #4 — LIVE clash→problem);
 *  - the only DECLARED data is what the doubles legitimately own as
 *    substrate stand-ins: the declared clash-pair box shapes (the
 *    clash-engine substrate's declared geometry proxies — exactly the
 *    L3 doubles' own discipline), the declared activity durations and
 *    the declared simulation clock (the AISE-side declarations the
 *    sequencing contract requires), and the declared instants (never
 *    clock reads);
 *  - the ghost overlay is the REAL `compileManipulationStream` +
 *    `compileAuthoringCommand` + `composeGhostScene` over the P1
 *    fixture world (wiring note #3: the authored command carries a
 *    derivationNote — the provenance invariant holds and the fail-
 *    closed poison case is proven by the fail-closed drill).
 */

import {
  FIXTURE_PROBLEM,
  FIXTURE_REQUIREMENT_SET,
  fixtureScenarioB,
  runLayer2Lane,
  referenceContextAssemblerDouble,
  referenceMissingEvidenceDouble,
  referenceBoundedReasonerDouble,
  referenceActionRecorderDouble,
  referenceAuditLedgerDouble,
  alternateContextAssemblerDouble,
  alternateMissingEvidenceDouble,
  alternateBoundedReasonerDouble,
  alternateActionRecorderDouble,
  alternateAuditLedgerDouble,
  type Layer2LaneKit,
  type Layer2LaneRunResult,
} from "@aise/world-layer2-experience";
import {
  FIXTURE_WORLD,
  FIXTURE_TOLERANCE,
} from "@aise/world-layer1-experience";
import {
  runInteractiveSolutionLane,
  defaultInteractiveSolutionLaneKit,
  compileManipulationStream,
  compileAuthoringCommand,
  composeGhostScene,
  aggregateCoordinationModels,
  recordCoordinationConflicts,
  projectLiveQuantityConsequences,
  sequenceExecution,
  referenceClashPredicateDouble,
  alternateClashPredicateDouble,
  alternateNlCommandParserDouble,
  alternateBoqGraphViewDouble,
  alternateReplayLedgerDouble,
  type InteractiveSolutionLaneKit,
  type AuthoredCommand,
  type ClashPredicateAdapter,
  type CoordinationConflictRecord,
} from "@aise/world-layer3-experience";
import {
  alternateSimulationDouble,
  referenceSimulationDouble,
  SolutionSceneUsageAlternateDouble,
  defaultRealityPorts,
  type ExecutionSimulationAdapter,
} from "@aise/world-solution-substrate";
import {
  createOperationIntent,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  type EngineeringOperationIntent,
  type OperationDependency,
} from "@aise/solution-contract";
import {
  replaySolution,
  validateSolutionVersion,
  steppedMaterializeClock,
  TableBaselineGeometryResolver,
} from "@aise/solution-engine";
import { deriveSolutionBoq, type SolutionBoq as StationBoq } from "@aise/solution-boq";
import type { ComposedScene, SceneNode } from "@aise/world-reality-substrate";
import { IDENTITY_TRANSFORM } from "@aise/world-reality-substrate";
import type {
  WorldStationSources,
} from "./contract";
import type { HudConstraintObservation, HudOperatorSummary } from "../hud/contract";
import { deepFreeze, worldUxOk } from "../seam";

/* ------------------------------------------------------------------ */
/* The declared station constants (fixed, committed — never clocked)    */
/* ------------------------------------------------------------------ */

/** The station scope label (the demo project the fixtures compose). */
export const STATION_SCOPE_LABEL = "proj-demo-001" as const;

/** The declared composition instant (the committed fixture clock). */
export const STATION_COMPOSED_AT = "2026-09-16T12:00:00.000Z" as const;

/** The declared clash-test instant. */
export const STATION_CLASH_DECLARED_AT = "2026-09-16T11:30:00.000Z" as const;

/** The declared conflict-recording instant. */
export const STATION_CONFLICT_RECORDED_AT = "2026-09-16T11:31:00.000Z" as const;

/** The declared sequencing instant. */
export const STATION_SEQUENCE_RECORDED_AT = "2026-09-16T11:45:00.000Z" as const;

/** The station's solution identity (mirrors the engine lineage). */
export const STATION_SOLUTION_ID = "solution-demo-001" as const;
export const STATION_SOLUTION_VERSION = 1 as const;

/** The station's baseline reality version (the engine's fixture lineage). */
export const STATION_BASELINE_REALITY_VERSION_ID = "rgv-demo-0007" as const;

/* ------------------------------------------------------------------ */
/* The P2 lane run (the problem/evidence/action/check-gate sources)     */
/* ------------------------------------------------------------------ */

const REFERENCE_LAYER2_KIT: Layer2LaneKit = {
  label: "reference",
  contextAssembler: referenceContextAssemblerDouble,
  detector: referenceMissingEvidenceDouble,
  reasoner: referenceBoundedReasonerDouble,
  recorder: referenceActionRecorderDouble,
  ledger: referenceAuditLedgerDouble,
};

const ALTERNATE_LAYER2_KIT: Layer2LaneKit = {
  label: "alternate",
  contextAssembler: alternateContextAssemblerDouble,
  detector: alternateMissingEvidenceDouble,
  reasoner: alternateBoundedReasonerDouble,
  recorder: alternateActionRecorderDouble,
  ledger: alternateAuditLedgerDouble,
};

function runLayer2ScenarioB(kit: Layer2LaneKit): Layer2LaneRunResult {
  const outcome = runLayer2Lane(kit, fixtureScenarioB());
  if (!outcome.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's P2 lane run refused: ${outcome.failure.detail}`,
    );
  }
  return outcome.value;
}

/* ------------------------------------------------------------------ */
/* The solution-side composition (the REAL engine seams)                */
/* ------------------------------------------------------------------ */

/**
 * The station's authored intent sequence (the wall-upgrade lineage,
 * authored against the station's world): demolition → block wall →
 * plaster. Every intent carries a derivationNote (wiring note #3 —
 * the provenance invariant holds; the fail-closed drill poisons it).
 */
function stationIntents(): readonly EngineeringOperationIntent[] {
  const versionContext = {
    solutionId: STATION_SOLUTION_ID,
    versionNumber: STATION_SOLUTION_VERSION,
  };
  const demolition = createOperationIntent({
    intentId: "intent-p4-0001",
    operationType: "demolition-removal",
      domain: REFERENCE_BUILDING_DOMAIN,
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 2.4, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
      ],
      target: {
        contractVersion: "1.0.0",
        selectorKind: "face-set",
        nodeRefs: ["plan-wall-001"],
        geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
        units: { linear: "m", angular: "rad" },
        description: "The distressed ground-floor wall faces",
      },
      dependsOn: [],
      provenance: {
        origin: "direct-manipulation",
        authoredBy: "user-demo-engineer",
        authoredAt: "2026-09-16T09:00:00.000Z",
        evidenceIds: [],
        derivationNote:
          "operator removed the damaged wall section by direct selection in the world station",
        interactionDetail:
          "operator selected the damaged wall faces and invoked remove in the world station",
      },
  });
  const demolitionOperationId = deriveEngineeringOperationId(
    operationSemanticIdentityOfIntent(demolition, { ...versionContext, operationIndex: 1 }),
  );
  const demolitionDependency: readonly OperationDependency[] = [
    {
      contractVersion: "1.0.0",
      operationRef: demolitionOperationId,
      dependencyKind: "completion-before",
      rationale: "the rebuild starts when the demolition completes",
    },
  ];
  const blockWall = createOperationIntent({
    intentId: "intent-p4-0002",
    operationType: "block-wall-placement",
      domain: REFERENCE_BUILDING_DOMAIN,
      parameters: [
        { name: "length", value: 5, unit: "m" },
        { name: "height", value: 1, unit: "m" },
        { name: "thickness", value: 0.1, unit: "m" },
        { name: "material", value: "concrete-block" },
      ],
      target: {
        contractVersion: "1.0.0",
        selectorKind: "line-extent",
        nodeRefs: ["plan-wall-001"],
        geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
        units: { linear: "m", angular: "rad" },
        description: "The wall line along the rebuilt section",
      },
      dependsOn: demolitionDependency,
      provenance: {
        origin: "direct-manipulation",
        authoredBy: "user-demo-engineer",
        authoredAt: "2026-09-16T09:05:00.000Z",
        evidenceIds: [],
        derivationNote:
          "operator rebuilt the wall as a block wall by direct manipulation in the world station",
        interactionDetail:
          "operator placed the block wall along the demolished section",
      },
  });
  const blockWallOperationId = deriveEngineeringOperationId(
    operationSemanticIdentityOfIntent(blockWall, { ...versionContext, operationIndex: 2 }),
  );
  const plaster = createOperationIntent({
    intentId: "intent-p4-0003",
    operationType: "plaster-application",
      domain: REFERENCE_BUILDING_DOMAIN,
      parameters: [
        { name: "thickness", value: 30, unit: "mm" },
        { name: "material", value: "cement-plaster" },
      ],
      target: {
        contractVersion: "1.0.0",
        selectorKind: "face-set",
        nodeRefs: ["plan-wall-001"],
        geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
        units: { linear: "m", angular: "rad" },
        description: "The rebuilt wall's finish faces",
      },
      dependsOn: [
        {
          contractVersion: "1.0.0",
          operationRef: blockWallOperationId,
          dependencyKind: "completion-before",
          rationale: "the plaster pass follows the block-wall rebuild",
        },
      ],
      provenance: {
        origin: "agent",
        authoredBy: "agent-aise-001",
        authoredAt: "2026-09-16T09:10:00.000Z",
        evidenceIds: [],
        commandText: "Apply a 30 mm cement plaster finish to the rebuilt wall.",
        derivationNote:
          "the agent proposed the plaster pass as the finish step of the wall upgrade",
      },
  });
  return [demolition, blockWall, plaster];
}

/** The engine's committed baseline geometry table (the fixture lineage). */
const STATION_BASELINE_GEOMETRY: Readonly<
  Record<string, { readonly value: number; readonly unit: string }>
> = {
  "geo-wall-faces-002": { value: 12.5, unit: "m2" },
  "geo-wall-line-003": { value: 5, unit: "m2" },
  "geo-slab-region-005": { value: 12, unit: "m2" },
  "geo-pit-outline-001": { value: 6, unit: "m2" },
};

interface StationSolutionRecords {
  readonly operations: readonly ReturnType<typeof replayStationVersion>["operations"][number][];
  readonly boq: ReturnType<typeof deriveSolutionBoq>;
}

/** Replay the station's solution version through the REAL engine. */
function replayStationVersion() {
  const replay = replaySolution({
    solutionId: STATION_SOLUTION_ID,
    projectId: STATION_SCOPE_LABEL,
    title: "Ground-floor wall upgrade solution",
    problemStatement:
      "The ground-floor wall section is distressed; demolish, rebuild and plaster it.",
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: STATION_BASELINE_REALITY_VERSION_ID,
    intents: stationIntents(),
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: steppedMaterializeClock(
      Date.UTC(2026, 8, 16, 10, 0, 0, 0),
      60_000,
    ),
    createdAt: "2026-09-16T08:00:00.000Z",
    versionNumber: STATION_SOLUTION_VERSION,
    baselineGeometry: new TableBaselineGeometryResolver(STATION_BASELINE_GEOMETRY),
  });
  if (replay.outcome !== "complete") {
    throw new Error(
      `the WORLD-P4 wiring double's engine replay failed: ${replay.outcome}`,
    );
  }
  return replay.version;
}

/** Compose the station's solution records (replay → validate → BOQ). */
function stationSolutionRecords(): StationSolutionRecords {
  const version = replayStationVersion();
  const snapshot = validateSolutionVersion({
    version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    validatedAt: "2026-09-16T11:00:00.000Z",
  });
  const boq = deriveSolutionBoq({ version, snapshot });
  const operations = version.operations;
  if (operations.length === 0) {
    throw new Error("the WORLD-P4 wiring double's replay produced no operations");
  }
  return { operations, boq };
}

/* ------------------------------------------------------------------ */
/* The clash pipeline (wiring note #4 — LIVE clash→problem)             */
/* ------------------------------------------------------------------ */

/** Build a minimal valid scene carrying one declared element node. */
function singleElementScene(
  elementId: string,
  revision: number,
): ComposedScene {
  const node: SceneNode = {
    elementId,
    kind: "element",
    parentId: null,
    transform: IDENTITY_TRANSFORM,
    geometry: null,
    material: null,
    layerIds: ["capture-reality"],
    isGhost: false,
    evidenceContentIds: [],
    label: null,
  };
  return {
    revision,
    nodes: [node],
    layers: [{ layerId: "capture-reality", name: "Capture reality", visibleByDefault: true }],
    siteFrame: FIXTURE_WORLD.siteFrame,
    ghostSummary: null,
  };
}

/**
 * Run the LIVE clash pipeline: aggregate the two bound elements into a
 * coordinated scene, run the clash predicate port over the declared
 * box proxies, and record the conflict bindings against the P2 problem
 * (wiring note #4). The clash engine is the passed substitution double
 * (reference or alternate — byte-identical reports).
 */
function stationClashConflicts(
  clashEngine: ClashPredicateAdapter,
): readonly CoordinationConflictRecord[] {
  const problem = FIXTURE_PROBLEM;
  const elementA = problem.spatialBinding.elementIds[0]!;
  const elementB = problem.spatialBinding.elementIds[1]!;
  const aggregateOutcome = aggregateCoordinationModels({
    models: [
      {
        modelId: "model-station-capture-001",
        scene: singleElementScene(elementA, 1),
        placementMetres: [0, 0, 0],
      },
      {
        modelId: "model-station-plan-002",
        scene: singleElementScene(elementB, 1),
        placementMetres: [0.05, 0, 0],
      },
    ],
    siteFrame: FIXTURE_WORLD.siteFrame,
    layers: [{ layerId: "capture-reality", name: "Capture reality", visibleByDefault: true }],
  });
  if (!aggregateOutcome.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's coordination aggregate refused: ${aggregateOutcome.failure.detail}`,
    );
  }
  const reportOutcome = clashEngine.detectClashes(
    {
      pairs: [
        {
          pairId: "station-pair-lintel-bearing-001",
          elementA,
          elementB,
          shapeA: {
            kind: "box",
            name: null,
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 0.2, z: 0.2 },
          },
          shapeB: {
            kind: "box",
            name: null,
            min: { x: 0.9, y: 0, z: 0 },
            max: { x: 1.9, y: 0.2, z: 0.2 },
          },
        },
      ],
      tolerance: { linear: 0.05, angular: 0.01 },
      units: { linear: "m", angular: "rad" },
      declaredAt: STATION_CLASH_DECLARED_AT,
    },
    aggregateOutcome.value,
  );
  if (!reportOutcome.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's clash predicate refused: ${reportOutcome.failure.detail}`,
    );
  }
  const records = recordCoordinationConflicts({
    report: reportOutcome.value,
    problems: [problem],
    recordedAt: STATION_CONFLICT_RECORDED_AT,
  });
  if (!records.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's conflict recording refused: ${records.failure.detail}`,
    );
  }
  return records.value;
}

/* ------------------------------------------------------------------ */
/* The ghost overlay (the authored command over the P1 fixture world)   */
/* ------------------------------------------------------------------ */

/** The station's authoring scope: the P1 fixture world + its palette. */
function stationAuthoringScope() {
  return {
    solutionId: STATION_SOLUTION_ID,
    versionNumber: STATION_SOLUTION_VERSION,
    worldScene: FIXTURE_WORLD.scene,
    elementDescriptors: [
      {
        elementId: "plan-wall-001",
        selectionModes: [
          {
            selectorKind: "face-set" as const,
            geometryRefs: [{ kind: "polygon" as const, ref: "geo-wall-faces-002" }],
            units: { linear: "m", angular: "rad" },
            description: "The wall's finish faces",
          },
        ],
      },
    ],
    operationPalette: [
      {
        operationType: "plaster-application",
        targetSelectorKind: "face-set" as const,
        defaultParameters: [
          { name: "thickness", value: 30, unit: "mm" },
          { name: "material", value: "cement-plaster" },
        ],
      },
    ],
    domain: REFERENCE_BUILDING_DOMAIN,
  };
}

/** Compile the station's ghost overlay (the authored plaster ghost). */
function stationGhostOverlay(): {
  readonly command: AuthoredCommand;
  readonly ghostScene: ComposedScene;
} {
  const scope = stationAuthoringScope();
  const stream = {
    streamId: "station-dm-stream-0001",
    operator: { operatorId: "user-demo-engineer", role: "engineer" as const },
    sceneRevision: FIXTURE_WORLD.scene.revision,
    gestures: [
      { gesture: "pick-element" as const, elementId: "plan-wall-001" },
      {
        gesture: "edit-parameter" as const,
        parameter: { name: "thickness", value: 30, unit: "mm" },
      },
      { gesture: "commit" as const, commandKind: "reparameterize" as const, operationType: "plaster-application" },
    ],
    authoredAt: "2026-09-16T09:10:00.000Z",
  };
  const compiled = compileManipulationStream(stream, scope);
  if (!compiled.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's manipulation compile refused: ${compiled.failure.detail}`,
    );
  }
  const command = compileAuthoringCommand(
    compiled.value.draft,
    scope,
    {
      operator: { operatorId: "user-demo-engineer", role: "engineer" },
      authoredAt: stream.authoredAt,
      interactionDetail: compiled.value.interactionDetail,
    },
    "intent-station-ghost-0001",
  );
  if (!command.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's authoring compile refused: ${command.failure.detail}`,
    );
  }
  const ghostScene = composeGhostScene(FIXTURE_WORLD.scene, command.value, {
    transform: [0.02, 0, 0],
    geometry: {
      assetId: "asset-station-plaster-ghost-001",
      partId: "part-001",
      format: "gltf-json" as const,
    },
    label: "PROPOSED — 30 mm plaster pass",
  });
  if (!ghostScene.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's ghost composition refused: ${ghostScene.failure.detail}`,
    );
  }
  return { command: command.value, ghostScene: ghostScene.value };
}

/* ------------------------------------------------------------------ */
/* The constraint observations (derived from REAL lane records)         */
/* ------------------------------------------------------------------ */

/**
 * Derive the station's governed-constraint observations from real lane
 * records: the P2 fixture requirement set (evidence-requirement
 * constraints) and the P1 declared fixture tolerance (the dimension
 * constraint the compare family enforces). No fabricated constraint —
 * every observation cites its lane record.
 */
function stationConstraintObservations(): readonly HudConstraintObservation[] {
  const observations: HudConstraintObservation[] =
    FIXTURE_REQUIREMENT_SET.requirements.map((requirement) =>
      deepFreeze({
        constraintId: `layer2-requirement-${requirement.requirementId}`,
        kind: "evidence-requirement" as const,
        statement:
          "The case's evidence requirement must be satisfied before the solution is ready",
        sourceLane: "layer2-context" as const,
        sourceRef: requirement.requirementId,
      }),
    );
  observations.push(
    deepFreeze({
      constraintId: "layer1-declared-tolerance-001",
      kind: "dimension" as const,
      statement: `Deviations are classified against the declared linear tolerance of ${FIXTURE_TOLERANCE.linear} m`,
      sourceLane: "layer1-declared" as const,
      sourceRef: "fixture-compare-tolerance",
    }),
  );
  return observations;
}

/* ------------------------------------------------------------------ */
/* The source doubles                                                   */
/* ------------------------------------------------------------------ */

/** Build the complete station source set over one substrate kit. */
function stationSources(kit: {
  readonly layer2: Layer2LaneKit;
  /** The P3 lane kit factory — receives the station's derived BOQ (the
   *  alternate BOQ-view double is constructed over it so the lane's
   *  QUANTIFY stage resolves the same authority record). */
  readonly lane3: (stationBoq: StationBoq) => InteractiveSolutionLaneKit;
  readonly clashEngine: ClashPredicateAdapter;
  readonly simulation: ExecutionSimulationAdapter;
}): WorldStationSources {
  /* The composed lane runs (lazy — computed once per source set, the
   * doubles are read-only over deterministic fixtures). */
  const layer2Run = runLayer2ScenarioB(kit.layer2);
  const solution = stationSolutionRecords();
  const clashConflicts = stationClashConflicts(kit.clashEngine);
  const ghost = stationGhostOverlay();

  const projectionOutcome = projectLiveQuantityConsequences({
    solutionId: STATION_SOLUTION_ID,
    versionNumber: STATION_SOLUTION_VERSION,
    proposedOperations: [solution.operations[solution.operations.length - 1]!],
    baselineBoq: solution.boq,
  });
  if (!projectionOutcome.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's quantity projection refused: ${projectionOutcome.failure.detail}`,
    );
  }

  const sequenceOutcome = sequenceExecution(
    {
      kind: "execution-sequencing-plan",
      schemaVersion: "execution-sequencing-plan/1",
      solutionId: STATION_SOLUTION_ID,
      versionNumber: STATION_SOLUTION_VERSION,
      operations: solution.operations,
      durations: [
        { operationId: solution.operations[0]!.operationId, durationValue: 16, durationUnit: "hour" },
        { operationId: solution.operations[1]!.operationId, durationValue: 24, durationUnit: "hour" },
        { operationId: solution.operations[2]!.operationId, durationValue: 8, durationUnit: "hour" },
      ],
      clock: { epochIso: "2026-09-16T10:00:00.000Z", timeUnit: "hour" },
      baselineStateIndex: 0,
      recordedAt: STATION_SEQUENCE_RECORDED_AT,
    },
    kit.simulation,
  );
  if (!sequenceOutcome.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's execution sequencing refused: ${sequenceOutcome.failure.detail}`,
    );
  }

  const replayRun = runInteractiveSolutionLane(kit.lane3(solution.boq));
  if (!replayRun.ok) {
    throw new Error(
      `the WORLD-P4 wiring double's P3 lane run refused: ${replayRun.failure.detail}`,
    );
  }

  const operator: HudOperatorSummary = deepFreeze({
    operatorId: FIXTURE_PROBLEM.openedBy.actorId,
    role: FIXTURE_PROBLEM.openedBy.role,
  });

  return deepFreeze({
    world: () => worldUxOk(FIXTURE_WORLD),
    primaryProblem: () => worldUxOk(layer2Run.problem),
    clashConflicts: () => worldUxOk(clashConflicts),
    evidenceReport: () => worldUxOk(layer2Run.missingEvidence),
    constraintObservations: () => worldUxOk(stationConstraintObservations()),
    activeOperator: () => worldUxOk(operator),
    actions: () => worldUxOk(layer2Run.actions),
    checkGate: () => worldUxOk(layer2Run.checkGate),
    replayVerified: () => worldUxOk(replayRun.value.REPLAY.verified),
    quantityConsequence: () => worldUxOk(projectionOutcome.value),
    executionSequence: () => worldUxOk(sequenceOutcome.value),
    ghostOverlay: () => worldUxOk({ ghostScene: ghost.ghostScene, command: ghost.command }),
  });
}

/**
 * The REFERENCE world-station source double: the all-reference kit
 * (the P2 reference lane kit, the L3 default kit's reference doubles,
 * the P0-C reference simulation double).
 */
export function referenceWorldStationSources(): WorldStationSources {
  return stationSources({
    layer2: REFERENCE_LAYER2_KIT,
    lane3: () => defaultInteractiveSolutionLaneKit(),
    clashEngine: referenceClashPredicateDouble(),
    simulation: referenceSimulationDouble(),
  });
}

/** The alternate P3 lane kit (the L3 lane test's own construction,
 *  its BOQ-view double over the station's derived BOQ). */
function alternateLane3Kit(stationBoq: StationBoq): InteractiveSolutionLaneKit {
  return {
    nlParser: alternateNlCommandParserDouble(),
    clashEngine: alternateClashPredicateDouble(),
    boqView: alternateBoqGraphViewDouble([stationBoq]),
    usage: new SolutionSceneUsageAlternateDouble(defaultRealityPorts()),
    simulation: alternateSimulationDouble(),
    replayLedger: alternateReplayLedgerDouble(STATION_SOLUTION_ID, STATION_SOLUTION_VERSION),
  };
}

/**
 * The ALTERNATE world-station source double: the fully-alternate kit
 * (the P2 alternate lane kit, the L3 alternate clash/NL/BOQ/replay
 * doubles, the P0-C alternate simulation double). The substitution
 * test proves the station model is byte-identical over both kits.
 */
export function alternateWorldStationSources(): WorldStationSources {
  return stationSources({
    layer2: ALTERNATE_LAYER2_KIT,
    lane3: alternateLane3Kit,
    clashEngine: alternateClashPredicateDouble(),
    simulation: alternateSimulationDouble(),
  });
}
