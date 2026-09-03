/**
 * Structured geometry construction (AISE-010, stage 3).
 *
 * Turns a classified planar cluster into STRUCTURED architectural
 * geometry: a deterministic in-plane 2D frame and an oriented
 * bounding rectangle with 3D corners, dimensions, area, and
 * first-order propagated uncertainty.
 *
 * Conventions (pinned, documented, tested):
 *
 * - **Wall frame**: axis U is IN-PLANE HORIZONTAL
 *   (`normalize(up × normal)`); axis V is IN-PLANE VERTICAL
 *   (`normal × U`), flipped to point UP (positive dot with the
 *   scene up axis). Width runs along U, height along V.
 * - **Horizontal frame (floor/ceiling)**: reference unit axis with
 *   the smallest |dot| against the (reoriented) normal, ties broken
 *   by x→y→z order; E = reference minus its normal component; F =
 *   normal × E. Both axes lie in the plane; the construction is a
 *   pure function of the normal.
 * - **Rectangle**: extremes of the in-plane coordinates over the
 *   cluster points; corners in canonical order
 *   (uMin,vMin) → (uMax,vMin) → (uMax,vMax) → (uMin,vMax), anchored
 *   on the fitted plane point. Width/height/area carry units.
 *
 * Uncertainty model (first-order, GUM-style, carried honestly —
 * approximations documented, never silently dropped):
 *
 * - **Extents** (max−min of two point coordinates): √2·σ for
 *   independent per-point σ. Conservative: extreme-value bias is
 *   ignored (stated, not hidden). Absent σ → "not stated", never 0.
 * - **Area** (width × height): relative RSS,
 *   σ_area = area·√((σ_w/w)² + (σ_h/h)²), present iff both extent
 *   uncertainties exist.
 * - **Grid-quantized extents** (openings, module `openings.ts`):
 *   per-edge σ = res/√12 (rectangular distribution over one cell);
 *   dimension σ = √2·res/√12 = res/√6.
 */
import { SemanticsError } from "./errors.js";
import { assertFiniteNumber } from "./validate.js";
import {
  vec3Add,
  vec3Cross,
  vec3Dot,
  vec3Normalize,
  vec3Scale,
  type GeomPoint,
  type LengthUnit,
  type Measurement,
  type StandardUncertainty,
  type Vec3,
} from "@aise/backend-geometry";

/** Area units (square counterparts of the AISE-009 length units). */
export type AreaUnit =
  | "square_meter"
  | "square_millimeter"
  | "square_centimeter"
  | "square_inch"
  | "square_foot";

/** Maps a length unit to its square counterpart. */
export function squareUnitOf(unit: LengthUnit): AreaUnit {
  switch (unit) {
    case "meter":
      return "square_meter";
    case "millimeter":
      return "square_millimeter";
    case "centimeter":
      return "square_centimeter";
    case "inch":
      return "square_inch";
    case "foot":
      return "square_foot";
  }
}

/** An area measurement (value + area unit + optional 1σ uncertainty). */
export interface AreaMeasurement {
  readonly value: number;
  readonly unit: AreaUnit;
  readonly uncertainty?: StandardUncertainty;
}

/** A deterministic in-plane 2D coordinate frame on a plane. */
export interface PlaneFrame {
  /** A point on the plane (anchor of the rectangle coordinates). */
  readonly planePoint: GeomPoint;
  /** The plane's unit normal (orientation recorded in provenance). */
  readonly normal: Vec3;
  /** First in-plane axis (horizontal for walls). */
  readonly axisU: Vec3;
  /** Second in-plane axis (vertical, pointing up, for walls). */
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
  readonly center: GeomPoint;
  /** Corners in canonical order: (uMin,vMin),(uMax,vMin),(uMax,vMax),(uMin,vMax). */
  readonly corners: readonly GeomPoint[];
}

/** Rectangle + dimension measurements with uncertainty. */
export interface StructuredRectangle {
  readonly frame: PlaneFrame;
  readonly rectangle: PlaneRectangle;
  readonly width: Measurement;
  readonly height: Measurement;
  readonly area: AreaMeasurement;
}

/**
 * Builds the in-plane frame for a VERTICAL plane (wall): U
 * horizontal in-plane, V vertical in-plane pointing up. Fails
 * closed (`DEGENERATE_GEOMETRY`) when the normal is (near-)parallel
 * to the up axis — that plane is not vertical and has no wall
 * frame.
 */
export function buildWallFrame(planePoint: GeomPoint, normal: Vec3, up: Vec3): PlaneFrame {
  const horizontal = vec3Cross(up, normal);
  const horizontalNorm = Math.hypot(horizontal.x, horizontal.y, horizontal.z);
  if (horizontalNorm < 1e-9) {
    throw new SemanticsError(
      "DEGENERATE_GEOMETRY",
      "cannot build a wall frame for a plane whose normal is parallel to the up axis — the plane is horizontal, not vertical",
      { details: { horizontalNorm: String(horizontalNorm) } },
    );
  }
  const axisU: Vec3 = {
    x: horizontal.x / horizontalNorm,
    y: horizontal.y / horizontalNorm,
    z: horizontal.z / horizontalNorm,
  };
  let axisV = vec3Cross(normal, axisU);
  if (vec3Dot(axisV, up) < 0) {
    axisV = { x: -axisV.x, y: -axisV.y, z: -axisV.z };
  }
  return { planePoint, normal, axisU, axisV };
}

/**
 * Builds the in-plane frame for a HORIZONTAL plane (floor or
 * ceiling). Reference axis = the unit coordinate axis least
 * aligned with the normal (ties by x→y→z); E = reference minus its
 * normal component (normalized); F = normal × E. Pure function of
 * the normal — the same normal always yields the same frame.
 */
export function buildHorizontalFrame(planePoint: GeomPoint, normal: Vec3): PlaneFrame {
  const referenceAxes: readonly Vec3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];
  let best = referenceAxes[0] as Vec3;
  let bestAbs = Math.abs(vec3Dot(best, normal));
  for (let i = 1; i < referenceAxes.length; i += 1) {
    const candidate = referenceAxes[i] as Vec3;
    const candidateAbs = Math.abs(vec3Dot(candidate, normal));
    if (candidateAbs < bestAbs) {
      best = candidate;
      bestAbs = candidateAbs;
    }
  }
  const dot = vec3Dot(best, normal);
  const projected = {
    x: best.x - dot * normal.x,
    y: best.y - dot * normal.y,
    z: best.z - dot * normal.z,
  };
  const axisU = vec3Normalize(projected, "horizontal frame axis E");
  const axisV = vec3Cross(normal, axisU);
  return { planePoint, normal, axisU, axisV };
}

/**
 * Computes the oriented bounding rectangle of the cluster points in
 * the given plane frame, with dimension/area measurements and
 * first-order uncertainty (see module doc). The normal component of
 * each point is irrelevant by construction (both axes are
 * in-plane), so this equals the rectangle of the plane-projected
 * points.
 */
export function rectangleInFrame(
  points: readonly GeomPoint[],
  frame: PlaneFrame,
  unit: LengthUnit,
  perPointStandardUncertainty?: number,
): StructuredRectangle {
  if (points.length === 0) {
    throw new SemanticsError("INSUFFICIENT_POINTS", "cannot build a rectangle from zero points", {
      details: {},
    });
  }
  let uMin = Number.POSITIVE_INFINITY;
  let uMax = Number.NEGATIVE_INFINITY;
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const du = (p.x - frame.planePoint.x) * frame.axisU.x + (p.y - frame.planePoint.y) * frame.axisU.y + (p.z - frame.planePoint.z) * frame.axisU.z;
    const dv = (p.x - frame.planePoint.x) * frame.axisV.x + (p.y - frame.planePoint.y) * frame.axisV.y + (p.z - frame.planePoint.z) * frame.axisV.z;
    if (du < uMin) uMin = du;
    if (du > uMax) uMax = du;
    if (dv < vMin) vMin = dv;
    if (dv > vMax) vMax = dv;
  }
  const width = uMax - uMin;
  const height = vMax - vMin;
  assertFiniteNumber(width, "rectangle width");
  assertFiniteNumber(height, "rectangle height");
  if (width <= 0 || height <= 0) {
    throw new SemanticsError(
      "DEGENERATE_GEOMETRY",
      "rectangle extents must be positive — the cluster collapses in a plane direction",
      { details: { width: String(width), height: String(height) } },
    );
  }

  const centerU = (uMin + uMax) / 2;
  const centerV = (vMin + vMax) / 2;
  const origin = frame.planePoint;
  const cornerAt = (u: number, v: number): GeomPoint =>
    vec3Add(
      { x: origin.x, y: origin.y, z: origin.z },
      vec3Add(vec3Scale(frame.axisU, u), vec3Scale(frame.axisV, v)),
    );
  const rectangle: PlaneRectangle = {
    uMin,
    uMax,
    vMin,
    vMax,
    center: cornerAt(centerU, centerV),
    corners: [
      cornerAt(uMin, vMin),
      cornerAt(uMax, vMin),
      cornerAt(uMax, vMax),
      cornerAt(uMin, vMax),
    ],
  };

  const sigmaPoint = perPointStandardUncertainty;
  const extentUncertainty =
    sigmaPoint !== undefined && Number.isFinite(sigmaPoint) && sigmaPoint > 0
      ? Math.SQRT2 * sigmaPoint
      : undefined;
  const areaValue = width * height;
  const areaUncertainty =
    extentUncertainty !== undefined
      ? areaValue * Math.sqrt((extentUncertainty / width) ** 2 + (extentUncertainty / height) ** 2)
      : undefined;

  return {
    frame,
    rectangle,
    width: {
      value: width,
      unit,
      ...(extentUncertainty !== undefined
        ? { uncertainty: { kind: "standard", u: extentUncertainty } }
        : {}),
    },
    height: {
      value: height,
      unit,
      ...(extentUncertainty !== undefined
        ? { uncertainty: { kind: "standard", u: extentUncertainty } }
        : {}),
    },
    area: {
      value: areaValue,
      unit: squareUnitOf(unit),
      ...(areaUncertainty !== undefined
        ? { uncertainty: { kind: "standard", u: areaUncertainty } }
        : {}),
    },
  };
}
