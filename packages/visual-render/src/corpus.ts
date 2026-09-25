/**
 * HFX-303 — the visual lane's DEMO CORPUS (the eval-module fixture pattern).
 *
 * The committed corpus of canonical solution states the visual-eval runner
 * drills, mirroring the fixtures discipline of the solution-eval and
 * equivalence-eval modules (a corpus of cases assembled over the
 * DETERMINISTIC engine's public surface — imported, never modified):
 *
 *  1. `demo-world-baseline`      — the demo wall-upgrade world's LAYER 0
 *     (the pure baseline overlay — "the demo world state");
 *  2. `demo-world-multi-operation` — the same world's FINAL layer (after
 *     the demolition-removal + block-wall-placement + plaster-application
 *     sequence — "one multi-operation state");
 *  3. `edge-empty-projection`    — an edge/boundary state: a solution whose
 *     observed scene carries no elements and whose single operation anchors
 *     to nothing drawable — the canonical projections are EMPTY (the
 *     honest-empty discipline: the visual renders the empty notice and NO
 *     illustrative additions).
 *
 * Every case is ENGINE-PRODUCED (replaySolution over the contract's
 * committed intent fixtures, read by reference through the contract's
 * public fixtures loader) and carries:
 *  - the canonical state identity (stateId, stateIndex, applied ids,
 *    stateContentDigest — the engine's own derivations, carried verbatim);
 *  - the CANONICAL PROJECTIONS: the observed demo scene's world-metre
 *    polygons plus the engine-recorded operations' overlay polygons,
 *    projected with the documented AISE-021 formulas (see the mirror
 *    notes below);
 *  - the serialized canonical state/version bytes for the runner's
 *    before/after byte-comparisons;
 *  - the quantity inventory + validation snapshot inputs for the
 *    non-interference drill (re-derived live by the runner through the
 *    engine's public surface).
 *
 * DOCUMENTED MIRRORS (the house discipline — local copies pinned by
 * cross-check tests, never silent forks):
 *  - the demo world constants mirror `packages/solution-engine/src/testkit.ts`'s
 *    WALL_WORLD (same ids, same fixed instants — assembled here from
 *    PUBLIC surfaces only);
 *  - the demo baseline geometry table mirrors the engine's committed
 *    `fixtures/baseline-geometry.json`;
 *  - the observed scene mirrors `apps/web/src/solution/demo-world.ts`
 *    (the PROD-031 browser-safe demo scene — same world-metre polygons);
 *  - the overlay projection mirrors `apps/web/src/solution/viewer/model.ts`'s
 *    `overlayOfOperation` for the corpus's operation subset (the
 *    apps-side cross-check test proves the mirror equals the workspace
 *    implementation for the same version + scene);
 *  - the axonometric/plan formulas are the documented AISE-021 projections
 *    (the same formulas in the workspace, solution and intervention
 *    viewers), under the solution workspace's default view.
 *
 * Deterministic: committed fixtures + fixed instants + pure computation;
 * no clock, no network, no randomness.
 */

import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  createOperationIntent,
  decodeEngineeringOperationIntent,
  type EngineeringOperation,
  type EngineeringOperationIntent,
  type OperationTarget,
  type ProposedState,
  type SolutionVersion,
} from "@aise/solution-contract";
import { loadCommittedFixtures } from "@aise/solution-contract/fixtures-loader";
import {
  TableBaselineGeometryResolver,
  deriveStateQuantities,
  fixedMaterializeClock,
  replaySolution,
  resolveNumericParameter,
  validateSolutionVersion,
  type BaselineGeometryResolver,
} from "@aise/solution-engine";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type {
  CanonicalProjectionShape,
  CanonicalProjectionSnapshot,
  VisualStateRequest,
} from "./port";
import type { VisualClass } from "./descriptor";

/* ------------------------------------------------------------------ */
/* The demo world (documented mirror of the engine testkit's WALL_WORLD) */
/* ------------------------------------------------------------------ */

export const DEMO_VISUAL_WORLD = Object.freeze({
  solutionId: "solution-demo-001",
  projectId: "proj-demo-001",
  title: "Ground-floor wall upgrade solution",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged section must be removed, rebuilt with concrete blocks and re-plastered.",
  baselineRealityVersionId: "rgv-demo-0007",
  createdAt: "2026-09-16T08:00:00.000Z",
  materializeBase: "2026-09-16T10:00:00.000Z",
  validatedAt: "2026-09-16T12:00:00.000Z",
} as const);

/** The edge world (the empty-projection boundary case). */
export const EDGE_VISUAL_WORLD = Object.freeze({
  solutionId: "solution-visual-edge-001",
  projectId: "proj-demo-001",
  title: "Visual lane edge case — unanchored standalone wall",
  problemStatement:
    "An edge-case solution whose single operation anchors to no observed scene element: the canonical projections are empty and the visual must render the honest empty notice.",
  baselineRealityVersionId: "rgv-edge-empty-0001",
  createdAt: "2026-09-16T08:00:00.000Z",
  materializeBase: "2026-09-16T10:00:00.000Z",
  validatedAt: "2026-09-16T12:00:00.000Z",
} as const);

/**
 * The demo baseline geometry table — documented mirror of the engine's
 * committed `fixtures/baseline-geometry.json` (surface-area facts in m²).
 */
export function demoBaselineGeometryTable(): Record<
  string,
  { value: number; unit: string }
> {
  return {
    "geo-wall-faces-002": { value: 12.5, unit: "m2" },
    "geo-wall-line-003": { value: 5, unit: "m2" },
    "geo-slab-region-005": { value: 12, unit: "m2" },
    "geo-pit-outline-001": { value: 6, unit: "m2" },
  };
}

/** The read-only demo baseline geometry resolver (engine public surface). */
export function demoBaselineGeometryResolver(): BaselineGeometryResolver {
  return new TableBaselineGeometryResolver(demoBaselineGeometryTable());
}

/* ------------------------------------------------------------------ */
/* The observed demo scene (documented mirror of demo-world.ts)          */
/* ------------------------------------------------------------------ */

/** A world-metre polygon. */
export type WorldPolygon = readonly (readonly [number, number, number])[];

/** One observed scene element (the mirror of the PROD-031 demo scene). */
export interface ObservedSceneElementMirror {
  readonly elementId: string;
  readonly geometryRef: string;
  readonly nodeRefs: readonly string[];
  readonly polygons: readonly WorldPolygon[];
  readonly anchor: {
    readonly origin: readonly [number, number, number];
    readonly lengthAxis: readonly [number, number, number];
    readonly outAxis: readonly [number, number, number];
    readonly anchorLength: number;
    readonly anchorHeight: number;
  };
}

/** The observed demo scene (mirrored from apps/web/src/solution/demo-world.ts). */
export function demoObservedSceneElements(): readonly ObservedSceneElementMirror[] {
  return [
    {
      // The damaged wall's south elevation: 5 m × 2.5 m at y = 0.
      elementId: "node-wall-002",
      geometryRef: "geo-wall-faces-002",
      nodeRefs: ["node-wall-002"],
      polygons: [
        [
          [0, 0, 0],
          [5, 0, 0],
          [5, 0, 2.5],
          [0, 0, 2.5],
        ],
      ],
      anchor: {
        origin: [0, 0, 0],
        lengthAxis: [1, 0, 0],
        outAxis: [0, -1, 0],
        anchorLength: 5,
        anchorHeight: 2.5,
      },
    },
    {
      // The wall's plan footprint: 5 m × 0.24 m.
      elementId: "geo-wall-line-003",
      geometryRef: "geo-wall-line-003",
      nodeRefs: ["node-wall-002"],
      polygons: [
        [
          [0, 0, 0],
          [5, 0, 0],
          [5, 0.24, 0],
          [0, 0.24, 0],
        ],
      ],
      anchor: {
        origin: [0, 0, 0],
        lengthAxis: [1, 0, 0],
        outAxis: [0, 1, 0],
        anchorLength: 5,
        anchorHeight: 2.5,
      },
    },
    {
      // The ground-floor slab in front of the wall.
      elementId: "node-slab-003",
      geometryRef: "geo-slab-region-004",
      nodeRefs: ["node-slab-003"],
      polygons: [
        [
          [0, -4, 0],
          [5, -4, 0],
          [5, 0, 0],
          [0, 0, 0],
        ],
      ],
      anchor: {
        origin: [0, -4, 0],
        lengthAxis: [1, 0, 0],
        outAxis: [0, 1, 0],
        anchorLength: 5,
        anchorHeight: 0,
      },
    },
    {
      // The open ground south of the building.
      elementId: "node-site-001",
      geometryRef: "geo-pit-outline-001",
      nodeRefs: ["node-site-001"],
      polygons: [
        [
          [-2, -1, 0],
          [8, -1, 0],
          [8, -6, 0],
          [-2, -6, 0],
        ],
      ],
      anchor: {
        origin: [1, -4, 0],
        lengthAxis: [1, 0, 0],
        outAxis: [0, 1, 0],
        anchorLength: 4,
        anchorHeight: 0,
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The AISE-021 projection formulas (documented local copy)              */
/* ------------------------------------------------------------------ */

/**
 * The canonical axonometric view of the corpus — the solution workspace's
 * default (documented mirror of `apps/web/src/solution/model.ts`'s
 * DEFAULT_VIEW_PARAMS: azimuth 30°, elevation 36°).
 */
export const CORPUS_VIEW = Object.freeze({
  azimuthRad: Math.PI / 6,
  elevationRad: Math.PI / 5,
} as const);

/** 1 µm quantization with −0 canonicalization (the AISE-021 discipline). */
function quantize(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/** The documented axonometric projection of one world point. */
function projectAxonometric(
  point: readonly [number, number, number],
  view: { azimuthRad: number; elevationRad: number },
): readonly [number, number] {
  const [x, y, z] = point;
  const sinAz = Math.sin(view.azimuthRad);
  const cosAz = Math.cos(view.azimuthRad);
  const sinEl = Math.sin(view.elevationRad);
  const cosEl = Math.cos(view.elevationRad);
  return [
    quantize(x * sinAz - y * cosAz),
    quantize(x * cosAz * sinEl + y * sinAz * sinEl - z * cosEl),
  ];
}

/** The documented plan projection: (x, y, z) ↦ (x, −y), north up. */
function projectPlan(point: readonly [number, number, number]): readonly [number, number] {
  return [quantize(point[0]), quantize(-point[1])];
}

/* ------------------------------------------------------------------ */
/* The overlay projection (documented mirror of the workspace subset)    */
/* ------------------------------------------------------------------ */

function metresOf(operation: EngineeringOperation, name: string): number | undefined {
  const parameter = operation.parameters.find((entry) => entry.name === name);
  if (parameter === undefined) {
    return undefined;
  }
  const resolved = resolveNumericParameter(parameter, "linear");
  return resolved.ok ? resolved.resolved.canonicalValue : undefined;
}

function vecAdd(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecScale(
  v: readonly [number, number, number],
  k: number,
): [number, number, number] {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function groundQuad(
  origin: readonly [number, number, number],
  lengthAxis: readonly [number, number, number],
  outAxis: readonly [number, number, number],
  length: number,
  width: number,
  z: number,
): WorldPolygon {
  const base: [number, number, number] = [origin[0], origin[1], origin[2] + z];
  return [
    base,
    vecAdd(base, vecScale(lengthAxis, length)),
    vecAdd(vecAdd(base, vecScale(lengthAxis, length)), vecScale(outAxis, width)),
    vecAdd(base, vecScale(outAxis, width)),
  ];
}

/** The direction of an operation's overlay (from its recorded effects). */
function overlayDirectionOf(operation: EngineeringOperation): string {
  for (const effect of operation.effects) {
    if (effect.effectKind === "quantity-impact" && effect.direction !== undefined) {
      return effect.direction;
    }
  }
  return "changed";
}

/**
 * Projects one ENGINE-RECORDED operation into overlay polygons — the
 * documented mirror of the workspace viewer's `overlayOfOperation` for the
 * corpus's operation subset (demolition-removal, block-wall-placement,
 * plaster-application). An operation that anchors to no scene element, or
 * whose parameters cannot be resolved, answers NO overlay (the caller
 * records an honest omission — geometry is never invented).
 */
function overlayPolygonsOf(
  operation: EngineeringOperation,
  scene: readonly ObservedSceneElementMirror[],
): { polygons: readonly WorldPolygon[]; anchoredElementId: string } | undefined {
  const element = scene.find(
    (candidate) =>
      candidate.geometryRef === operation.target.geometryRefs[0]?.ref ||
      candidate.nodeRefs.some((ref) => operation.target.nodeRefs.includes(ref)),
  );
  if (element === undefined) {
    return undefined;
  }
  const anchor = element.anchor;
  const origin = anchor.origin;
  const lengthAxis = anchor.lengthAxis;
  const outAxis = anchor.outAxis;
  switch (operation.operationType) {
    case "demolition-removal": {
      const length = metresOf(operation, "length") ?? anchor.anchorLength;
      const height = metresOf(operation, "height") ?? anchor.anchorHeight;
      const face: WorldPolygon = [
        origin,
        vecAdd(origin, vecScale(lengthAxis, length)),
        [
          origin[0] + lengthAxis[0] * length,
          origin[1] + lengthAxis[1] * length,
          origin[2] + height,
        ],
        [origin[0], origin[1], origin[2] + height],
      ];
      return { polygons: [face], anchoredElementId: element.elementId };
    }
    case "block-wall-placement": {
      const length = metresOf(operation, "length") ?? anchor.anchorLength;
      const height =
        metresOf(operation, "height") ??
        metresOf(operation, "depth") ??
        metresOf(operation, "thickness") ??
        0.2;
      const thickness =
        metresOf(operation, "thickness") ?? metresOf(operation, "width") ?? 0.2;
      if (length <= 0 || height <= 0 || thickness <= 0) {
        return undefined;
      }
      const outer = groundQuad(origin, lengthAxis, outAxis, length, thickness, 0);
      const top = groundQuad(origin, lengthAxis, outAxis, length, thickness, height);
      return { polygons: [outer, top], anchoredElementId: element.elementId };
    }
    case "plaster-application": {
      const thickness = metresOf(operation, "thickness") ?? 0.02;
      const length = anchor.anchorLength;
      const height = anchor.anchorHeight;
      const offset = vecScale(outAxis, thickness);
      const face: WorldPolygon = [
        vecAdd(origin, offset),
        vecAdd(vecAdd(origin, vecScale(lengthAxis, length)), offset),
        vecAdd(vecAdd(origin, vecScale(lengthAxis, length)), [
          offset[0],
          offset[1],
          offset[2] + height,
        ]),
        vecAdd(origin, [offset[0], offset[1], offset[2] + height]),
      ];
      return { polygons: [face], anchoredElementId: element.elementId };
    }
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Intent assembly (committed fixtures by reference + the edge intent)   */
/* ------------------------------------------------------------------ */

function contractIntentByFile(fileName: string): EngineeringOperationIntent {
  const corpus = loadCommittedFixtures();
  const fixture = corpus.fixtures.find((entry) => entry.fileName === fileName);
  if (fixture === undefined) {
    throw new Error(`the committed contract fixture '${fileName}' was not found`);
  }
  return decodeEngineeringOperationIntent(fixture.payload);
}

/** The canonical wall-upgrade intent sequence (contract corpus, by reference). */
export function wallUpgradeIntents(): EngineeringOperationIntent[] {
  return [
    contractIntentByFile("operation/EngineeringOperationIntent.valid-demolition-removal.json"),
    contractIntentByFile("operation/EngineeringOperationIntent.valid-block-wall-placement.json"),
    contractIntentByFile("operation/EngineeringOperationIntent.valid-plaster-application.json"),
  ];
}

/** The edge case's standalone intent (built through the ONE constructor). */
export function edgeStandaloneIntent(): EngineeringOperationIntent {
  const target: OperationTarget = {
    contractVersion: "1.0.0",
    selectorKind: "line-extent",
    nodeRefs: ["node-edge-standalone-001"],
    geometryRefs: [{ kind: "plane", ref: "geo-edge-line-999", contractVersion: "1.0.0" }],
    units: { linear: "m", angular: "rad" },
    description: "a standalone edge-case wall line with no observed scene anchor",
  };
  return createOperationIntent({
    intentId: "intent-visual-edge-0001",
    operationType: "block-wall-placement",
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [
      { name: "length", value: 3, unit: "m" },
      { name: "height", value: 2, unit: "m" },
      { name: "thickness", value: 0.2, unit: "m" },
      { name: "material", value: "concrete-block" },
    ],
    target,
    provenance: {
      origin: "direct-manipulation",
      authoredBy: "user-demo-engineer",
      authoredAt: "2026-09-16T09:00:00.000Z",
      evidenceIds: [],
      derivationNote: "operator dimensioned the edge-case operation in the interactive 3D view",
    },
    proposedTo: { solutionId: EDGE_VISUAL_WORLD.solutionId, versionNumber: 1 },
  });
}

/* ------------------------------------------------------------------ */
/* Replays (the engine's public surface, verbatim)                       */
/* ------------------------------------------------------------------ */

function replayOrThrow(input: Parameters<typeof replaySolution>[0]): SolutionVersion {
  const result = replaySolution(input);
  if (result.outcome === "failed") {
    throw new Error(
      `the corpus replay failed at step ${String(result.failedAtStep)}: ${result.failure.reasons
        .map((reason) => reason.code)
        .join(", ")}`,
    );
  }
  return result.version;
}

/** Replays the demo wall-upgrade world (4 layers: 0..3). */
export function replayDemoWorld(): SolutionVersion {
  return replayOrThrow({
    solutionId: DEMO_VISUAL_WORLD.solutionId,
    projectId: DEMO_VISUAL_WORLD.projectId,
    title: DEMO_VISUAL_WORLD.title,
    problemStatement: DEMO_VISUAL_WORLD.problemStatement,
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: DEMO_VISUAL_WORLD.baselineRealityVersionId,
    intents: wallUpgradeIntents(),
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: fixedMaterializeClock(DEMO_VISUAL_WORLD.materializeBase),
    createdAt: DEMO_VISUAL_WORLD.createdAt,
    baselineGeometry: demoBaselineGeometryResolver(),
  });
}

/** Replays the edge world (2 layers: 0..1, the empty-projection case). */
export function replayEdgeWorld(): SolutionVersion {
  return replayOrThrow({
    solutionId: EDGE_VISUAL_WORLD.solutionId,
    projectId: EDGE_VISUAL_WORLD.projectId,
    title: EDGE_VISUAL_WORLD.title,
    problemStatement: EDGE_VISUAL_WORLD.problemStatement,
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: EDGE_VISUAL_WORLD.baselineRealityVersionId,
    intents: [edgeStandaloneIntent()],
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: fixedMaterializeClock(EDGE_VISUAL_WORLD.materializeBase),
    createdAt: EDGE_VISUAL_WORLD.createdAt,
    baselineGeometry: demoBaselineGeometryResolver(),
  });
}

/* ------------------------------------------------------------------ */
/* Canonical projection snapshots                                        */
/* ------------------------------------------------------------------ */

/** The honest omission reason of an unanchorable operation overlay. */
export const OVERLAY_OMISSION_REASON = "overlay-anchor-unresolved" as const;

function snapshotOf(
  mode: "plan" | "axonometric",
  scene: readonly ObservedSceneElementMirror[],
  version: SolutionVersion,
  stateIndex: number,
): CanonicalProjectionSnapshot {
  const shapes: CanonicalProjectionShape[] = [];
  const omissions: { nodeId: string; reason: string }[] = [];

  // The observed scene: the pinned baseline reality's polygons.
  for (const element of scene) {
    for (const [index, polygon] of element.polygons.entries()) {
      shapes.push({
        nodeId: index === 0 ? element.elementId : `${element.elementId}#${String(index)}`,
        geometryId: element.geometryRef,
        points: polygon.map((point) =>
          mode === "plan" ? projectPlan(point) : projectAxonometric(point, CORPUS_VIEW),
        ),
        origin: "observed",
      });
    }
  }

  // The applied operations' overlays (the state's own proposed content).
  const applied = new Set(version.states[stateIndex]?.appliedOperationIds ?? []);
  for (const operation of version.operations) {
    if (!applied.has(operation.operationId)) {
      continue;
    }
    const overlay = overlayPolygonsOf(operation, scene);
    if (overlay === undefined) {
      omissions.push({ nodeId: operation.operationId, reason: OVERLAY_OMISSION_REASON });
      continue;
    }
    for (const [index, polygon] of overlay.polygons.entries()) {
      shapes.push({
        nodeId:
          index === 0 ? operation.operationId : `${operation.operationId}#${String(index)}`,
        points: polygon.map((point) =>
          mode === "plan" ? projectPlan(point) : projectAxonometric(point, CORPUS_VIEW),
        ),
        origin: `proposed-${overlayDirectionOf(operation)}`,
      });
    }
  }

  return { mode, shapes, omissions };
}

/** Builds the visual state request for one corpus state. */
export function visualRequestForState(
  version: SolutionVersion,
  stateIndex: number,
  scene: readonly ObservedSceneElementMirror[],
  visualClass: VisualClass,
): VisualStateRequest {
  const found: ProposedState | undefined = version.states[stateIndex];
  if (found === undefined) {
    throw new Error(`the version carries no state at index ${String(stateIndex)}`);
  }
  const state: ProposedState = found;
  return {
    kind: "visual-state-request",
    visualClass,
    state: {
      solutionId: state.solutionId,
      versionRef: `v${String(state.versionNumber)}`,
      stateId: state.stateId,
      stateIndex: state.stateIndex,
      appliedOperationIds: [...state.appliedOperationIds],
      ...(state.contentDigest === undefined
        ? {}
        : { stateContentDigest: state.contentDigest }),
    },
    canonicalProjections: {
      plan: snapshotOf("plan", scene, version, stateIndex),
      axonometric: snapshotOf("axonometric", scene, version, stateIndex),
    },
  };
}

/* ------------------------------------------------------------------ */
/* The corpus                                                           */
/* ------------------------------------------------------------------ */

/** One corpus case: everything the runner's drills need, engine-produced. */
export interface VisualCorpusCase {
  readonly caseId: string;
  readonly description: string;
  readonly visualClass: VisualClass;
  readonly request: VisualStateRequest;
  readonly version: SolutionVersion;
  readonly state: ProposedState;
  /** Canonical JSON of the state record (the byte-comparison subject). */
  readonly canonicalStateBytes: string;
  /** Canonical JSON of the whole version (the Solution Graph state). */
  readonly canonicalVersionBytes: string;
  /** Canonical JSON of the state's derived quantity inventory. */
  readonly canonicalQuantitiesBytes: string;
  /** Canonical JSON of the version's validation snapshot. */
  readonly canonicalValidationBytes: string;
}

function corpusCase(
  caseId: string,
  description: string,
  visualClass: VisualClass,
  version: SolutionVersion,
  stateIndex: number,
  scene: readonly ObservedSceneElementMirror[],
): VisualCorpusCase {
  const state = version.states[stateIndex];
  if (state === undefined) {
    throw new Error(`corpus case '${caseId}': no state at index ${String(stateIndex)}`);
  }
  const quantities = deriveStateQuantities(version, stateIndex);
  const validation = validateSolutionVersion({
    version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    validatedAt: DEMO_VISUAL_WORLD.validatedAt,
    baselineGeometry: demoBaselineGeometryResolver(),
  });
  return {
    caseId,
    description,
    visualClass,
    request: visualRequestForState(version, stateIndex, scene, visualClass),
    version,
    state,
    canonicalStateBytes: canonicalJsonStringify(state),
    canonicalVersionBytes: canonicalJsonStringify(version),
    canonicalQuantitiesBytes: canonicalJsonStringify(quantities),
    canonicalValidationBytes: canonicalJsonStringify(validation),
  };
}

/**
 * Builds the committed visual corpus (deterministic — identical bytes on
 * every build): the demo world's baseline and multi-operation layers plus
 * the empty-projection edge case.
 */
export function buildVisualCorpus(): readonly VisualCorpusCase[] {
  const demo = replayDemoWorld();
  const edge = replayEdgeWorld();
  const scene = demoObservedSceneElements();
  return [
    corpusCase(
      "demo-world-baseline",
      "the demo wall-upgrade world's layer 0 — the pure baseline overlay (the demo world state)",
      "elevation-hypothesis",
      demo,
      0,
      scene,
    ),
    corpusCase(
      "demo-world-multi-operation",
      "the demo world's final layer — after demolition-removal, block-wall-placement and plaster-application (the multi-operation state)",
      "elevation-hypothesis",
      demo,
      demo.states.length - 1,
      scene,
    ),
    corpusCase(
      "edge-empty-projection",
      "an edge/boundary state — no observed scene elements and one unanchorable operation: the canonical projections are empty (the honest-empty case)",
      "context-sketch",
      edge,
      edge.states.length - 1,
      [],
    ),
  ];
}

/** Finds one corpus case by id (deterministic). */
export function visualCorpusCaseOf(
  caseId: string,
): VisualCorpusCase | undefined {
  return buildVisualCorpus().find((entry) => entry.caseId === caseId);
}
