/**
 * `@aise/world-layer1-experience` — the RECONSTRUCT transform
 * (WORLD-P1, `src/world/reconstruct.ts`).
 *
 * The typed composition of registered capture fragments (+ the
 * optional plan/model side) into a `NavigableWorld` — the world the
 * engineer enters. The composed scene IS the P0-A `ComposedScene`
 * (substrate-neutral scene-composition types); a scene runtime
 * (Babylon or any substitute) INGESTS it behind the P0-A port — the
 * world here is a TYPED VALUE, never a substrate scene graph.
 *
 * LAWS ENFORCED STRUCTURALLY:
 *
 *  - REGISTRATION GATE: only fragments with registrationState
 *    `site-registered` or `partially-registered` may enter the world —
 *    an unregistered/refused fragment is a typed refusal (never a
 *    silently-unanchored world);
 *  - ONE FRAME: every fragment's site frame must equal the request's
 *    (a world spanning two site frames is a semantic error);
 *  - IDENTITY QUARANTINE: plan element ids are checked against the
 *    substrate-id patterns; capture element ids are content-derived
 *    digests; duplicate ids across origins are refused;
 *  - GHOST DISTINCTNESS (the P0-A law): every composed node is
 *    `isGhost: false` — captured reality and plan model are NEVER
 *    ghosts, and the P1 world carries NO ghost summary (the ghost
 *    overlay belongs to the Layer-3 solution preview; a world
 *    composition that would mark capture/plan nodes as ghosts is a
 *    typed refusal);
 *  - SPATIAL HONESTY: only PLACED capture assets become scene nodes
 *    (unplaced assets stay non-spatial evidence in the fragment — the
 *    coverage limitations carry them, never a guessed placement);
 *  - STRUCTURAL VALIDITY: the composed scene must pass the P0-A
 *    `validateScene` (unique ids, parents resolve, no cycles, finite
 *    transforms) before the world leaves this transform.
 */

import {
  canonicalDigestOf,
  isIsoUtcInstant,
  looksLikeSubstrateId,
} from "../lane";
import { identityLeakRefusal, laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  ElementProvenance,
  NavigableWorld,
  PlanElementDeclaration,
  WorldCompositionRequest,
} from "./contract";
import { WORLD_PORTS, WORLD_PRESET_LAYERS } from "./contract";
import type { SpatializedWorldFragment } from "../capture/contract";
import {
  IDENTITY_TRANSFORM,
  translation,
  validateScene,
  type ComposedScene,
  type SceneNode,
} from "@aise/world-reality-substrate";

/** The admissible registration states for world composition. */
const COMPOSABLE_REGISTRATION_STATES = ["site-registered", "partially-registered"] as const;

/** Derive the capture element id for one placed asset (deterministic). */
export function captureElementIdOf(
  fragmentId: string,
  evidenceContentId: string,
): string {
  return canonicalDigestOf({
    origin: "capture",
    fragmentId,
    evidenceContentId,
  });
}

/** Derive the plan element id — VALIDATED: it is caller-declared, so it
 * must be AISE-shaped (the quarantine gate applies to the caller too). */
function validatePlanElementId(elementId: string): LaneOutcome<null> {
  const shape = looksLikeSubstrateId(elementId);
  if (shape !== null) {
    return identityLeakRefusal(
      WORLD_PORTS.compose,
      "planElement.elementId",
      elementId,
      shape,
    );
  }
  if (elementId.length === 0 || elementId.length > 256) {
    return laneRefuse(
      "contract-mismatch",
      WORLD_PORTS.compose,
      "plan element id must be 1..256 chars",
      elementId,
    );
  }
  return laneOk(null);
}

/** Build one capture node (a placed asset's spatial projection). */
function captureNodeOf(
  fragment: SpatializedWorldFragment,
  elementId: string,
  pose: readonly [number, number, number],
  evidenceContentId: string,
): SceneNode {
  return {
    elementId,
    kind: "capture_cloud",
    parentId: null,
    transform: translation(pose[0], pose[1], pose[2]),
    geometry: null,
    material: null,
    layerIds: ["capture-reality"],
    isGhost: false,
    evidenceContentIds: [evidenceContentId],
    label: `capture ${evidenceContentId.slice(0, 8)}`,
  };
}

/** Build one plan node (the model side). */
function planNodeOf(element: PlanElementDeclaration): SceneNode {
  return {
    elementId: element.elementId,
    kind: "plan_model",
    parentId: null,
    transform: translation(
      element.translation[0],
      element.translation[1],
      element.translation[2],
    ),
    geometry: null,
    material: null,
    layerIds: ["plan-model"],
    isGhost: false,
    evidenceContentIds: [...element.evidenceContentIds],
    label: element.label,
  };
}

/** Build the coverage annotation node (when coverage bounds exist). */
function coverageNodeOf(bounds: {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}): SceneNode {
  return {
    elementId: canonicalDigestOf({ origin: "coverage", bounds }),
    kind: "annotation",
    parentId: null,
    transform: IDENTITY_TRANSFORM,
    geometry: null,
    material: null,
    layerIds: ["coverage"],
    isGhost: false,
    evidenceContentIds: [],
    label: "Capture coverage (declared)",
  };
}

/**
 * The honest coverage limitations, recounted from the assets THIS
 * composition actually places (the same strings the spatialize stage
 * derives — recomputed here so the world never carries a stale claim).
 */
function deriveCoverageLimitations(
  assets: readonly { declaredPose: readonly [number, number, number] | null; declaredVolume: unknown }[],
  volumeCount: number,
): readonly string[] {
  const limitations: string[] = [];
  const unplaced = assets.filter((asset) => asset.declaredPose === null).length;
  const noVolume = assets.length - volumeCount;
  if (unplaced > 0) {
    limitations.push(
      `${unplaced} spatializable asset(s) declared no pose — carried unplaced, never guessed`,
    );
  }
  if (noVolume > 0) {
    limitations.push(
      `${noVolume} spatializable asset(s) declared no capture volume — no coverage contribution`,
    );
  }
  if (volumeCount === 0) {
    limitations.push("no asset declared a capture volume — coverage is UNDECLARED, not empty");
  }
  return limitations;
}

/**
 * RECONSTRUCT: fragments (+ plan) → the navigable world. Fail-closed
 * at every gate; the output world is structurally valid
 * (`validateScene`) and fully provenance-bound.
 */
export function composeReconstructionWorld(
  request: WorldCompositionRequest,
): LaneOutcome<NavigableWorld> {
  const port = WORLD_PORTS.compose;

  // Gate 1: shape gates.
  if (!Number.isInteger(request.worldRevision) || request.worldRevision <= 0) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `worldRevision must be a positive integer: ${String(request.worldRevision)}`,
    );
  }
  if (!isIsoUtcInstant(request.declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `declaredAt is not an ISO-8601 UTC instant: ${String(request.declaredAt)}`,
    );
  }
  if (request.fragments.length === 0 && request.planModel === null) {
    return laneRefuse(
      "contract-mismatch",
      port,
      "composition requires at least one fragment or a plan model — an empty world is refused",
    );
  }

  // Gate 2: the registration gate (fail-closed on unregistered fragments).
  for (const fragment of request.fragments) {
    if (
      !(COMPOSABLE_REGISTRATION_STATES as readonly string[]).includes(
        fragment.registrationState,
      )
    ) {
      return laneRefuse(
        "operation-semantic-failure",
        port,
        `fragment ${fragment.fragmentId} registrationState is ` +
          `${fragment.registrationState} — only site-registered/partially-registered ` +
          "fragments may enter the world (register first; never a silently-unanchored world)",
        fragment.fragmentId,
      );
    }
    // Gate 3: one frame per world.
    if (
      fragment.siteFrame.origin.join(",") !== request.siteFrame.origin.join(",") ||
      fragment.siteFrame.northHeading !== request.siteFrame.northHeading ||
      fragment.siteFrame.units !== request.siteFrame.units
    ) {
      return laneRefuse(
        "operation-semantic-failure",
        port,
        `fragment ${fragment.fragmentId} site frame differs from the composition frame — ` +
          "a world spans exactly one site frame",
        fragment.fragmentId,
      );
    }
  }

  // Gate 4: plan-element identity quarantine + duplicate sweep.
  const elementIds = new Set<string>();
  if (request.planModel !== null) {
    for (const element of request.planModel.elements) {
      const idCheck = validatePlanElementId(element.elementId);
      if (!idCheck.ok) return idCheck;
      if (elementIds.has(element.elementId)) {
        return laneRefuse(
          "contract-mismatch",
          port,
          `duplicate plan element id: ${element.elementId}`,
          element.elementId,
        );
      }
      elementIds.add(element.elementId);
      if (
        !Number.isFinite(element.translation[0]) ||
        !Number.isFinite(element.translation[1]) ||
        !Number.isFinite(element.translation[2])
      ) {
        return laneRefuse(
          "contract-mismatch",
          port,
          `plan element ${element.elementId} translation is not finite`,
          element.elementId,
        );
      }
    }
  }

  // Compose: capture nodes (placed assets only), plan nodes, coverage node.
  const nodes: SceneNode[] = [];
  const provenance: ElementProvenance[] = [];
  for (const fragment of request.fragments) {
    for (const asset of fragment.assets) {
      if (asset.declaredPose === null) continue; // honestly non-spatial at P1
      const elementId = captureElementIdOf(fragment.fragmentId, asset.evidenceContentId);
      if (elementIds.has(elementId)) {
        return laneRefuse(
          "contract-mismatch",
          port,
          `duplicate capture element id: ${elementId}`,
          elementId,
        );
      }
      elementIds.add(elementId);
      nodes.push(
        captureNodeOf(fragment, elementId, asset.declaredPose, asset.evidenceContentId),
      );
      provenance.push({
        elementId,
        origin: "capture",
        evidenceContentIds: [asset.evidenceContentId],
        externalLabels: [],
        fragmentId: fragment.fragmentId,
        declaredVolume: asset.declaredVolume,
      });
    }
  }
  if (request.planModel !== null) {
    for (const element of request.planModel.elements) {
      nodes.push(planNodeOf(element));
      provenance.push({
        elementId: element.elementId,
        origin: "plan",
        evidenceContentIds: [...element.evidenceContentIds],
        externalLabels: [...element.externalLabels],
        fragmentId: null,
        declaredVolume: null,
      });
    }
  }
  let coverage: SpatializedWorldFragment["coverage"] | null = null;
  if (request.fragments.length > 0) {
    // The coverage summary derives from the assets THIS composition
    // actually places (a fresh recount — never the fragments' stale
    // limitation strings): the union bounds fold, then the honest
    // limitations from the real unplaced/no-volume counts.
    const allAssets = request.fragments.flatMap((fragment) => fragment.assets);
    const volumeAssets = allAssets.filter((asset) => asset.declaredVolume !== null);
    if (volumeAssets.length > 0) {
      let bounds = volumeAssets[0]!.declaredVolume!;
      for (const asset of volumeAssets.slice(1)) {
        const b = asset.declaredVolume!;
        bounds = {
          min: [
            Math.min(bounds.min[0], b.min[0]),
            Math.min(bounds.min[1], b.min[1]),
            Math.min(bounds.min[2], b.min[2]),
          ],
          max: [
            Math.max(bounds.max[0], b.max[0]),
            Math.max(bounds.max[1], b.max[1]),
            Math.max(bounds.max[2], b.max[2]),
          ],
        };
      }
      coverage = {
        coveredBounds: bounds,
        contributingAssets: volumeAssets.length,
        bases: [...new Set(volumeAssets.map((asset) => asset.volumeBasis).filter((b): b is string => b !== null))],
        limitations: deriveCoverageLimitations(allAssets, volumeAssets.length),
      };
      nodes.push(coverageNodeOf(bounds));
      provenance.push({
        elementId: coverageNodeOf(bounds).elementId,
        origin: "derived",
        evidenceContentIds: [],
        externalLabels: [],
        fragmentId: null,
        declaredVolume: bounds,
      });
    } else {
      // No asset declared a volume: the honest union coverage is
      // UNDECLARED, with the recount limitations carried.
      coverage = {
        coveredBounds: null,
        contributingAssets: 0,
        bases: [],
        limitations: deriveCoverageLimitations(allAssets, 0),
      };
    }
  }

  const scene: ComposedScene = {
    revision: request.worldRevision,
    nodes,
    layers: WORLD_PRESET_LAYERS,
    siteFrame: request.siteFrame,
    ghostSummary: null, // the Layer-1 world carries NO ghost set (the law)
  };

  // Gate 5: structural validity (the P0-A validator — fail-closed).
  const violations = validateScene(scene);
  if (violations.length > 0) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `composed scene is structurally invalid: ${violations.join("; ")}`,
    );
  }

  // Gate 6: provenance covers every node exactly once.
  if (provenance.length !== nodes.length) {
    return laneRefuse(
      "contract-mismatch",
      port,
      "provenance/element count mismatch — every world element must carry provenance",
    );
  }

  const derivation = {
    contractVersion: "1.1.0",
    derivationId: `derive-world-${request.worldRevision}`,
    outputContentId: "",
    inputEvidenceContentIds: [
      ...new Set(request.fragments.flatMap((fragment) => fragment.evidenceContentIds)),
    ],
    method: "reconstruction.world-compose",
    methodVersion: "layer1-contract/1",
    parameters: {
      "world.revision": String(request.worldRevision),
      "world.fragments": String(request.fragments.length),
      "world.planElements":
        request.planModel === null ? "0" : String(request.planModel.elements.length),
    },
    createdAt: request.declaredAt,
  };

  // The WORLD IDENTITY: the digest over the world's identity INPUTS
  // (site frame + contributing fragment ids + plan model id +
  // georeference) — deliberately WITHOUT the revision number or the
  // per-revision node content, so revisions of the SAME world share
  // the identity (what-changed compares revisions of one world; the
  // revision-specific content is pinned by the derivation digest).
  const worldId = canonicalDigestOf({
    siteFrame: request.siteFrame,
    fragmentIds: request.fragments.map((fragment) => fragment.fragmentId),
    planModelId: request.planModel === null ? null : request.planModel.planModelId,
    georeference: request.georeference,
  });

  return laneOk({
    worldId,
    worldRevision: request.worldRevision,
    scene,
    elementProvenance: provenance,
    siteFrame: request.siteFrame,
    georeference: request.georeference,
    coverage,
    derivation: { ...derivation, outputContentId: worldId },
  });
}
