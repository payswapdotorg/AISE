/**
 * backend/api — the WORLD STATION live sources (WORLD-P5 Mount 5).
 *
 * THE LIVE OCCUPANT of the `WorldStationSources` ports: the P4 wiring
 * doubles proved the ports sufficient over the committed fixtures;
 * THIS module swaps the LIVE occupant at the seam — the backend's OWN
 * governed state, read directly through the real stores (never over
 * HTTP to itself), mapped into the lane types the station binding
 * consumes, and bound through the SAME `bindWorldStation`.
 *
 * HONESTY LAWS (the mount's own):
 *   - every value maps from REAL backend records — nothing invented;
 *     sources the backend state cannot honestly populate answer typed
 *     nulls (the panel's honest EMPTY state — never a fabricated
 *     POPULATED);
 *   - the mapping decisions are recorded here and in the evidence:
 *     · `worldId` is a content-derived PROJECTION identity
 *       (canonicalDigestOf over {origin, projectId, versionId}) — the
 *       governed identity stays the backend's project/version ids,
 *       carried verbatim in scopeLabel/worldRevision;
 *     · `problemId` is likewise a projection digest carrying the case
 *       id; `questionKind` defaults to `condition_assessment` (the
 *       live case record carries no P2 classification — a declared
 *       projection default, recorded); `status` maps VERBATIM (the
 *       case vocabulary and the P2 problem vocabulary are identical:
 *       open/under_review/resolved/closed);
 *     · live reality nodes carry no declared geometry at P5 — the
 *       scene nodes project with `geometry: null` (the viewport
 *       renders what is declared: no meshes, an honest roster+panels);
 *   - determinism where the contract requires it (the station
 *     identity is content-derived — the same governed content
 *     produces the same stationId); honest liveness where it does not
 *     (`composedAt` is the serving clock — a LIVE record);
 *   - the unavailable-world law refuses the whole binding (never a
 *     partial station).
 */

import { CONTRACT_VERSION } from "@aise/shared-contracts";
import type { EngineeringProblem } from "@aise/world-layer2-experience";
import { PROBLEM_RECORD_KIND, PROBLEM_RECORD_SCHEMA_VERSION } from "@aise/world-layer2-experience";
import type { NavigableWorld } from "@aise/world-layer1-experience";
import type { ComposedScene, SceneNode, SiteFrame } from "@aise/world-reality-substrate";
import { IDENTITY_TRANSFORM } from "@aise/world-reality-substrate";
import type { WorldStationModel, WorldStationSources } from "@aise/world-ux";
import { bindWorldStation, canonicalDigestOf, worldUxOk } from "@aise/world-ux";
import type { RealityStore } from "../reality/store";
import type { GraphVersion } from "../reality/model";
import type { EngineeringCase } from "../cases/model";
import type { CaseStore } from "../cases/store";

/** The live station's initial camera (the declared framing default). */
export const LIVE_STATION_INITIAL_CAMERA = {
  position: [8, -8, 6] as const,
  target: [0, 0, 1] as const,
  up: [0, 0, 1] as const,
  fovRadians: 0.9,
  mode: "orbit" as const,
};

/** The LIVE world's site frame (a declared presentation default). */
const LIVE_SITE_FRAME: SiteFrame = { origin: [0, 0, 0], northHeading: 0, units: "metre" };

const LIVE_LAYER_ID = "live-reality";

function sceneKindOf(nodeKind: string): SceneNode["kind"] {
  if (nodeKind === "annotation") return "annotation";
  if (
    nodeKind === "project" || nodeKind === "site" || nodeKind === "building" ||
    nodeKind === "storey" || nodeKind === "space"
  ) {
    return "group";
  }
  return "element";
}

function revisionNumber(versionId: string): number {
  const numeric = /^v(\d+)$/.exec(versionId);
  return numeric === null ? 1 : Number.parseInt(numeric[1] ?? "1", 10);
}

/** Project one reality-graph version into the navigable-world value. */
export function projectLiveWorld(projectId: string, version: GraphVersion): NavigableWorld {
  const nodes: SceneNode[] = version.nodes.map((node) => ({
    elementId: node.nodeId,
    kind: sceneKindOf(node.kind),
    parentId: null,
    transform: IDENTITY_TRANSFORM,
    geometry: null, // no declared box geometry on live nodes at P5 — never an invented mesh
    material: null,
    layerIds: [LIVE_LAYER_ID],
    isGhost: false,
    evidenceContentIds: node.provenance
      .map((p) => p.evidenceId)
      .filter((id): id is string => id !== undefined),
    label: (() => {
      const nameProp = node.properties.find((p) => p.key === "name");
      return typeof nameProp?.value === "string" ? nameProp.value : null;
    })(),
  }));
  const scene: ComposedScene = {
    revision: revisionNumber(version.versionId),
    nodes,
    layers: [{ layerId: LIVE_LAYER_ID, name: "Live reality graph", visibleByDefault: true }],
    siteFrame: LIVE_SITE_FRAME,
    ghostSummary: null,
  };
  const worldId = canonicalDigestOf({
    origin: "live-reality-world",
    projectId,
    versionId: version.versionId,
  });
  const world: NavigableWorld = {
    worldId,
    worldRevision: revisionNumber(version.versionId),
    scene,
    elementProvenance: version.nodes.map((node) => ({
      elementId: node.nodeId,
      origin: "derived" as const, // the governed reality graph is the derivation source
      evidenceContentIds: node.provenance
        .map((p) => p.evidenceId)
        .filter((id): id is string => id !== undefined),
      externalLabels: [],
      fragmentId: null,
      declaredVolume: null,
    })),
    siteFrame: LIVE_SITE_FRAME,
    georeference: null, // honest: the live graph declares no georeference at P5
    coverage: null, // honest: no declared capture volumes on the live nodes
    // The LIVE projection's declared derivation (the lane's shape; the
    // method names the live mapping, the inputs name the governed ids).
    derivation: {
      contractVersion: "1.1.0",
      derivationId: `derive-live-world-${projectId}-${version.versionId}`,
      outputContentId: "",
      inputEvidenceContentIds: [],
      method: "live.world-project",
      methodVersion: "world-p5/1",
      parameters: {
        "live.projectId": projectId,
        "live.versionId": version.versionId,
        "live.nodes": String(version.nodes.length),
      },
      createdAt: version.createdAt,
    },
  };
  world.derivation.outputContentId = worldId;
  return world;
}

/** Project one engineering case into the P2 problem value (status VERBATIM). */
export function projectLiveProblem(
  worldRevision: number,
  caseRecord: EngineeringCase,
): EngineeringProblem {
  return {
    kind: PROBLEM_RECORD_KIND,
    schemaVersion: PROBLEM_RECORD_SCHEMA_VERSION,
    contractVersion: CONTRACT_VERSION,
    problemId: canonicalDigestOf({ origin: "live-case-problem", caseId: caseRecord.caseId }),
    title: caseRecord.title,
    statement: caseRecord.title, // the live case record carries no separate statement field at P5
    questionKind: "condition_assessment", // the declared projection default (recorded)
    status: caseRecord.status, // VERBATIM — the vocabularies are identical
    spatialBinding: {
      sceneRevision: worldRevision,
      elementIds: [],
      captureEvidenceContentIds: [],
    },
    openedBy: { actorId: "live-case-projection", role: "system" },
    openedAt: caseRecord.createdAt,
  };
}

export interface LiveWorldStationDeps {
  readonly realityStore: RealityStore | (() => RealityStore);
  readonly caseStore?: CaseStore | (() => CaseStore);
  readonly projectId: string;
  readonly caseId?: string | null;
  readonly composedAt: string;
}

export type BindLiveWorldStationResult =
  | { readonly ok: true; readonly station: WorldStationModel }
  | {
      readonly ok: false;
      readonly code: "project_not_found" | "binding_refused";
      readonly error: string;
    };

/**
 * Bind the LIVE world station: compose the live sources over the real
 * stores and run the SAME `bindWorldStation` the doubles proved. The
 * unavailable-world law refuses the binding (never a partial station).
 */
export async function bindLiveWorldStation(
  deps: LiveWorldStationDeps,
): Promise<BindLiveWorldStationResult> {
  const resolveStore = <T>(store: T | (() => T)): T =>
    typeof store === "function" ? (store as () => T)() : store;

  const realityStore = resolveStore(deps.realityStore);
  const index = await realityStore.getProject(deps.projectId);
  if (index === null) {
    return { ok: false, code: "project_not_found", error: `unknown project ${deps.projectId}` };
  }
  const version = await realityStore.getVersion(deps.projectId, index.latestVersionId);
  if (version === null) {
    return {
      ok: false,
      code: "binding_refused",
      error: `latest version ${index.latestVersionId} of ${deps.projectId} is missing`,
    };
  }
  const world = projectLiveWorld(deps.projectId, version);

  let problem: EngineeringProblem | null = null;
  if (deps.caseId !== null && deps.caseId !== undefined && deps.caseStore !== undefined) {
    const caseStore = resolveStore(deps.caseStore);
    const caseRecord = await caseStore.get(deps.caseId);
    if (caseRecord !== null) {
      problem = projectLiveProblem(world.worldRevision, caseRecord);
    }
  }

  const sources: WorldStationSources = {
    world: () => worldUxOk(world),
    primaryProblem: () => worldUxOk(problem),
    /* Sources the backend state cannot honestly populate at P5 —
     * typed nulls (the panels' honest EMPTY states). */
    clashConflicts: () => worldUxOk(null),
    evidenceReport: () => worldUxOk(null),
    constraintObservations: () => worldUxOk(null),
    activeOperator: () => worldUxOk(null),
    actions: () => worldUxOk(null),
    checkGate: () => worldUxOk(null),
    replayVerified: () => worldUxOk(null),
    quantityConsequence: () => worldUxOk(null),
    executionSequence: () => worldUxOk(null),
    ghostOverlay: () => worldUxOk(null),
  };

  const bound = bindWorldStation(sources, {
    scopeLabel: deps.projectId,
    composedAt: deps.composedAt,
    initialCamera: {
      position: [...LIVE_STATION_INITIAL_CAMERA.position] as [number, number, number],
      target: [...LIVE_STATION_INITIAL_CAMERA.target] as [number, number, number],
      up: [...LIVE_STATION_INITIAL_CAMERA.up] as [number, number, number],
      fovRadians: LIVE_STATION_INITIAL_CAMERA.fovRadians,
      mode: LIVE_STATION_INITIAL_CAMERA.mode,
    },
  });
  if (!bound.ok) {
    return { ok: false, code: "binding_refused", error: bound.failure.detail };
  }
  return { ok: true, station: bound.value };
}

