/**
 * Structured geometry for the Reality Graph core (AISE-011).
 *
 * AC-050 ("reality objects can reference geometry") is served by
 * two distinct mechanisms, kept distinct on purpose:
 *
 * 1. **Asset references** — content-pinned references to
 *    reconstruction artifacts (point clouds). The model does not
 *    copy point clouds; it references them by content identity, so
 *    the Reality Graph stays a graph, not a blob store, and the
 *    reconstruction store remains the artifact authority.
 * 2. **Structured geometry** — the canonical, editable
 *    representation (requirements AC-041): an in-plane frame, an
 *    oriented rectangle, dimension quantities with uncertainty,
 *    and fit-quality metrics. This is the representation exports
 *    (AISE-017/018) and measurements derive from.
 *
 * The v1 structured-geometry type covers planar rectangles — the
 * AISE-010 extraction output surface. Cylinders and centerlines
 * (AISE-026) will extend the union through a governed work item.
 *
 * The representation is a structural mirror of the semantics
 * package's `StructuredRectangle`, but package-local (canonical
 * model authority, no backend dependency): the backend ingestion
 * adapter owns the explicit, reviewable mapping.
 *
 * Determinism: fit-quality metrics are deterministic (point
 * counts, residual statistics). A confidence score is structurally
 * absent from geometry — deterministic geometry has no confidence
 * to report (AISE-009/010 discipline).
 */
import { EngineeringModelError } from "./errors.js";
import { validateQuantity, type Quantity } from "./quantities.js";

/** A 3D vector (finite, unit-length where the context demands it). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A 3D point (finite). */
export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A deterministic in-plane 2D coordinate frame on a plane:
 * an anchor point, the plane normal, and two in-plane axes.
 */
export interface PlaneFrame {
  /** A point on the plane (anchor of the rectangle coordinates). */
  readonly planePoint: Point3;
  /** The plane's unit normal. */
  readonly normal: Vec3;
  /** First in-plane axis (unit). */
  readonly axisU: Vec3;
  /** Second in-plane axis (unit). */
  readonly axisV: Vec3;
}

/** An oriented bounding rectangle in a plane frame. */
export interface PlaneRectangle {
  /** Minimum/maximum coordinate along axisU. */
  readonly uMin: number;
  readonly uMax: number;
  /** Minimum/maximum coordinate along axisV. */
  readonly vMin: number;
  readonly vMax: number;
  /** Rectangle center (3D). */
  readonly center: Point3;
  /** Corners in canonical order: (uMin,vMin),(uMax,vMin),(uMax,vMax),(uMin,vMax). */
  readonly corners: readonly Point3[];
}

/** Deterministic fit-quality metrics of the underlying plane fit (no confidence). */
export interface GeometryQualityMetrics {
  /** Number of cluster points supporting the geometry. */
  readonly pointCount: number;
  /** RMS of the signed perpendicular residuals (geometry unit). */
  readonly residualRms: number;
  /** Max |signed residual| (geometry unit). */
  readonly residualMaxAbs: number;
}

/** A content-pinned reference to a reconstruction geometry asset. */
export interface GeometryAssetRef {
  readonly kind: "point-cloud";
  /** SHA-256 content hash of the referenced artifact. */
  readonly contentHash: string;
  /** Number of points in the referenced cloud. */
  readonly pointCount: number;
  /** Epistemic state of the referenced artifact (reconstruction output is INFERRED). */
  readonly epistemic: "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED";
}

/** Structural planar geometry with dimension quantities (v1 shape). */
export interface StructuredPlanarGeometry {
  readonly shape: "planar-rectangle";
  /** The scene frame this geometry lives in. */
  readonly frame: PlaneFrame;
  readonly rectangle: PlaneRectangle;
  /** Width along axisU, with uncertainty where available. */
  readonly width: Quantity;
  /** Height along axisV, with uncertainty where available. */
  readonly height: Quantity;
  /** Area, with uncertainty where available. */
  readonly area: Quantity;
  /** Floor/ceiling: height of the plane point along the scene up axis. */
  readonly elevation?: Quantity;
  /** Window: sill height above the parent wall bottom. */
  readonly sillHeight?: Quantity;
  /** Door/window: head height above the parent wall bottom. */
  readonly headHeight?: Quantity;
  readonly quality: GeometryQualityMetrics;
}

/** Constructor input for structured planar geometry. */
export type StructuredPlanarGeometryInput = StructuredPlanarGeometry;

const UNIT_LENGTH_TOLERANCE = 1e-6;

/** Builds and validates structured planar geometry (fail closed). */
export function structuredPlanarGeometry(
  geometry: StructuredPlanarGeometryInput,
): StructuredPlanarGeometry {
  const field = "structuredGeometry";
  if (geometry.shape !== "planar-rectangle") {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `${field}.shape must be "planar-rectangle" in v1: ${String(geometry.shape)}`,
      { details: { field: `${field}.shape`, value: String(geometry.shape) } },
    );
  }
  validateFrame(geometry.frame);
  validateRectangle(geometry.rectangle, geometry.frame);

  validateQuantity(geometry.width, `${field}.width`);
  validateQuantity(geometry.height, `${field}.height`);
  validateQuantity(geometry.area, `${field}.area`);
  if (geometry.elevation !== undefined) {
    validateQuantity(geometry.elevation, `${field}.elevation`);
  }
  if (geometry.sillHeight !== undefined) {
    validateQuantity(geometry.sillHeight, `${field}.sillHeight`);
  }
  if (geometry.headHeight !== undefined) {
    validateQuantity(geometry.headHeight, `${field}.headHeight`);
  }
  // Width/height are lengths; area is an area unit. The family
  // check runs through the unit vocabulary (fail closed on
  // mismatch), preventing a square unit on a width.
  for (const dim of ["width", "height"] as const) {
    const unit = geometry[dim].unit;
    if (
      unit !== "meter" &&
      unit !== "millimeter" &&
      unit !== "centimeter" &&
      unit !== "inch" &&
      unit !== "foot"
    ) {
      throw new EngineeringModelError(
        "MISMATCHED_UNITS",
        `${field}.${dim} must carry a length unit: ${String(unit)}`,
        { details: { field: `${field}.${dim}.unit`, value: String(unit) } },
      );
    }
  }
  if (
    geometry.area.unit !== "square_meter" &&
    geometry.area.unit !== "square_millimeter" &&
    geometry.area.unit !== "square_centimeter" &&
    geometry.area.unit !== "square_inch" &&
    geometry.area.unit !== "square_foot"
  ) {
    throw new EngineeringModelError(
      "MISMATCHED_UNITS",
      `${field}.area must carry an area unit: ${String(geometry.area.unit)}`,
      { details: { field: `${field}.area.unit`, value: String(geometry.area.unit) } },
    );
  }

  validateQuality(geometry.quality, field);
  return { ...geometry };
}

/** Validates a geometry asset reference (fail closed). */
export function geometryAssetRef(ref: GeometryAssetRef): GeometryAssetRef {
  if (ref.kind !== "point-cloud") {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `geometryAssetRef.kind must be "point-cloud" in v1: ${String(ref.kind)}`,
      { details: { field: "geometryAssetRef.kind", value: String(ref.kind) } },
    );
  }
  if (!/^[0-9a-f]{64}$/.test(ref.contentHash)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `geometryAssetRef.contentHash must be a lowercase 64-hex hash: ${String(ref.contentHash)}`,
      { details: { field: "geometryAssetRef.contentHash", value: String(ref.contentHash) } },
    );
  }
  if (!Number.isInteger(ref.pointCount) || ref.pointCount < 1) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `geometryAssetRef.pointCount must be a positive integer: ${String(ref.pointCount)}`,
      { details: { field: "geometryAssetRef.pointCount", value: String(ref.pointCount) } },
    );
  }
  if (
    ref.epistemic !== "OBSERVED" &&
    ref.epistemic !== "INFERRED" &&
    ref.epistemic !== "CONFIRMED" &&
    ref.epistemic !== "PROPOSED"
  ) {
    throw new EngineeringModelError(
      "EPISTEMIC_INVALID",
      `geometryAssetRef.epistemic must be an epistemic state: ${String(ref.epistemic)}`,
      { details: { field: "geometryAssetRef.epistemic", value: String(ref.epistemic) } },
    );
  }
  return { ...ref };
}

function validateFrame(frame: PlaneFrame): void {
  validateVec3(frame.planePoint, "frame.planePoint", false);
  validateVec3(frame.normal, "frame.normal", true);
  validateVec3(frame.axisU, "frame.axisU", true);
  validateVec3(frame.axisV, "frame.axisV", true);
  // axisU × normal must not be parallel... the meaningful in-plane
  // check: both axes orthogonal to the normal and to each other.
  if (Math.abs(dot(frame.axisU, frame.normal)) > UNIT_LENGTH_TOLERANCE) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      "frame.axisU must be orthogonal to the plane normal",
      { details: { field: "frame.axisU" } },
    );
  }
  if (Math.abs(dot(frame.axisV, frame.normal)) > UNIT_LENGTH_TOLERANCE) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      "frame.axisV must be orthogonal to the plane normal",
      { details: { field: "frame.axisV" } },
    );
  }
  if (Math.abs(dot(frame.axisU, frame.axisV)) > UNIT_LENGTH_TOLERANCE) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      "frame.axisU and frame.axisV must be orthogonal",
      { details: { field: "frame.axisV" } },
    );
  }
}

function validateRectangle(rectangle: PlaneRectangle, frame: PlaneFrame): void {
  for (const bound of ["uMin", "uMax", "vMin", "vMax"] as const) {
    if (!Number.isFinite(rectangle[bound])) {
      throw new EngineeringModelError(
        "VALUE_INVALID",
        `rectangle.${bound} must be finite: ${String(rectangle[bound])}`,
        { details: { field: `rectangle.${bound}`, value: String(rectangle[bound]) } },
      );
    }
  }
  if (!(rectangle.uMax > rectangle.uMin) || !(rectangle.vMax > rectangle.vMin)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `rectangle bounds are empty: u ∈ [${rectangle.uMin}, ${rectangle.uMax}], v ∈ [${rectangle.vMin}, ${rectangle.vMax}]`,
      {
        details: {
          uMin: String(rectangle.uMin),
          uMax: String(rectangle.uMax),
          vMin: String(rectangle.vMin),
          vMax: String(rectangle.vMax),
        },
      },
    );
  }
  validateVec3(rectangle.center, "rectangle.center", false);
  if (rectangle.corners.length !== 4) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `rectangle.corners must have exactly 4 entries: ${String(rectangle.corners.length)}`,
      { details: { field: "rectangle.corners", value: String(rectangle.corners.length) } },
    );
  }
  rectangle.corners.forEach((corner, index) =>
    validateVec3(corner, `rectangle.corners[${index}]`, false),
  );
  // The rectangle must live in its own plane frame (center on the plane).
  const centerOffset = {
    x: rectangle.center.x - frame.planePoint.x,
    y: rectangle.center.y - frame.planePoint.y,
    z: rectangle.center.z - frame.planePoint.z,
  };
  if (Math.abs(dot(centerOffset, frame.normal)) > 1e-6) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      "rectangle.center must lie in the geometry plane (distance to plane above tolerance)",
      { details: { field: "rectangle.center" } },
    );
  }
}

function validateQuality(quality: GeometryQualityMetrics, field: string): void {
  if (!Number.isInteger(quality.pointCount) || quality.pointCount < 1) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `${field}.quality.pointCount must be a positive integer: ${String(quality.pointCount)}`,
      { details: { field: `${field}.quality.pointCount`, value: String(quality.pointCount) } },
    );
  }
  for (const metric of ["residualRms", "residualMaxAbs"] as const) {
    if (!Number.isFinite(quality[metric]) || quality[metric] < 0) {
      throw new EngineeringModelError(
        "VALUE_INVALID",
        `${field}.quality.${metric} must be finite ≥ 0: ${String(quality[metric])}`,
        { details: { field: `${field}.quality.${metric}`, value: String(quality[metric]) } },
      );
    }
  }
  if (quality.residualMaxAbs < quality.residualRms) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `${field}.quality.residualMaxAbs must be ≥ residualRms`,
      { details: { field: `${field}.quality` } },
    );
  }
}

function validateVec3(value: Vec3, field: string, requireUnit: boolean): void {
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(value[axis])) {
      throw new EngineeringModelError(
        "VALUE_INVALID",
        `${field}.${axis} must be finite: ${String(value[axis])}`,
        { details: { field: `${field}.${axis}`, value: String(value[axis]) } },
      );
    }
  }
  if (requireUnit) {
    const magnitude = Math.sqrt(dot(value, value));
    if (Math.abs(magnitude - 1) > UNIT_LENGTH_TOLERANCE) {
      throw new EngineeringModelError(
        "MODEL_INVALID",
        `${field} must be a unit vector (|v| = ${magnitude})`,
        { details: { field, magnitude: String(magnitude) } },
      );
    }
  }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
