/**
 * WORLD-P4 — the spatial surface family contract: the world STATION
 * surface — the composed scene the primary experience opens into, with
 * the ghost discipline, identity quarantine and the typed
 * camera/selection operations (handoff §4 "Engineer interaction";
 * seam laws #1, #2, #5, #7, #9).
 *
 * THE STATION SCENE is assembled from:
 *   - the P0-A `ComposedScene` scene-composition types (the substrate-
 *     neutral input model every runtime adapter consumes), produced by
 *     the P1 world lane (captured/plan reality);
 *   - the P3 authoring family's ghost composition (`composeGhostScene`
 *     output): proposed states present as GHOST nodes, visually
 *     distinct, never confused with captured reality (the
 *     ghost-distinctness law end-to-end);
 *   - the P0-C scene-usage contract's proposed-state presentation
 *     status (authored/proposed), composed here as element status.
 *
 * LAW #5 (GHOST-REMOVED RESOLVABILITY — the P3 wiring note): an
 * element id deleted by a ghost operation STAYS RESOLVABLE: it
 * resolves with status `proposed-removed` and its captured node
 * intact. The runtime overlay owns the VISUAL removal; the identity
 * never dangles, and any HUD/selection reference keeps answering.
 *
 * LAW #7 (IDENTITY QUARANTINE): pick/selection requests carrying a
 * substrate-shaped id are REFUSED (the lanes' `looksLikeSubstrateId`
 * discipline, composed at the UX boundary). Canonical AISE identity
 * only — never a substrate object id.
 *
 * THE CAMERA/NAVIGATION OPERATIONS are typed pure transforms over the
 * P0-A `CameraState` (walk/orbit/fly — the handoff's "walk/orbit/fly
 * through the model"), composing the P1 layer-toggle navigation
 * vocabulary for visibility.
 */

import {
  looksLikeSubstrateId,
} from "@aise/world-layer1-experience";
import type {
  LayerToggle,
  NavigableWorld,
  WorldViewState,
} from "@aise/world-layer1-experience";
import { applyLayerToggles } from "@aise/world-layer1-experience";
import type {
  CameraState,
  ComposedScene,
  GhostSetSummary,
  SceneElementId,
  SceneNode,
  SelectionState,
} from "@aise/world-reality-substrate";
import { validateScene } from "@aise/world-reality-substrate";
import type { AuthoredCommand } from "@aise/world-layer3-experience";
import { checkOperationProvenance } from "@aise/solution-contract";
import {
  deepFreeze,
  worldUxRefused,
  type WorldUxOutcome,
} from "../seam";

/* ------------------------------------------------------------------ */
/* The element status vocabulary (captured vs plan vs proposed)         */
/* ------------------------------------------------------------------ */

/**
 * The station element statuses — a CLOSED vocabulary composing the
 * P1 element origins with the P3 authored/proposed states:
 *
 *   captured        an observed reality element (P1 capture origin);
 *   plan            a plan/BIM model element (P1 plan origin);
 *   capture-asset   a placed capture asset (photo/video cloud or mesh);
 *   annotation      a measurement/annotation node;
 *   proposed-ghost  a PROPOSED element (ghost node — P3 authoring);
 *   proposed-removed an element a ghost operation REMOVES (law #5:
 *                   still resolvable, captured node intact).
 */
export const STATION_ELEMENT_STATUSES = [
  "captured",
  "plan",
  "capture-asset",
  "annotation",
  "proposed-ghost",
  "proposed-removed",
] as const;
export type StationElementStatus = (typeof STATION_ELEMENT_STATUSES)[number];

/** Type guard: a station element status from the closed set. */
export function isStationElementStatus(
  value: unknown,
): value is StationElementStatus {
  return (
    typeof value === "string" &&
    (STATION_ELEMENT_STATUSES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The ghost overlay input (what the P3 authoring family supplies)      */
/* ------------------------------------------------------------------ */

/**
 * The ghost overlay input: an authored command's ghost composition
 * over the base world scene — the P3 `composeGhostScene` output (a
 * ComposedScene carrying the ghost node(s) + ghostSummary) plus the
 * authored command itself (for the provenance guard, law #6).
 */
export interface GhostOverlayInput {
  /** The ghost-composed scene (P3 `composeGhostScene` output). */
  readonly ghostScene: ComposedScene;
  /** The authored command that produced the ghost (provenance guard). */
  readonly command: AuthoredCommand;
}

/* ------------------------------------------------------------------ */
/* The station scene model                                              */
/* ------------------------------------------------------------------ */

/** One element's status entry (the station's status index). */
export interface StationElementStatusEntry {
  readonly elementId: SceneElementId;
  readonly status: StationElementStatus;
  /** True iff the element presents as a ghost (proposed) node. */
  readonly isGhost: boolean;
}

/**
 * The composed station scene: the base world + the ghost overlay,
 * with the per-element status index (law #5: ghost-REMOVED ids stay
 * in the index with `proposed-removed`).
 */
export interface StationSceneModel {
  /** The composition revision (max of base + ghost revisions). */
  readonly stationRevision: number;
  /** The base world scene (captured/plan reality — P1). */
  readonly baseScene: ComposedScene;
  /** The ghost-composed scene (P3) — the presentation input. */
  readonly ghostScene: ComposedScene;
  /** The ghost set summary (proposed + removed element ids). */
  readonly ghostSummary: GhostSetSummary | null;
  /** The per-element status index (base elements + ghost elements). */
  readonly elementStatus: readonly StationElementStatusEntry[];
  /** The authored command behind the current ghost, when one is active. */
  readonly activeCommand: AuthoredCommand | null;
}

/** Classify a base-scene node's P1 origin into the status vocabulary. */
function baseStatusOf(node: SceneNode): StationElementStatus {
  if (node.isGhost) {
    return "proposed-ghost";
  }
  switch (node.kind) {
    case "capture_cloud":
    case "capture_mesh":
      return "capture-asset";
    case "annotation":
    case "measurement":
      return "annotation";
    case "plan_model":
      return "plan";
    case "ghost":
      return "proposed-ghost";
    default:
      return "captured";
  }
}

/**
 * Assemble the station scene: the base world + the ghost overlay.
 *
 * LAWS ENFORCED (fail-closed):
 *   - the base scene and the ghost scene must be structurally valid
 *     (the P0-A `validateScene` violations are typed refusals);
 *   - the ghost scene must be an OVERLAY of the base (same base nodes
 *     present; the ghost composition only ADDS ghost nodes and marks
 *     removals — a ghost scene that mutates captured reality is an
 *     operation-semantic refusal);
 *   - the authored command's provenance must satisfy the
 *     solution-contract invariant (law #6:
 *     `missing_operation_provenance` refuses the composition);
 *   - every ghostSummary.removedElementIds entry stays in the status
 *     index with `proposed-removed` (law #5).
 *
 * PURE + DETERMINISTIC.
 */
export function composeStationScene(
  baseScene: ComposedScene,
  ghostOverlay: GhostOverlayInput | null,
): WorldUxOutcome<StationSceneModel> {
  const baseViolations = validateScene(baseScene);
  if (baseViolations.length > 0) {
    return worldUxRefused<StationSceneModel>(
      "surface",
      "contract-mismatch",
      `surface: base scene is structurally invalid: ${baseViolations.join("; ")}`,
    );
  }
  if (ghostOverlay === null) {
    const elementStatus = baseScene.nodes.map((node) =>
      deepFreeze({
        elementId: node.elementId,
        status: baseStatusOf(node),
        isGhost: node.isGhost,
      }),
    );
    return {
      ok: true,
      value: deepFreeze({
        stationRevision: baseScene.revision,
        baseScene,
        ghostScene: baseScene,
        ghostSummary: null,
        elementStatus,
        activeCommand: null,
      }),
    };
  }

  /* Law #6: the authored command's provenance guard. */
  const provenanceFindings = checkOperationProvenance(
    ghostOverlay.command.intent.provenance,
  );
  if (provenanceFindings.length > 0) {
    const firstFinding = provenanceFindings[0]!;
    return worldUxRefused<StationSceneModel>(
      "surface",
      "operation-semantic-failure",
      `surface: authored command ${ghostOverlay.command.operationId} refused — ${firstFinding.code}: ${firstFinding.detail}`,
    );
  }

  const ghostScene = ghostOverlay.ghostScene;
  const ghostViolations = validateScene(ghostScene);
  if (ghostViolations.length > 0) {
    return worldUxRefused<StationSceneModel>(
      "surface",
      "contract-mismatch",
      `surface: ghost scene is structurally invalid: ${ghostViolations.join("; ")}`,
    );
  }

  /* The overlay law: the ghost composition must not mutate captured
   * reality — every base node must be present, unchanged, in the
   * ghost scene (composeGhostScene composes an overlay; it never
   * rewrites the base). */
  const baseById = new Map(baseScene.nodes.map((node) => [node.elementId, node]));
  const ghostById = new Map(ghostScene.nodes.map((node) => [node.elementId, node]));
  for (const [elementId, baseNode] of baseById) {
    const ghostNode = ghostById.get(elementId);
    if (ghostNode === undefined) {
      return worldUxRefused<StationSceneModel>(
        "surface",
        "operation-semantic-failure",
        `surface: ghost scene dropped base element ${elementId} — the ghost composition is an overlay, never a mutation of captured reality`,
      );
    }
    if (ghostNode.isGhost !== baseNode.isGhost) {
      return worldUxRefused<StationSceneModel>(
        "surface",
        "operation-semantic-failure",
        `surface: ghost scene flipped the ghost flag of base element ${elementId} — captured reality is never mutated`,
      );
    }
  }

  /* The status index: base elements first (captured/plan/asset/
   * annotation), then the ghost additions (proposed-ghost), then the
   * removals (proposed-removed — law #5: STAY RESOLVABLE). */
  const elementStatus: StationElementStatusEntry[] = baseScene.nodes.map(
    (node) =>
      deepFreeze({
        elementId: node.elementId,
        status: baseStatusOf(node),
        isGhost: node.isGhost,
      }),
  );
  for (const node of ghostScene.nodes) {
    if (!baseById.has(node.elementId)) {
      elementStatus.push(
        deepFreeze({
          elementId: node.elementId,
          status: node.isGhost ? "proposed-ghost" : baseStatusOf(node),
          isGhost: node.isGhost,
        }),
      );
    }
  }
  const ghostSummary =
    ghostScene.ghostSummary === null ? null : ghostScene.ghostSummary;
  if (ghostSummary !== null) {
    for (const removedId of ghostSummary.removedElementIds) {
      const entry = elementStatus.find((entry) => entry.elementId === removedId);
      if (entry === undefined) {
        return worldUxRefused<StationSceneModel>(
          "surface",
          "operation-semantic-failure",
          `surface: ghost removal names unknown element ${removedId} — removals must reference base elements`,
        );
      }
      const index = elementStatus.indexOf(entry);
      elementStatus[index] = deepFreeze({
        elementId: removedId,
        status: "proposed-removed",
        isGhost: false,
      });
    }
  }

  return {
    ok: true,
    value: deepFreeze({
      stationRevision: Math.max(baseScene.revision, ghostScene.revision),
      baseScene,
      ghostScene,
      ghostSummary,
      elementStatus,
      activeCommand: ghostOverlay.command,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Element resolution (law #5: ghost-removed ids stay resolvable)       */
/* ------------------------------------------------------------------ */

/** One resolved station element. */
export interface StationElementResolution {
  readonly elementId: SceneElementId;
  readonly status: StationElementStatus;
  readonly isGhost: boolean;
  /**
   * The element's node in the GHOST scene (the presentation input):
   * the ghost node for proposed additions, the CAPTURED node for
   * proposed removals (law #5 — the node stays intact and resolvable).
   */
  readonly node: SceneNode | null;
}

/**
 * Resolve one station element by canonical AISE identity. A
 * ghost-REMOVED id resolves with status `proposed-removed` and its
 * captured node intact (law #5) — identity never dangles. Unknown ids
 * are typed refusals (never guesses). PURE.
 */
export function resolveStationElement(
  model: StationSceneModel,
  elementId: SceneElementId,
): WorldUxOutcome<StationElementResolution> {
  if (typeof elementId !== "string" || elementId.length === 0) {
    return worldUxRefused<StationElementResolution>(
      "surface",
      "contract-mismatch",
      "surface: element resolution requires a non-empty canonical element id",
    );
  }
  if (looksLikeSubstrateId(elementId)) {
    return worldUxRefused<StationElementResolution>(
      "surface",
      "contract-mismatch",
      `surface: ${JSON.stringify(elementId)} looks like a substrate id — substrate object ids never enter the station (the identity quarantine law)`,
    );
  }
  const entry = model.elementStatus.find(
    (entry) => entry.elementId === elementId,
  );
  if (entry === undefined) {
    return worldUxRefused<StationElementResolution>(
      "surface",
      "unsupported-data",
      `surface: element ${elementId} is not part of this station scene`,
    );
  }
  const node =
    model.ghostScene.nodes.find((node) => node.elementId === elementId) ??
    null;
  return {
    ok: true,
    value: deepFreeze({
      elementId,
      status: entry.status,
      isGhost: entry.isGhost,
      node,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Picking (the in-world selection — identity quarantined)              */
/* ------------------------------------------------------------------ */

/** A pick request from the world surface (canonical identity only). */
export interface StationPickRequest {
  readonly elementId: SceneElementId;
}

/** One resolved pick: the element + the HUD panels it concerns. */
export interface StationPick {
  readonly elementId: SceneElementId;
  readonly status: StationElementStatus;
  readonly isGhost: boolean;
  readonly label: string | null;
  readonly evidenceContentIds: readonly string[];
  /**
   * The HUD panels this pick concerns (the panel targets a renderer
   * jumps to): an element with evidence concerns the Evidence panel;
   * a proposed-ghost concerns Cost/BOQ and Validation; a
   * proposed-removed concerns Objective (the change's subject) —
   * derived structurally, never guessed.
   */
  readonly concernsPanels: readonly string[];
}

/**
 * Pick an element in the world: resolve + derive the HUD concerns.
 * Refuses substrate-shaped ids (law #7) and unknown ids. PURE.
 */
export function pickStationElement(
  model: StationSceneModel,
  request: StationPickRequest,
): WorldUxOutcome<StationPick> {
  const resolution = resolveStationElement(model, request.elementId);
  if (!resolution.ok) {
    return resolution;
  }
  const concernsPanels: string[] = [];
  const evidenceCount = resolution.value.node?.evidenceContentIds.length ?? 0;
  if (evidenceCount > 0) {
    concernsPanels.push("evidence");
  }
  if (resolution.value.status === "proposed-ghost") {
    concernsPanels.push("validation", "cost-boq");
  }
  if (resolution.value.status === "proposed-removed") {
    concernsPanels.push("objective");
  }
  return {
    ok: true,
    value: deepFreeze({
      elementId: resolution.value.elementId,
      status: resolution.value.status,
      isGhost: resolution.value.isGhost,
      label: resolution.value.node?.label ?? null,
      evidenceContentIds: resolution.value.node?.evidenceContentIds ?? [],
      concernsPanels,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Selection state (canonical identity, typed)                          */
/* ------------------------------------------------------------------ */

/**
 * Apply a selection to the station: the canonical SelectionState the
 * P0-A runtime consumes. Every id is quarantined (law #7) and must
 * resolve (law #5 makes ghost-removed ids legitimately selectable —
 * an engineer can select an element a proposal removes). PURE.
 */
export function applyStationSelection(
  model: StationSceneModel,
  selectedElementIds: readonly SceneElementId[],
): WorldUxOutcome<SelectionState> {
  const quarantined: SceneElementId[] = [];
  for (const elementId of selectedElementIds) {
    if (looksLikeSubstrateId(elementId)) {
      return worldUxRefused<SelectionState>(
        "surface",
        "contract-mismatch",
        `surface: selection carries substrate-shaped id ${JSON.stringify(elementId)} — canonical AISE identity only (the identity quarantine law)`,
      );
    }
    const resolution = resolveStationElement(model, elementId);
    if (!resolution.ok) {
      return worldUxRefused<SelectionState>(
        "surface",
        resolution.failure.kind,
        `surface: selection refused — ${resolution.failure.detail}`,
      );
    }
    quarantined.push(elementId);
  }
  const unique = [...new Set(quarantined)];
  return {
    ok: true,
    value: deepFreeze({
      selectedElementIds: unique,
      hoveredElementId: null,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Camera operations (walk/orbit/fly — the handoff interaction law)     */
/* ------------------------------------------------------------------ */

/** The typed camera operations — a CLOSED vocabulary. */
export const STATION_CAMERA_OPERATIONS = [
  "orbit-to",
  "walk-to",
  "fly-through",
] as const;
export type StationCameraOperationKind =
  (typeof STATION_CAMERA_OPERATIONS)[number];

/** Type guard: a camera operation kind from the closed set. */
export function isStationCameraOperationKind(
  value: unknown,
): value is StationCameraOperationKind {
  return (
    typeof value === "string" &&
    (STATION_CAMERA_OPERATIONS as readonly string[]).includes(value)
  );
}

/** One typed camera operation request. */
export interface StationCameraOperation {
  readonly operation: StationCameraOperationKind;
  /** The new camera position (world/site frame, metres). */
  readonly position: readonly [number, number, number];
  /** The new look target (world/site frame, metres). */
  readonly target: readonly [number, number, number];
  /** The optional new vertical field of view (radians). */
  readonly fovRadians: number | null;
}

/**
 * Apply one typed camera operation to a camera state. The operation
 * kind sets the MODE (orbit-to → orbit, walk-to → walk, fly-through →
 * fly — the P0-A CameraState mode vocabulary); position/target/fov
 * are validated finite. PURE — the runtime adapter interprets the
 * resulting state; nothing here touches a GPU.
 */
export function applyStationCameraOperation(
  camera: CameraState,
  operation: StationCameraOperation,
): WorldUxOutcome<CameraState> {
  if (!isStationCameraOperationKind(operation.operation)) {
    return worldUxRefused<CameraState>(
      "surface",
      "contract-mismatch",
      "surface: camera operation must be from the closed vocabulary (orbit-to | walk-to | fly-through)",
    );
  }
  const finite = (values: readonly number[]): boolean =>
    values.every((value) => Number.isFinite(value));
  if (!finite(operation.position)) {
    return worldUxRefused<CameraState>(
      "surface",
      "contract-mismatch",
      "surface: camera operation position must be finite (site-frame metres)",
    );
  }
  if (!finite(operation.target)) {
    return worldUxRefused<CameraState>(
      "surface",
      "contract-mismatch",
      "surface: camera operation target must be finite (site-frame metres)",
    );
  }
  if (operation.fovRadians !== null) {
    if (!Number.isFinite(operation.fovRadians) || operation.fovRadians <= 0) {
      return worldUxRefused<CameraState>(
        "surface",
        "contract-mismatch",
        "surface: camera operation fovRadians must be a positive finite radian value",
      );
    }
  }
  const mode =
    operation.operation === "orbit-to"
      ? ("orbit" as const)
      : operation.operation === "walk-to"
        ? ("walk" as const)
        : ("fly" as const);
  return {
    ok: true,
    value: deepFreeze({
      position: operation.position,
      target: operation.target,
      up: camera.up,
      fovRadians: operation.fovRadians ?? camera.fovRadians,
      mode,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Layer visibility (the P1 navigate vocabulary, composed)              */
/* ------------------------------------------------------------------ */

/**
 * Apply layer toggles to the station's world — the P1 navigate
 * family's `applyLayerToggles`, composed at the station boundary
 * (isolate/hide layers — the handoff interaction law). The P1
 * transform's refusal (its port/detail/subjectId shape) is carried
 * through in the UNIFIED family form (seam law #4: kind + detail
 * verbatim, the port as the family, the subject appended). PURE.
 */
export function applyStationLayerToggles(
  world: NavigableWorld,
  toggles: readonly LayerToggle[],
): WorldUxOutcome<WorldViewState> {
  const outcome = applyLayerToggles(world, toggles);
  if (!outcome.ok) {
    const subjectSuffix =
      outcome.failure.subjectId === null
        ? ""
        : ` [subject: ${outcome.failure.subjectId}]`;
    return worldUxRefused<WorldViewState>(
      "surface",
      outcome.failure.kind,
      `surface: layer toggle refused by ${outcome.failure.port} — ${outcome.failure.detail}${subjectSuffix}`,
    );
  }
  return { ok: true, value: outcome.value };
}
