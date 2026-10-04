/**
 * `@aise/world-layer1-experience` — the NAVIGATE transforms
 * (WORLD-P1, `src/world/navigate.ts`).
 *
 * NAVIGATION as typed transforms over the world value:
 *
 *  - LAYER TOGGLING (`applyLayerToggles`) — the typed VISIBILITY
 *    PREDICATE over the P0-A scene-composition types: a node is
 *    visible iff EVERY layer it belongs to is visible (AND semantics —
 *    the P0-A runtime law, typed here as pure data). An unknown layer
 *    id in a toggle is a typed refusal (fail-closed, mirroring the
 *    P0-A double).
 *  - NAVIGATION BOOKMARKS — TYPED WORLD STATES: capture a world + view
 *    into a content-addressed bookmark (camera + layer visibility +
 *    section + selection, bound to the world revision), and resolve a
 *    bookmark back into a view state. A bookmark resolved against a
 *    DIFFERENT world revision is a typed refusal — never silently
 *    applied (a stale view onto a moved world would be a fabricated
 *    state).
 *
 * Determinism: bookmark ids are content digests (no randomness); the
 * same inputs always produce the byte-identical bookmark.
 */

import { canonicalDigestOf, isIsoUtcInstant, looksLikeSubstrateId } from "../lane";
import { identityLeakRefusal, laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  LayerToggle,
  NavigationBookmark,
  NavigableWorld,
  WorldViewState,
} from "./contract";
import { WORLD_PORTS } from "./contract";
import type { CameraState, SceneElementId, SectionPlane } from "@aise/world-reality-substrate";

/* ------------------------------------------------------------------ */
/* The visibility predicate (typed, pure)                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve the effective layer visibility: start from each layer's
 * `visibleByDefault`, then apply the toggles IN ORDER (a later toggle
 * of the same layer wins — deterministic, declared semantics).
 * Unknown layer ids refuse (fail-closed).
 */
export function resolveLayerVisibility(
  world: NavigableWorld,
  toggles: readonly LayerToggle[],
): LaneOutcome<readonly { readonly layerId: string; readonly visible: boolean }[]> {
  const known = new Map<string, boolean>();
  for (const layer of world.scene.layers) {
    known.set(layer.layerId, layer.visibleByDefault);
  }
  for (const toggle of toggles) {
    if (!known.has(toggle.layerId)) {
      return laneRefuse(
        "contract-mismatch",
        WORLD_PORTS.layerToggles,
        `unknown layerId in toggle: ${toggle.layerId}`,
        toggle.layerId,
      );
    }
    known.set(toggle.layerId, toggle.visible);
  }
  // The output order is the scene's declared layer order (pinned).
  return laneOk(
    world.scene.layers.map((layer) => ({
      layerId: layer.layerId,
      visible: known.get(layer.layerId) ?? layer.visibleByDefault,
    })),
  );
}

/**
 * The per-element visibility PREDICATE: a node is visible iff EVERY
 * layer it belongs to is visible; a node with NO layers is visible
 * (vacuous truth — the declared semantics).
 */
export function resolveElementVisibility(
  world: NavigableWorld,
  layerVisibility: readonly { readonly layerId: string; readonly visible: boolean }[],
): readonly { readonly elementId: SceneElementId; readonly visible: boolean }[] {
  const visibleByLayer = new Map(layerVisibility.map((entry) => [entry.layerId, entry.visible]));
  return world.scene.nodes.map((node) => ({
    elementId: node.elementId,
    visible: node.layerIds.every((layerId) => visibleByLayer.get(layerId) ?? true),
  }));
}

/** NAVIGATE: apply layer toggles — the typed visibility predicate. */
export function applyLayerToggles(
  world: NavigableWorld,
  toggles: readonly LayerToggle[],
): LaneOutcome<WorldViewState> {
  const visibility = resolveLayerVisibility(world, toggles);
  if (!visibility.ok) return visibility;
  return laneOk({
    worldRevision: world.worldRevision,
    worldId: world.worldId,
    layerVisibility: visibility.value,
    elementVisibility: resolveElementVisibility(world, visibility.value),
  });
}

/* ------------------------------------------------------------------ */
/* Bookmarks (typed world states)                                        */
/* ------------------------------------------------------------------ */

function validateCamera(camera: CameraState): LaneOutcome<null> {
  const parts = [
    ...camera.position,
    ...camera.target,
    ...camera.up,
    camera.fovRadians,
  ];
  if (parts.some((value) => !Number.isFinite(value))) {
    return laneRefuse(
      "contract-mismatch",
      WORLD_PORTS.captureBookmark,
      "camera state carries non-finite components",
    );
  }
  if (camera.fovRadians <= 0 || camera.fovRadians >= Math.PI) {
    return laneRefuse(
      "contract-mismatch",
      WORLD_PORTS.captureBookmark,
      `camera fovRadians must be in (0, pi): ${String(camera.fovRadians)}`,
    );
  }
  return laneOk(null);
}

function validateSection(section: SectionPlane): LaneOutcome<null> {
  const norm = Math.hypot(section.normal[0], section.normal[1], section.normal[2]);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-9) {
    return laneRefuse(
      "contract-mismatch",
      WORLD_PORTS.captureBookmark,
      "section plane normal must be unit length (±1e-9)",
      section.planeId,
    );
  }
  if (!Number.isFinite(section.distance)) {
    return laneRefuse(
      "contract-mismatch",
      WORLD_PORTS.captureBookmark,
      "section plane distance must be finite",
      section.planeId,
    );
  }
  return laneOk(null);
}

/** NAVIGATE: capture a bookmark from a world + view state (content-addressed). */
export function captureNavigationBookmark(
  world: NavigableWorld,
  view: WorldViewState,
  camera: CameraState,
  section: SectionPlane | null,
  selectedElementIds: readonly SceneElementId[],
  label: string,
  declaredAt: string,
): LaneOutcome<NavigationBookmark> {
  // Gate 1: the view state belongs to THIS world.
  if (view.worldRevision !== world.worldRevision || view.worldId !== world.worldId) {
    return laneRefuse(
      "operation-semantic-failure",
      WORLD_PORTS.captureBookmark,
      `view state (rev ${String(view.worldRevision)}) does not belong to world ` +
        `${world.worldId} (rev ${String(world.worldRevision)})`,
      world.worldId,
    );
  }
  // Gate 2: the camera.
  const cameraCheck = validateCamera(camera);
  if (!cameraCheck.ok) return cameraCheck;
  // Gate 3: the section plane.
  if (section !== null) {
    const sectionCheck = validateSection(section);
    if (!sectionCheck.ok) return sectionCheck;
  }
  // Gate 4: selected elements exist in the world (identity quarantine included).
  const known = new Set(world.scene.nodes.map((node) => node.elementId));
  for (const elementId of selectedElementIds) {
    const shape = looksLikeSubstrateId(elementId);
    if (shape !== null) {
      return identityLeakRefusal(
        WORLD_PORTS.captureBookmark,
        "selectedElementIds[]",
        elementId,
        shape,
      );
    }
    if (!known.has(elementId)) {
      return laneRefuse(
        "contract-mismatch",
        WORLD_PORTS.captureBookmark,
        `selected element not in world: ${elementId}`,
        elementId,
      );
    }
  }
  // Gate 5: the declared instant.
  if (!isIsoUtcInstant(declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      WORLD_PORTS.captureBookmark,
      `declaredAt is not an ISO-8601 UTC instant: ${String(declaredAt)}`,
    );
  }

  const body = {
    worldId: world.worldId,
    worldRevision: world.worldRevision,
    camera,
    layerVisibility: view.layerVisibility,
    section,
    selectedElementIds: [...selectedElementIds],
    label,
    createdAt: declaredAt,
  };
  const bookmarkId = canonicalDigestOf(body);
  return laneOk({
    bookmarkId,
    worldId: world.worldId,
    worldRevision: world.worldRevision,
    camera,
    layerVisibility: view.layerVisibility,
    section,
    selectedElementIds: [...selectedElementIds],
    label,
    createdAt: declaredAt,
  });
}

/** NAVIGATE: resolve a bookmark against a world (revision-checked). */
export function resolveNavigationBookmark(
  world: NavigableWorld,
  bookmark: NavigationBookmark,
): LaneOutcome<WorldViewState> {
  // Gate 1: the bookmark belongs to THIS world revision — a stale
  // bookmark never silently applies.
  if (bookmark.worldId !== world.worldId) {
    return laneRefuse(
      "operation-semantic-failure",
      WORLD_PORTS.resolveBookmark,
      `bookmark belongs to world ${bookmark.worldId}, not ${world.worldId}`,
      bookmark.bookmarkId,
    );
  }
  if (bookmark.worldRevision !== world.worldRevision) {
    return laneRefuse(
      "operation-semantic-failure",
      WORLD_PORTS.resolveBookmark,
      `bookmark world revision ${String(bookmark.worldRevision)} != world revision ` +
        `${String(world.worldRevision)} — a stale view is never silently applied`,
      bookmark.bookmarkId,
    );
  }
  // Gate 2: the bookmarked layer visibility references known layers.
  const known = new Set(world.scene.layers.map((layer) => layer.layerId));
  for (const entry of bookmark.layerVisibility) {
    if (!known.has(entry.layerId)) {
      return laneRefuse(
        "contract-mismatch",
        WORLD_PORTS.resolveBookmark,
        `bookmark references unknown layer: ${entry.layerId}`,
        bookmark.bookmarkId,
      );
    }
  }
  return laneOk({
    worldRevision: world.worldRevision,
    worldId: world.worldId,
    layerVisibility: bookmark.layerVisibility,
    elementVisibility: resolveElementVisibility(world, bookmark.layerVisibility),
  });
}

/** The bookmark round-trip helper: the digest of a bookmark's body. */
export function bookmarkDigestOf(bookmark: NavigationBookmark): string {
  return canonicalDigestOf({
    worldId: bookmark.worldId,
    worldRevision: bookmark.worldRevision,
    camera: bookmark.camera,
    layerVisibility: bookmark.layerVisibility,
    section: bookmark.section,
    selectedElementIds: [...bookmark.selectedElementIds],
    label: bookmark.label,
    createdAt: bookmark.createdAt,
  });
}
