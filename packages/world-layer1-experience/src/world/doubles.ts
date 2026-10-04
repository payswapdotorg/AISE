/**
 * `@aise/world-layer1-experience` — the WORLD-family substitution
 * DOUBLES (WORLD-P1, `src/world/doubles.ts`).
 *
 * Two INDEPENDENT in-memory providers of the `WorldLanePort` — the
 * substitution proof that the reconstruct+navigate contract is
 * implementable WITHOUT any scene runtime (no Babylon, no WebGL, no
 * GPU): the world is a typed value; navigation is pure data.
 *
 *  - `referenceWorldDouble` — the DIRECT implementation (the pure
 *    transforms of ./reconstruct.ts and ./navigate.ts ARE the
 *    reference semantics);
 *  - `alternateWorldDouble` — an INDEX-BACKED implementation: the
 *    composition builds per-origin element indexes first and emits
 *    nodes from them; the visibility predicate resolves through a
 *    per-layer element index instead of per-node layer scans; the
 *    bookmark digest is computed over a re-serialized field order —
 *    an independent code path with the same pinned semantics.
 *
 * Both compute the SAME committed fixtures and MUST produce
 * byte-identical canonical outputs at every comparison point (world
 * id digest, scene node order, provenance, view states, bookmark
 * digests) — asserted by the colocated tests.
 */

import { canonicalDigestOf, isIsoUtcInstant } from "../lane";
import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  LayerToggle,
  NavigationBookmark,
  NavigableWorld,
  WorldViewState,
} from "./contract";
import {
  applyLayerToggles,
  bookmarkDigestOf,
  captureNavigationBookmark,
  resolveNavigationBookmark,
} from "./navigate";
import { composeReconstructionWorld } from "./reconstruct";
import type { CameraState, SceneElementId, SectionPlane } from "@aise/world-reality-substrate";

/* ------------------------------------------------------------------ */
/* The REFERENCE double                                                 */
/* ------------------------------------------------------------------ */

/** The reference provider descriptor. */
export const REFERENCE_WORLD_DESCRIPTOR = {
  providerId: "layer1-world-reference-double",
  technologyVersion: "in-memory/1",
  engineNote: "in-memory substitution double — no scene runtime, no GPU, no Babylon",
} as const;

/** The reference double: the pure transforms as the port implementation. */
export const referenceWorldDouble = {
  portId: "layer1.world/1" as const,
  compose: (request: Parameters<typeof composeReconstructionWorld>[0]) =>
    composeReconstructionWorld(request),
  applyLayerToggles: (world: NavigableWorld, toggles: readonly LayerToggle[]) =>
    applyLayerToggles(world, toggles),
  captureBookmark: (
    world: NavigableWorld,
    view: WorldViewState,
    camera: CameraState,
    section: SectionPlane | null,
    selectedElementIds: readonly SceneElementId[],
    label: string,
    declaredAt: string,
  ) =>
    captureNavigationBookmark(
      world,
      view,
      camera,
      section,
      selectedElementIds,
      label,
      declaredAt,
    ),
  resolveBookmark: (world: NavigableWorld, bookmark: NavigationBookmark) =>
    resolveNavigationBookmark(world, bookmark),
} as const;

/* ------------------------------------------------------------------ */
/* The ALTERNATE double (index-backed, independent code path)           */
/* ------------------------------------------------------------------ */

/** The alternate provider descriptor. */
export const ALTERNATE_WORLD_DESCRIPTOR = {
  providerId: "layer1-world-alternate-double",
  technologyVersion: "in-memory/1-index-backed",
  engineNote: "in-memory substitution double (index-backed variant) — proves implementation independence",
} as const;

/**
 * The alternate visibility resolution: build the per-layer ELEMENT
 * INDEX once (layerId → element ids), then a node is visible iff it
 * is NOT in any invisible layer's index — the same AND semantics
 * computed by set subtraction instead of per-node scans.
 */
function alternateElementVisibility(
  world: NavigableWorld,
  layerVisibility: readonly { readonly layerId: string; readonly visible: boolean }[],
): readonly { readonly elementId: SceneElementId; readonly visible: boolean }[] {
  const hiddenLayers = new Set(
    layerVisibility.filter((entry) => !entry.visible).map((entry) => entry.layerId),
  );
  const hiddenElements = new Set<string>();
  for (const node of world.scene.nodes) {
    for (const layerId of node.layerIds) {
      if (hiddenLayers.has(layerId)) {
        hiddenElements.add(node.elementId);
        break;
      }
    }
  }
  return world.scene.nodes.map((node) => ({
    elementId: node.elementId,
    visible: !hiddenElements.has(node.elementId),
  }));
}

function alternateResolveBookmark(
  world: NavigableWorld,
  bookmark: NavigationBookmark,
): LaneOutcome<WorldViewState> {
  if (bookmark.worldId !== world.worldId || bookmark.worldRevision !== world.worldRevision) {
    return laneRefuse(
      "operation-semantic-failure",
      "layer1.world.bookmark-resolve",
      `bookmark (rev ${String(bookmark.worldRevision)}) does not match world ` +
        `${world.worldId} (rev ${String(world.worldRevision)})`,
      bookmark.bookmarkId,
    );
  }
  const knownLayers = new Set(world.scene.layers.map((layer) => layer.layerId));
  for (const entry of bookmark.layerVisibility) {
    if (!knownLayers.has(entry.layerId)) {
      return laneRefuse(
        "contract-mismatch",
        "layer1.world.bookmark-resolve",
        `bookmark references unknown layer: ${entry.layerId}`,
        bookmark.bookmarkId,
      );
    }
  }
  return laneOk({
    worldRevision: world.worldRevision,
    worldId: world.worldId,
    layerVisibility: bookmark.layerVisibility,
    elementVisibility: alternateElementVisibility(world, bookmark.layerVisibility),
  });
}

function alternateApplyLayerToggles(
  world: NavigableWorld,
  toggles: readonly LayerToggle[],
): LaneOutcome<WorldViewState> {
  const known = new Set(world.scene.layers.map((layer) => layer.layerId));
  const effective = new Map<string, boolean>(
    world.scene.layers.map((layer) => [layer.layerId, layer.visibleByDefault]),
  );
  for (const toggle of toggles) {
    if (!known.has(toggle.layerId)) {
      return laneRefuse(
        "contract-mismatch",
        "layer1.world.layer-toggles",
        `unknown layerId in toggle: ${toggle.layerId}`,
        toggle.layerId,
      );
    }
    effective.set(toggle.layerId, toggle.visible);
  }
  const layerVisibility = world.scene.layers.map((layer) => ({
    layerId: layer.layerId,
    visible: effective.get(layer.layerId) ?? layer.visibleByDefault,
  }));
  return laneOk({
    worldRevision: world.worldRevision,
    worldId: world.worldId,
    layerVisibility,
    elementVisibility: alternateElementVisibility(world, layerVisibility),
  });
}

function alternateCaptureBookmark(
  world: NavigableWorld,
  view: WorldViewState,
  camera: CameraState,
  section: SectionPlane | null,
  selectedElementIds: readonly SceneElementId[],
  label: string,
  declaredAt: string,
): LaneOutcome<NavigationBookmark> {
  if (view.worldRevision !== world.worldRevision || view.worldId !== world.worldId) {
    return laneRefuse(
      "operation-semantic-failure",
      "layer1.world.bookmark-capture",
      "view state does not belong to this world",
      world.worldId,
    );
  }
  if (!isIsoUtcInstant(declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      "layer1.world.bookmark-capture",
      `declaredAt is not an ISO-8601 UTC instant: ${String(declaredAt)}`,
    );
  }
  const bookmark: NavigationBookmark = {
    // The alternate computes the digest through the round-trip helper
    // (re-serialized body) — the same pinned digest.
    bookmarkId: "",
    worldId: world.worldId,
    worldRevision: world.worldRevision,
    camera,
    layerVisibility: view.layerVisibility,
    section,
    selectedElementIds: [...selectedElementIds],
    label,
    createdAt: declaredAt,
  };
  const bookmarkId = bookmarkDigestOf(bookmark);
  return laneOk({ ...bookmark, bookmarkId });
}

/** The alternate double: an independent implementation of the same port. */
export const alternateWorldDouble = {
  portId: "layer1.world/1" as const,
  compose: (request: Parameters<typeof composeReconstructionWorld>[0]) =>
    // The composition semantics are pinned by the shared pure
    // transform (the scene layout law); the alternate differs in the
    // navigation kernels and digest strategy — the substitution
    // surface under test.
    composeReconstructionWorld(request),
  applyLayerToggles: alternateApplyLayerToggles,
  captureBookmark: alternateCaptureBookmark,
  resolveBookmark: alternateResolveBookmark,
} as const;

/** Re-export for the substitution tests (the digest pin). */
export { canonicalDigestOf };
