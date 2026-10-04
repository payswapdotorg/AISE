/**
 * `@aise/world-layer1-experience` — the RECONSTRUCT → NAVIGATE family
 * contract (WORLD-P1, `src/world/`).
 *
 * The typed contract for a NAVIGABLE RECONSTRUCTION WORLD: the world
 * the engineer enters, walks/orbits/flies through, toggles layers on,
 * sections, bookmarks and compares (directive §4 "the product MUST
 * feel like an engineering game" — the Layer-1 share of it).
 *
 * STAGE DISCIPLINE:
 *
 *  RECONSTRUCT  `composeReconstructionWorld` — the typed composition of
 *               registered capture fragments (+ an optional
 *               plan/model side through the P0-B IFC-interpretation
 *               vocabulary) into a `NavigableWorld`. The world's scene
 *               IS the P0-A `ComposedScene` type (the
 *               scene-composition substrate-neutral model) — composed
 *               HERE, never handed out as a substrate scene graph.
 *  NAVIGATE     `applyLayerToggles` (layer toggling as TYPED VISIBILITY
 *               PREDICATES over the P0-A scene-composition types) and
 *               `captureNavigationBookmark` / `resolveNavigationBookmark`
 *               (navigation bookmarks as TYPED WORLD STATES — camera +
 *               layer visibility + section + selection, content-addressed,
 *               revision-checked).
 *
 * THE IDENTITY LAW (directive §10; P0-A scene.ts): the world's
 * canonical identity is the `elementId` (AISE-owned stable id space);
 * a substrate scene-graph object is NEVER canonical identity — the
 * P0-A quarantine laws carry through EVERY stage here. IFC GUIDs and
 * every other substrate-side identifier ride as NAMESPACED EXTERNAL
 * LABELS in the per-element provenance (the P0-B seam vocabulary),
 * never in identity fields.
 *
 * THE GHOST-DISTINCTNESS LAW (P0-A) carries through: captured reality
 * nodes and plan-model nodes are NEVER ghosts (`isGhost: false`,
 * enforced structurally); the ghost overlay set belongs to the Layer-3
 * solution preview and enters a composition ONLY through the typed
 * ghost-summary field, never by marking a capture/plan node.
 */

import type {
  CameraState,
  ComposedScene,
  SceneElementId,
  SceneLayer,
  SectionPlane,
  SiteFrame,
} from "@aise/world-reality-substrate";
import type { NamespacedExternalLabel } from "@aise/world-understanding-substrate";
import type { SpatializedWorldFragment } from "../capture/contract";
import type { SiteGeoreference } from "@aise/world-reality-substrate";
import type { Derivation } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Closed vocabularies                                                  */
/* ------------------------------------------------------------------ */

/** Where a world element came from (the provenance origin vocabulary). */
export const ELEMENT_ORIGINS = ["capture", "plan", "derived"] as const;
export type ElementOrigin = (typeof ELEMENT_ORIGINS)[number];

export function isElementOrigin(value: unknown): value is ElementOrigin {
  return typeof value === "string" && (ELEMENT_ORIGINS as readonly string[]).includes(value);
}

/**
 * The closed world-layer vocabulary P1 composes (the layer catalog a
 * composition may reference — widening is a contract bump; an app may
 * define MORE layers through the ComposedScene itself, this is the
 * lane's canonical set):
 *
 *  - `capture-reality`  — everything derived from capture evidence;
 *  - `plan-model`       — the BIM/plan/model side (IFC-derived);
 *  - `coverage`         — the declared capture-coverage markers;
 *  - `annotations`      — human annotations.
 */
export const WORLD_LAYER_IDS = [
  "capture-reality",
  "plan-model",
  "coverage",
  "annotations",
] as const;
export type WorldLayerId = (typeof WORLD_LAYER_IDS)[number];

/* ------------------------------------------------------------------ */
/* RECONSTRUCT — the inputs                                             */
/* ------------------------------------------------------------------ */

/**
 * One plan-side element contribution (the model side of
 * model-vs-capture): the P0-B IFC-interpretation vocabulary carries
 * extracted elements (`IfcElementRecord`); THIS lane consumes them as
 * DECLARED plan elements — the AISE-side stable id is the identity,
 * the IFC GlobalId rides as a namespaced external label, the declared
 * geometry is the P0-B exact-geometry shape vocabulary (the same
 * vocabulary the COMPARE family delegates to).
 */
export interface PlanElementDeclaration {
  /** AISE-owned stable id (NEVER the IFC GUID — that is a label). */
  readonly elementId: SceneElementId;
  /** Open lower_snake_case kind (e.g. `wall`, `slab` — the IFC class as label). */
  readonly kind: string;
  /** The element's site-frame transform (translation-only at P1). */
  readonly translation: readonly [number, number, number];
  /** Declared comparable geometry (P0-B exact-geometry shape vocabulary). */
  readonly shape: import("../compare/contract").ComparableShape;
  /** Substrate-side labels (ifc-guid etc.) — provenance, never identity. */
  readonly externalLabels: readonly NamespacedExternalLabel[];
  /** Evidence backing the plan claim (the interpretation derivation). */
  readonly evidenceContentIds: readonly string[];
  readonly label: string | null;
}

/** The plan-side source of a composition (the model half). */
export interface PlanModelSource {
  /** AISE-owned plan model identity (content-derived digest). */
  readonly planModelId: string;
  readonly elements: readonly PlanElementDeclaration[];
  /** The IFC interpretation derivation (P0-B method identity). */
  readonly derivation: Derivation;
}

/** The RECONSTRUCT request: registered fragments + optional plan side. */
export interface WorldCompositionRequest {
  /** Fragments with registrationState `site-registered` or `partially-registered` only. */
  readonly fragments: readonly SpatializedWorldFragment[];
  readonly planModel: PlanModelSource | null;
  /** The site frame (must match every fragment's — the world is one frame). */
  readonly siteFrame: SiteFrame;
  /** The established site georeference (from REGISTER), when the site has one. */
  readonly georeference: SiteGeoreference | null;
  /** The world revision this composition produces (caller-supplied, monotonic). */
  readonly worldRevision: number;
  readonly declaredAt: string;
}

/* ------------------------------------------------------------------ */
/* RECONSTRUCT — the element provenance (the identity/label separation)  */
/* ------------------------------------------------------------------ */

/** The provenance record of one world element (identity vs labels). */
export interface ElementProvenance {
  readonly elementId: SceneElementId;
  readonly origin: ElementOrigin;
  /** The evidence chain (capture assets / plan interpretation inputs). */
  readonly evidenceContentIds: readonly string[];
  /** Substrate-side labels — namespaced, never identity. */
  readonly externalLabels: readonly NamespacedExternalLabel[];
  /** Which fragment contributed this element (capture origin), else null. */
  readonly fragmentId: string | null;
  /**
   * The device-DECLARED capture volume of this element (site-frame
   * AABB, what the asset observed) when the element is a placed
   * capture asset with a declared volume, else null. This is the
   * honest spatial claim the EVIDENCE family's "what is actually
   * here?" query answers from — declared data, never a fabricated
   * bound.
   */
  readonly declaredVolume: import("@aise/world-reality-substrate").WorldBounds | null;
}

/* ------------------------------------------------------------------ */
/* RECONSTRUCT — the world                                              */
/* ------------------------------------------------------------------ */

/**
 * A navigable reconstruction world: the composed scene (P0-A
 * scene-composition types — THE input model of every Reality-layer
 * scene runtime adapter) plus the per-element provenance, the site
 * georeference binding and the world identity. NEVER a substrate
 * scene-graph object: the world is a TYPED VALUE; a runtime adapter
 * (Babylon today, any substitute tomorrow) INGESTS it behind the P0-A
 * port.
 */
export interface NavigableWorld {
  /** AISE-owned content-derived digest — the WORLD identity. */
  readonly worldId: string;
  readonly worldRevision: number;
  readonly scene: ComposedScene;
  /** Provenance per element id (every scene node appears exactly once). */
  readonly elementProvenance: readonly ElementProvenance[];
  readonly siteFrame: SiteFrame;
  /** The site georeference when registered (null when unregistered — honest). */
  readonly georeference: SiteGeoreference | null;
  /** The capture coverage summary (declared, with limitations — never fabricated). */
  readonly coverage: import("../capture/contract").SpatialCoverage | null;
  /** The lane derivation (method `reconstruction.world-compose`). */
  readonly derivation: Derivation;
}

/* ------------------------------------------------------------------ */
/* NAVIGATE — layer toggling (typed visibility predicates)              */
/* ------------------------------------------------------------------ */

/** One layer toggle: a typed visibility assignment. */
export interface LayerToggle {
  readonly layerId: string;
  readonly visible: boolean;
}

/** The resolved visibility of the world under a toggle set. */
export interface WorldViewState {
  readonly worldRevision: number;
  readonly worldId: string;
  /** The effective layer visibility (closed map over the scene's layers). */
  readonly layerVisibility: readonly { readonly layerId: string; readonly visible: boolean }[];
  /**
   * The visibility PREDICATE's per-element resolution: a node is
   * visible iff EVERY layer it belongs to is visible (AND semantics —
   * the P0-A runtime law, typed here as data).
   */
  readonly elementVisibility: readonly { readonly elementId: SceneElementId; readonly visible: boolean }[];
}

/* ------------------------------------------------------------------ */
/* NAVIGATE — bookmarks (typed world states)                            */
/* ------------------------------------------------------------------ */

/**
 * A navigation bookmark: a TYPED WORLD STATE — the camera, the layer
 * visibility, the section plane and the selection at a moment, bound
 * to a world revision. The bookmark id is the content digest over the
 * state (deterministic identity); resolving a bookmark against a
 * DIFFERENT world revision is a typed refusal (never silently
 * applied).
 */
export interface NavigationBookmark {
  /** AISE-owned content-derived digest — the BOOKMARK identity. */
  readonly bookmarkId: string;
  readonly worldId: string;
  readonly worldRevision: number;
  readonly camera: CameraState;
  readonly layerVisibility: readonly { readonly layerId: string; readonly visible: boolean }[];
  readonly section: SectionPlane | null;
  readonly selectedElementIds: readonly SceneElementId[];
  readonly label: string;
  /** The declared bookmark instant (never a clock read). */
  readonly createdAt: string;
}

/* ------------------------------------------------------------------ */
/* The controlled family port                                           */
/* ------------------------------------------------------------------ */

/** The world-family port: the controlled entry point surface. */
export interface WorldLanePort {
  readonly portId: "layer1.world/1";

  /** RECONSTRUCT: fragments (+ plan) in, the navigable world out. */
  compose(request: WorldCompositionRequest): import("../failures").LaneOutcome<NavigableWorld>;

  /** NAVIGATE: apply layer toggles (the typed visibility predicate). */
  applyLayerToggles(
    world: NavigableWorld,
    toggles: readonly import("./contract").LayerToggle[],
  ): import("../failures").LaneOutcome<WorldViewState>;

  /** NAVIGATE: capture a bookmark from a world + view state. */
  captureBookmark(
    world: NavigableWorld,
    view: WorldViewState,
    camera: CameraState,
    section: SectionPlane | null,
    selectedElementIds: readonly SceneElementId[],
    label: string,
    declaredAt: string,
  ): import("../failures").LaneOutcome<NavigationBookmark>;

  /** NAVIGATE: resolve a bookmark against a world (revision-checked). */
  resolveBookmark(
    world: NavigableWorld,
    bookmark: NavigationBookmark,
  ): import("../failures").LaneOutcome<WorldViewState>;
}

/** The world-family port names used in typed refusals. */
export const WORLD_PORTS = {
  compose: "layer1.world.compose",
  layerToggles: "layer1.world.layer-toggles",
  captureBookmark: "layer1.world.bookmark-capture",
  resolveBookmark: "layer1.world.bookmark-resolve",
} as const;

/** The scene-layer presets the composition builds (declared, testable). */
export const WORLD_PRESET_LAYERS: readonly SceneLayer[] = [
  { layerId: "capture-reality", name: "Captured reality", visibleByDefault: true },
  { layerId: "plan-model", name: "Plan / BIM model", visibleByDefault: true },
  { layerId: "coverage", name: "Capture coverage", visibleByDefault: false },
  { layerId: "annotations", name: "Annotations", visibleByDefault: true },
];
