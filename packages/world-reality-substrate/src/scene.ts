/**
 * `@aise/world-reality-substrate` — substrate-neutral scene composition
 * types (WORLD-P0-A).
 *
 * THE AISE-SIDE INPUT MODEL. These types are what every Reality-layer
 * substrate adapter CONSUMES and what the AISE world editor produces.
 * They are deliberately substrate-neutral: no Babylon, Cesium, USD, glTF
 * or Assimp concept appears here — no `mesh.primitive`, no `tileset`, no
 * `UsdPrim`, no `node.mesh`, no `aiScene`. A substrate adapter maps THESE
 * types onto its own internal representation behind the port; it can
 * never require the caller to speak substrate.
 *
 * Identity law (the world program's §3 architectural rule): every node,
 * geometry and material carries an `elementId` — a STABLE AISE identity
 * (the same id space the Reality Graph uses). Substrate-side identities
 * (USD object paths, glTF node indices, Assimp mesh names, Cesium entity
 * ids) are opaque adapter-internal data; they can NEVER become canonical
 * AISE identity and never cross this boundary back out.
 *
 * Authority law: this model is a PRESENTATION/INTERACTION projection of
 * canonical state. Building it never mutates the Reality Graph; the
 * governed changes API remains the only production path.
 */

/* ------------------------------------------------------------------ */
/* Identity + shared primitives                                        */
/* ------------------------------------------------------------------ */

/** Stable AISE element identity (Reality Graph object id space). */
export type SceneElementId = string;

/** Closed, versioned kind vocabulary for scene composition nodes. */
export const SCENE_NODE_KINDS = [
  "group",
  "element",
  "capture_cloud",
  "capture_mesh",
  "plan_model",
  "terrain",
  "annotation",
  "measurement",
  "section_plane",
  "ghost",
] as const;
export type SceneNodeKind = (typeof SCENE_NODE_KINDS)[number];

/** Right-handed column-major 4×4 transform (16 numbers, row-major storage). */
export interface TransformMatrix {
  readonly matrix: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ];
}

/** Axis-aligned world-space bounds (AISE site frame, metres). */
export interface WorldBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** RGB color, 0..1 per channel. */
export type RgbColor = readonly [number, number, number];

/* ------------------------------------------------------------------ */
/* Geometry + material references (by reference, never by value)       */
/* ------------------------------------------------------------------ */

/**
 * A reference to geometry held in the asset store — never inline vertex
 * data. The adapter resolves references through its ASSET DELIVERY port
 * (see ./gltf/contract.ts); it never invents geometry.
 */
export interface GeometryReference {
  readonly assetId: string;
  readonly partId: string;
  readonly format: "gltf-json" | "glb" | "ingested-mesh";
}

/** Surface material description (substrate-neutral, PBR-free core). */
export interface SurfaceMaterial {
  readonly materialId: string;
  readonly baseColor: RgbColor;
  readonly opacity: number;
  readonly wireframe: boolean;
  /** Source evidence binding when the material was captured, else null. */
  readonly evidenceContentIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

/** A node in the composed world scene. */
export interface SceneNode {
  /** Stable AISE identity — survives substrate swaps, never a substrate id. */
  readonly elementId: SceneElementId;
  readonly kind: SceneNodeKind;
  /** Parent elementId, or null for roots. Cycles are a contract violation. */
  readonly parentId: SceneElementId | null;
  readonly transform: TransformMatrix;
  /** Geometry reference for `element`/`capture_mesh`/`plan_model` nodes. */
  readonly geometry: GeometryReference | null;
  readonly material: SurfaceMaterial | null;
  /** Rendering layer membership (visibility groups). */
  readonly layerIds: readonly string[];
  /**
   * Ghost state: when true the node renders as a PROPOSED state overlay
   * (the Layer-3 solution preview) — visually distinct, never confused
   * with captured reality.
   */
  readonly isGhost: boolean;
  /** Capture provenance (Reality Graph content ids) when captured, else []. */
  readonly evidenceContentIds: readonly string[];
  /** Human label shown in HUD/selection — presentation, not identity. */
  readonly label: string | null;
}

/* ------------------------------------------------------------------ */
/* Composition root                                                    */
/* ------------------------------------------------------------------ */

/** A composed world scene: the complete input to a scene runtime adapter. */
export interface ComposedScene {
  /** Monotonic composition revision (bumped by the AISE world editor). */
  readonly revision: number;
  readonly nodes: readonly SceneNode[];
  /** All layer ids referenced by nodes, with display names. */
  readonly layers: readonly SceneLayer[];
  /** Site frame: the local engineering frame (see ./cesium for geospatial). */
  readonly siteFrame: SiteFrame;
  /** Ghost set summary — the proposed state this scene carries, if any. */
  readonly ghostSummary: GhostSetSummary | null;
}

export interface SceneLayer {
  readonly layerId: string;
  readonly name: string;
  readonly visibleByDefault: boolean;
}

/** The local engineering/site coordinate frame. */
export interface SiteFrame {
  /** Origin of the site frame in site coordinates (metres). */
  readonly origin: readonly [number, number, number];
  /** True north heading (radians, clockwise from +Y in plan view). */
  readonly northHeading: number;
  /** Units declaration — mirrors the shared-contracts UnitsSpec discipline. */
  readonly units: "metre" | "millimetre" | "foot";
}

/** Summary of the ghost (proposed) state carried in a composition. */
export interface GhostSetSummary {
  readonly operationId: string;
  readonly proposedElementIds: readonly SceneElementId[];
  readonly removedElementIds: readonly SceneElementId[];
}

/* ------------------------------------------------------------------ */
/* Interaction surface (commands from the runtime back to AISE)        */
/* ------------------------------------------------------------------ */

/** What the user selected inside the world (opaque element ids only). */
export interface SelectionState {
  readonly selectedElementIds: readonly SceneElementId[];
  readonly hoveredElementId: SceneElementId | null;
}

/** Camera state in a substrate-neutral form (position + look + up + fov). */
export interface CameraState {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  /** Field of view in radians (vertical). */
  readonly fovRadians: number;
  readonly mode: "walk" | "orbit" | "fly";
}

/** A live measurement taken in the world. */
export interface WorldMeasurement {
  readonly measurementId: string;
  readonly kind: "point_to_point" | "polyline" | "planar_area";
  readonly points: readonly (readonly [number, number, number])[];
  readonly value: number;
  readonly unit: "metre" | "square_metre";
}

/** Section plane (cutting box) for sectioning the world view. */
export interface SectionPlane {
  readonly planeId: string;
  /** Plane normal in world space (unit length). */
  readonly normal: readonly [number, number, number];
  /** Signed distance from site origin along the normal. */
  readonly distance: number;
  readonly enabled: boolean;
}

/* ------------------------------------------------------------------ */
/* Construction + laws                                                 */
/* ------------------------------------------------------------------ */

/** Identity matrix constant. */
export const IDENTITY_TRANSFORM: TransformMatrix = {
  matrix: [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ],
};

/** Build a translation transform. */
export function translation(x: number, y: number, z: number): TransformMatrix {
  return {
    matrix: [
      1, 0, 0, x,
      0, 1, 0, y,
      0, 0, 1, z,
      0, 0, 0, 1,
    ],
  };
}

/** Uniform scale transform. */
export function uniformScale(s: number): TransformMatrix {
  return {
    matrix: [
      s, 0, 0, 0,
      0, s, 0, 0,
      0, 0, s, 0,
      0, 0, 0, 1,
    ],
  };
}

/**
 * Structural validation of a ComposedScene (fail-closed): unique
 * elementIds, parent references resolve, no cycles, transforms finite.
 * Returns the list of violations (empty = valid).
 */
export function validateScene(scene: ComposedScene): readonly string[] {
  const violations: string[] = [];
  const byId = new Map<string, SceneNode>();
  for (const node of scene.nodes) {
    if (byId.has(node.elementId)) {
      violations.push(`duplicate elementId: ${node.elementId}`);
    }
    byId.set(node.elementId, node);
  }
  for (const node of scene.nodes) {
    if (node.parentId !== null && !byId.has(node.parentId)) {
      violations.push(`unresolved parentId ${node.parentId} on ${node.elementId}`);
    }
    if (!Number.isFinite(node.transform.matrix.reduce((a, b) => a + b, 0))) {
      violations.push(`non-finite transform on ${node.elementId}`);
    }
  }
  // cycle detection: walk up from each node with a visited set
  for (const node of scene.nodes) {
    const seen = new Set<string>([node.elementId]);
    let cur: SceneNode | undefined = node;
    while (cur && cur.parentId !== null) {
      if (seen.has(cur.parentId)) {
        violations.push(`parent cycle at ${node.elementId}`);
        break;
      }
      seen.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
  }
  return violations;
}
