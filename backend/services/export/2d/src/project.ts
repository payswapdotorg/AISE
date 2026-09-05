/**
 * The deterministic 2D plan/elevation projection (AISE-017).
 *
 * REQ-010 acceptance (AC-090/091/092) over the canonical Reality
 * Graph (AISE-011):
 *
 * - **AC-090 vector geometry** — walls/openings/rooms are emitted
 *   as VECTOR primitives: closed polygons (object planes parallel
 *   to the view plane) and line segments (object planes
 *   perpendicular to it). The document is structured vector data,
 *   never a raster screenshot (AC-092); the DXF serialization is
 *   AISE-019's surface, downstream of this document.
 * - **AC-091 dimensions tied to the model** — every primitive
 *   carries the source object's CANONICAL QUANTITIES verbatim
 *   (value, unit, uncertainty). Dimensions are NEVER recomputed
 *   from projected coordinates: a recomputed length would be a
 *   second, drifting authority over the same measurement (the
 *   AISE-011 derived-view lesson). Projected coordinates are the
 *   exact orthographic projection of the canonical rectangle
 *   corners; the canonical quantity IS the dimension.
 * - **Traceable source IDs** — every primitive carries its source
 *   object identity, class, epistemic state, content hash, and
 *   provenance chain (service, method, content-pinned inputs).
 *
 * Authority discipline (architecture-lock: "The Export layer
 * consumes the Reality Graph; it does not become a second source
 * of truth"): this module is a PURE function of the immutable
 * graph. It stores nothing, mutates nothing, upgrades no
 * epistemic state, and fabricates no geometry. Objects that
 * cannot be projected faithfully (no structured geometry,
 * asset-only geometry, oblique planes) are listed in the
 * document's `unprojected` block with explicit reasons — never
 * silently dropped, never approximated into plausible shapes.
 *
 * Determinism: canonical ordering (the graph's own object order),
 * fixed view-basis derivations, pure arithmetic on the canonical
 * numbers. No clock, no randomness, no environment reads, no map
 * iteration order — two projections of the same graph and view
 * are structurally identical (regression-scanned and tested).
 *
 * View bases (declared in the document, deterministic):
 *
 * - **plan** — the viewer is above, looking along `−up`. The
 *   in-plane basis is derived from the declared up axis: `e1` is
 *   the world axis (X, then Y, then Z priority) least aligned
 *   with `up`, orthonormalized; `e2 = up × e1`. For the canonical
 *   frame `up = (0,0,1)`: `e1 = +X`, `e2 = +Y` — the mathematical
 *   XY plane viewed from above.
 * - **elevation** — the viewer looks along a supplied HORIZONTAL
 *   unit vector `d`; `e1 = d × up` (the viewer's image-right),
 *   `e2 = up` (image-up). Both are exact for unit ⊥ inputs.
 */
import type {
  EpistemicState,
  ModelAreaUnit,
  ModelLengthUnit,
  ModelUncertainty,
  ModelUnit,
  RealityModelGraph,
  RealityObject,
  RealityObjectClass,
  SpaceNode,
  StructuredPlanarGeometry,
  Vec3,
  ModelProvenance,
  Point3,
} from "@aise/engineering-model";
import { Export2dError } from "./errors.js";

/** A canonical quantity, verbatim, plus its exact SI conversion. */
export interface Quantity2dView {
  /** The canonical value — never recomputed, never rewritten. */
  readonly value: number;
  /** The canonical unit — verbatim (unit fidelity). */
  readonly unit: ModelLengthUnit | ModelAreaUnit;
  /** The canonical uncertainty, verbatim (never converted across kinds). */
  readonly uncertainty?: ModelUncertainty;
  /**
   * Exact SI conversion in the quantity's own family (metres for
   * lengths, square metres for areas) through the frozen unit
   * vocabulary. DERIVED, labeled as such — the quantity above
   * remains the authority.
   */
  readonly si: number;
}

/** The traceable source block every primitive carries. */
export interface Primitive2dSource {
  /** Canonical object identity (the traceable source ID). */
  readonly objectId: string;
  readonly objectClass: RealityObjectClass;
  readonly name?: string;
  /** Epistemic state PASSTHROUGH — the projection never upgrades it. */
  readonly epistemic: EpistemicState;
  /** Canonical content hash of the source object. */
  readonly contentHash: string;
  /** The source object's provenance chain (verbatim summary). */
  readonly provenance: Primitive2dProvenance;
}

/** Provenance summary: who produced the geometry, from what pinned inputs. */
export interface Primitive2dProvenance {
  readonly serviceId: string;
  readonly method: string;
  readonly methodVersion: string;
  /** Content-pinned input references (kind + identity + hash + epistemic). */
  readonly inputs: readonly Primitive2dProvenanceInput[];
}

/** One content-pinned input reference of the source's provenance. */
export interface Primitive2dProvenanceInput {
  readonly kind: string;
  readonly id: string;
  readonly contentHash: string;
  readonly epistemic: EpistemicState;
}

/** Dimensions of the source geometry, carried verbatim (AC-091). */
export interface Primitive2dDimensions {
  /** Length along the object's axisU (wall run, opening width, floor width). */
  readonly length?: Quantity2dView;
  /** Length along the object's axisV (wall height, opening height). */
  readonly height?: Quantity2dView;
  /** Area (walls, floors, ceilings, openings). */
  readonly area?: Quantity2dView;
  /** Plane elevation — floors/ceilings. */
  readonly elevation?: Quantity2dView;
  /** Sill height above the parent wall bottom — windows. */
  readonly sill?: Quantity2dView;
  /** Head height above the parent wall bottom — doors/windows. */
  readonly head?: Quantity2dView;
}

/** A projected 2D point: `[x, y]` in the view basis, in model units. */
export type Point2d = readonly [number, number];

/** Normalizes signed zero to +0 (byte-stable canonical numbers). */
function canonicalZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Shared primitive shape (source trace + canonical dimensions). */
export interface Primitive2dBase {
  /** Deterministic primitive identity: `${viewKind}:${objectId}`. */
  readonly primitiveId: string;
  readonly kind: "polygon" | "segment";
  readonly source: Primitive2dSource;
  readonly dimensions: Primitive2dDimensions;
}

/**
 * A closed vector outline: the exact projection of the source
 * rectangle's four canonical corners (uMin,vMin) → (uMax,vMin) →
 * (uMax,vMax) → (uMin,vMax). Emitted when the object plane is
 * PARALLEL to the view plane.
 */
export interface Polygon2d extends Primitive2dBase {
  readonly kind: "polygon";
  readonly points: readonly Point2d[];
}

/**
 * A vector line segment: the diameter pair of the four projected
 * corners (the full extent of the object's footprint in the view
 * plane). Emitted when the object plane is PERPENDICULAR to the
 * view plane — walls in plan view, floors/ceilings in elevation.
 */
export interface Segment2d extends Primitive2dBase {
  readonly kind: "segment";
  readonly start: Point2d;
  readonly end: Point2d;
}

export type Primitive2d = Polygon2d | Segment2d;

/** One object that could not be projected, with the honest reason. */
export interface Unprojected2d {
  readonly source: Primitive2dSource;
  readonly reason:
    | "no-structured-geometry"
    | "asset-only-geometry"
    | "oblique-plane";
}

/** The view a document was projected with. */
export interface Projection2dView {
  readonly kind: "plan" | "elevation";
  /** The declared in-plane basis (image-right, image-up). */
  readonly basis: { readonly e1: Vec3; readonly e2: Vec3 };
  /** The view axis (the direction the viewer looks along). */
  readonly viewAxis: Vec3;
}

/** The deterministic 2D plan document (the AISE-017 export artifact). */
export interface Plan2dDocument {
  readonly kind: "plan-2d";
  readonly modelId: string;
  readonly projectId: string;
  /** The canonical digest of the exact graph this was projected from. */
  readonly graphDigest: string;
  readonly view: Projection2dView;
  /** The model's declared frame unit (the document's coordinate unit). */
  readonly unit: ModelLengthUnit;
  /** Vector primitives in canonical graph object order. */
  readonly primitives: readonly Primitive2d[];
  /** Objects that could not be projected — explicit, never silent. */
  readonly unprojected: readonly Unprojected2d[];
  /** The explicit v1 limitations of this projection (honest display). */
  readonly limitations: readonly string[];
  /** Derived counts (observability; the arrays above are the truth). */
  readonly counts: {
    readonly objects: number;
    readonly projected: number;
    readonly unprojected: number;
    readonly polygons: number;
    readonly segments: number;
  };
}

/** The projection request. */
export type Projection2dRequest =
  /** Top-down plan: viewer above, looking along −up. */
  | { readonly kind: "plan" }
  /** Orthographic elevation: viewer looks along a horizontal unit vector. */
  | { readonly kind: "elevation"; readonly viewDirection: Vec3 };

/**
 * The explicit v1 limitations of the 2D projection — part of the
 * document contract (the dispatch acceptance: "limitations are
 * explicit"). Every consumer (web viewer, future DXF exporter)
 * displays them alongside the geometry.
 */
export const PLAN_2D_LIMITATIONS: readonly string[] = Object.freeze([
  "v1 structured geometry is planar rectangles (face geometry): walls project as centerline/run segments WITHOUT thickness; no wall thickness, cut fills, or hatch symbols are represented.",
  "openings (doors/windows) project as sub-segments of their parent wall run in plan view, not as door-swing or window-glazing symbols.",
  "room outlines are not derived: the v1 model carries no room-boundary polygon, so no room outline primitive is emitted; horizontal objects (floor/ceiling) emit their own rectangle footprints.",
  "dimensions are the canonical quantity values of the source objects (value, unit, uncertainty — verbatim); they are never recomputed from projected coordinates; projected coordinates are exact projections of the canonical rectangle corners and can differ from the quantity by the upstream reconstruction's floating-point noise.",
  "epistemic states are attached per primitive as passthrough of the source object's state; the projection never upgrades INFERRED geometry to confirmed outlines.",
  "quantity uncertainties are carried verbatim, but no uncertainty banding is drawn in v1.",
  "elevation views perform no occlusion or hidden-line removal: every object classified parallel/perpendicular projects onto the view (walls behind walls overlap honestly).",
  "object planes oblique to the view (outside the ±10° alignment tolerance mirrored from the upstream AISE-010 classification tolerance) are listed unprojected with reason oblique-plane rather than approximated; planes within the tolerance but slightly tilted project their exact canonical corners (polygons) or their diameter segment (perpendicular class) — the sub-tolerance tilt footprint is covered by the declared face-geometry abstraction, never fabricated.",
  "objects without structured geometry (asset-only point-cloud references) cannot be projected and are listed with their reason — never silently dropped.",
]);

/**
 * Plane/view alignment tolerance, in degrees — MIRRORS the upstream
 * AISE-010 classification tolerance (`DEFAULT_TILT_TOLERANCE_DEG` = 10):
 * the same tolerance that classified these objects as walls
 * (vertical) and floors/ceilings (horizontal) in the first place.
 * The projection introduces no new, stricter authority: planes
 * within the upstream tolerance project as perpendicular/
 * parallel; planes outside it are listed unprojected (oblique)
 * rather than approximated.
 */
export const PROJECTION_TILT_TOLERANCE_DEG = 10;
const SIN_TILT = Math.sin((PROJECTION_TILT_TOLERANCE_DEG * Math.PI) / 180);
const COS_TILT = Math.cos((PROJECTION_TILT_TOLERANCE_DEG * Math.PI) / 180);
/** Unit-vector tolerance — the model's own declared guarantee (geometry UNIT_LENGTH_TOLERANCE). */
const UNIT_TOLERANCE = 1e-6;
/** Horizontality tolerance for elevation directions — the mirrored upstream tilt tolerance. */
const HORIZONTAL_TOLERANCE = SIN_TILT;

/**
 * Projects one canonical Reality Graph into a deterministic 2D
 * plan/elevation document.
 *
 * Fail-closed contract: an invalid request (non-unit direction,
 * non-horizontal elevation direction, missing frame declaration,
 * non-finite numbers) throws `Export2dError` BEFORE any output.
 * Projection impossibilities are never thrown — they are
 * recorded in the document's `unprojected` block.
 */
export function project2d(graph: RealityModelGraph, request: Projection2dRequest): Plan2dDocument {
  const frame = declaredFrameOf(graph);
  const up = frame.up;
  const view = viewOf(request, up);
  const project = pointProjector(view.basis);

  const primitives: Primitive2d[] = [];
  const unprojected: Unprojected2d[] = [];

  for (const object of graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined) {
      const reason = (object.geometry?.assetRefs ?? []).length > 0 ? "asset-only-geometry" : "no-structured-geometry";
      unprojected.push(unprojectedOf(object, reason));
      continue;
    }
    const alignment = alignmentOf(geometry.frame.normal, view.viewAxis);
    if (alignment === "parallel") {
      primitives.push(polygonOf(object, geometry, view.kind, project));
    } else if (alignment === "perpendicular") {
      primitives.push(segmentOf(object, geometry, view.kind, project));
    } else {
      unprojected.push(unprojectedOf(object, "oblique-plane"));
    }
  }

  let polygons = 0;
  let segments = 0;
  for (const primitive of primitives) {
    if (primitive.kind === "polygon") {
      polygons += 1;
    } else {
      segments += 1;
    }
  }

  return {
    kind: "plan-2d",
    modelId: graph.modelId,
    projectId: graph.projectId,
    graphDigest: graph.digest,
    view,
    unit: frame.unit,
    primitives: Object.freeze(primitives),
    unprojected: Object.freeze(unprojected),
    limitations: PLAN_2D_LIMITATIONS,
    counts: Object.freeze({
      objects: graph.objects.length,
      projected: primitives.length,
      unprojected: unprojected.length,
      polygons,
      segments,
    }),
  };
}

/** Resolves the single declared space frame (fail closed). */
function declaredFrameOf(graph: RealityModelGraph): { up: Vec3; unit: ModelLengthUnit } {
  const space: SpaceNode | undefined = graph.spaces[0];
  if (space === undefined || space.frame === undefined) {
    throw new Export2dError(
      "FRAME_DECLARATION_MISSING",
      "the graph's first space has no declared coordinate frame; a projection basis cannot be derived",
      { details: { modelId: graph.modelId, spaces: graph.spaces.length } },
    );
  }
  return { up: space.frame.up, unit: space.frame.unit };
}

/** Derives the view (axis + in-plane basis) for the request. */
function viewOf(request: Projection2dRequest, up: Vec3): Projection2dView {
  if (request.kind === "plan") {
    const viewAxis = negate(up);
    const e1 = planBasisE1(up);
    const e2 = cross(up, e1);
    return {
      kind: "plan",
      viewAxis,
      basis: { e1: unitOf(e1), e2: unitOf(e2) },
    };
  }
  const direction = request.viewDirection;
  validateViewDirection(direction, up);
  const e1 = cross(direction, up);
  return {
    kind: "elevation",
    viewAxis: { x: direction.x, y: direction.y, z: direction.z },
    basis: { e1: unitOf(e1), e2: { x: up.x, y: up.y, z: up.z } },
  };
}

/** Validates an elevation view direction (unit, finite, horizontal). */
function validateViewDirection(direction: Vec3, up: Vec3): void {
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(direction[axis])) {
      throw new Export2dError(
        "VIEW_DIRECTION_INVALID",
        `elevation viewDirection.${axis} must be finite: ${String(direction[axis])}`,
        { details: { field: `viewDirection.${axis}`, value: String(direction[axis]) } },
      );
    }
  }
  const magnitude = Math.sqrt(dot(direction, direction));
  if (Math.abs(magnitude - 1) > UNIT_TOLERANCE) {
    throw new Export2dError(
      "VIEW_DIRECTION_INVALID",
      `elevation viewDirection must be a unit vector (|v| = ${magnitude})`,
      { details: { field: "viewDirection", magnitude: String(magnitude) } },
    );
  }
  const vertical = Math.abs(dot(direction, up));
  if (vertical > HORIZONTAL_TOLERANCE) {
    throw new Export2dError(
      "VIEW_DIRECTION_NOT_HORIZONTAL",
      `elevation viewDirection must be orthogonal to the up axis (|d·up| = ${vertical})`,
      { details: { field: "viewDirection", dotWithUp: String(vertical) } },
    );
  }
}

/**
 * The plan basis first axis: the world axis (X, then Y, then Z)
 * least aligned with `up`, orthonormalized against `up`. Exact
 * for coordinate-aligned up axes; deterministic for any unit up.
 */
function planBasisE1(up: Vec3): Vec3 {
  const candidates: readonly Vec3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];
  let best: Vec3 = candidates[0]!;
  let bestAlignment = Math.abs(dot(best, up));
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const alignment = Math.abs(dot(candidate, up));
    if (alignment < bestAlignment) {
      best = candidate;
      bestAlignment = alignment;
    }
  }
  // Gram-Schmidt against up, then renormalize (exact for axis-aligned up).
  const projection = scale(up, dot(best, up));
  const orthogonal = { x: best.x - projection.x, y: best.y - projection.y, z: best.z - projection.z };
  return unitOf(orthogonal);
}

/** Classifies an object plane against the view axis (mirrored upstream tolerance). */
function alignmentOf(normal: Vec3, viewAxis: Vec3): "parallel" | "perpendicular" | "oblique" {
  const alignment = Math.abs(dot(normal, viewAxis));
  if (alignment >= COS_TILT) {
    return "parallel";
  }
  if (alignment <= SIN_TILT) {
    return "perpendicular";
  }
  return "oblique";
}

/** Builds the exact point projector for a basis. */
function pointProjector(basis: { e1: Vec3; e2: Vec3 }): (point: Point3) => Point2d {
  return (point) => [canonicalZero(dot(point, basis.e1)), canonicalZero(dot(point, basis.e2))];
}

/** The polygon primitive: four canonical corners, projected. */
function polygonOf(
  object: RealityObject,
  geometry: StructuredPlanarGeometry,
  viewKind: "plan" | "elevation",
  project: (point: Point3) => Point2d,
): Polygon2d {
  const points = geometry.rectangle.corners.map(project);
  return {
    primitiveId: `${viewKind}:${object.objectId}`,
    kind: "polygon",
    source: sourceOf(object),
    dimensions: dimensionsOf(geometry),
    points: Object.freeze(points),
  };
}

/** The segment primitive: the diameter pair of the projected corners. */
function segmentOf(
  object: RealityObject,
  geometry: StructuredPlanarGeometry,
  viewKind: "plan" | "elevation",
  project: (point: Point3) => Point2d,
): Segment2d {
  const projected = geometry.rectangle.corners.map(project);
  const [start, end] = diameterPair(projected);
  return {
    primitiveId: `${viewKind}:${object.objectId}`,
    kind: "segment",
    source: sourceOf(object),
    dimensions: dimensionsOf(geometry),
    start,
    end,
  };
}

/**
 * The diameter pair of collinear projected points: the two points
 * realizing the maximum pairwise distance (the object's full
 * in-view extent). Deterministic: the FIRST maximum pair in
 * canonical corner order wins ties.
 */
function diameterPair(points: readonly Point2d[]): [Point2d, Point2d] {
  let bestA = points[0]!;
  let bestB = points[1]!;
  let bestDistance = -1;
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const pa = points[a]!;
      const pb = points[b]!;
      const dx = pb[0] - pa[0];
      const dy = pb[1] - pa[1];
      const distance = dx * dx + dy * dy;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestA = pa;
        bestB = pb;
      }
    }
  }
  return [bestA, bestB];
}

/** The traceable source block (epistemic passthrough, verbatim). */
function sourceOf(object: RealityObject): Primitive2dSource {
  return {
    objectId: object.objectId,
    objectClass: object.objectClass,
    ...(object.name !== undefined ? { name: object.name } : {}),
    epistemic: object.epistemicState,
    contentHash: object.contentHash,
    provenance: provenanceOf(object.provenance),
  };
}

/** The provenance summary (service, method, pinned inputs). */
function provenanceOf(provenance: ModelProvenance): Primitive2dProvenance {
  const inputs = provenance.inputs.map((input) => {
    switch (input.kind) {
      case "scene":
        return { kind: "scene", id: input.sceneId, contentHash: input.contentHash, epistemic: input.epistemic };
      case "object":
        return {
          kind: "object",
          id: `${input.serviceId}/${input.objectId}`,
          contentHash: input.contentHash,
          epistemic: input.epistemic,
        };
      case "point-set":
        return {
          kind: "point-set",
          id: `points-${input.contentHash.slice(0, 16)}`,
          contentHash: input.contentHash,
          epistemic: input.epistemic,
        };
    }
  });
  return {
    serviceId: provenance.serviceId,
    method: provenance.method,
    methodVersion: provenance.methodVersion,
    inputs: Object.freeze(inputs),
  };
}

/** The dimensions block: canonical quantities, verbatim + SI. */
function dimensionsOf(geometry: StructuredPlanarGeometry): Primitive2dDimensions {
  return {
    ...(geometry.width !== undefined ? { length: quantityOf(geometry.width) } : {}),
    ...(geometry.height !== undefined ? { height: quantityOf(geometry.height) } : {}),
    ...(geometry.area !== undefined ? { area: quantityOf(geometry.area) } : {}),
    ...(geometry.elevation !== undefined ? { elevation: quantityOf(geometry.elevation) } : {}),
    ...(geometry.sillHeight !== undefined ? { sill: quantityOf(geometry.sillHeight) } : {}),
    ...(geometry.headHeight !== undefined ? { head: quantityOf(geometry.headHeight) } : {}),
  };
}

/** One canonical quantity: verbatim value/unit/uncertainty + exact SI. */
function quantityOf(quantity: {
  value: number;
  unit: ModelUnit;
  uncertainty?: ModelUncertainty;
}): Quantity2dView {
  // siOf below throws (fail closed) for any unit outside the length/area
  // vocabulary, so the narrowed view type holds whenever this returns.
  const unit = quantity.unit as ModelLengthUnit | ModelAreaUnit;
  return {
    value: quantity.value,
    unit,
    ...(quantity.uncertainty !== undefined ? { uncertainty: quantity.uncertainty } : {}),
    si: siOf(quantity.value, quantity.unit),
  };
}

/** The exact SI conversion through the frozen unit vocabulary. */
function siOf(value: number, unit: ModelUnit): number {
  switch (unit) {
    case "meter":
      return value;
    case "millimeter":
      return value * 0.001;
    case "centimeter":
      return value * 0.01;
    case "inch":
      return value * 0.0254;
    case "foot":
      return value * 0.3048;
    case "square_meter":
      return value;
    case "square_millimeter":
      return value * 0.001 * 0.001;
    case "square_centimeter":
      return value * 0.01 * 0.01;
    case "square_inch":
      return value * 0.0254 * 0.0254;
    case "square_foot":
      return value * 0.3048 * 0.3048;
    default:
      throw new Export2dError(
        "VALIDATION_FAILED",
        `quantity carries a unit outside the frozen vocabulary: ${String(unit)}`,
        { details: { unit: String(unit) } },
      );
  }
}

/** An unprojected record with its honest reason. */
function unprojectedOf(object: RealityObject, reason: Unprojected2d["reason"]): Unprojected2d {
  return { source: sourceOf(object), reason };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function negate(v: Vec3): Vec3 {
  // +0 normalization: negating a +0 component must not emit −0
  // (canonical-number discipline for byte-stable documents).
  return { x: canonicalZero(-v.x), y: canonicalZero(-v.y), z: canonicalZero(-v.z) };
}

function scale(v: Vec3, factor: number): Vec3 {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

function unitOf(v: Vec3): Vec3 {
  const magnitude = Math.sqrt(dot(v, v));
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    throw new Export2dError(
      "NON_FINITE_INPUT",
      `basis derivation produced a degenerate vector (|v| = ${String(magnitude)})`,
      { details: { magnitude: String(magnitude) } },
    );
  }
  return { x: v.x / magnitude, y: v.y / magnitude, z: v.z / magnitude };
}
