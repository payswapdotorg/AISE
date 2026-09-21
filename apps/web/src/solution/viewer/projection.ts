/**
 * PROD-024 — deterministic PROJECTION of the workspace scene (the house
 * AISE-021 wireframe discipline, carried into the solution viewer).
 *
 * Two documented, hand-verifiable orthographic projections of world-metre
 * polygons:
 *
 *  - AXONOMETRIC (the 3D browsing aid): for a world point p = (x, y, z)
 *    and view parameters (azimuth az, elevation el), both in radians —
 *
 *        screenX = x·sin(az) − y·cos(az)
 *        screenY = x·cos(az)·sin(el) + y·sin(az)·sin(el) − z·cos(el)
 *
 *    (screen Y grows downward as SVG requires; points are quantized to the
 *    1 µm grid so sin/cos float dust never reaches the rendered bytes);
 *
 *  - PLAN (the 2D floor-plan view): screenX = x, screenY = −y (north up).
 *
 * This is an engineering BROWSING aid, NOT a 3D rendering engine: no
 * meshes, shading, occlusion or materials — exactly the AISE-021 scope
 * discipline. Pure and total: finite input → finite output; the input is
 * never mutated.
 */

import type { Vec3 } from "./model";
import type { Point2D } from "./format";

/** View parameters of the axonometric projection (radians). */
export interface ProjectionView {
  readonly azimuthRad: number;
  readonly elevationRad: number;
}

/** 1 µm quantization with −0 canonicalization (float-dust-free bytes). */
function quantize(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/** Projects ONE world point with the documented axonometric formulas. */
export function projectAxonometric(point: Vec3, view: ProjectionView): Point2D {
  const [x, y, z] = point;
  const sinAz = Math.sin(view.azimuthRad);
  const cosAz = Math.cos(view.azimuthRad);
  const sinEl = Math.sin(view.elevationRad);
  const cosEl = Math.cos(view.elevationRad);
  const screenX = quantize(x * sinAz - y * cosAz);
  const screenY = quantize(x * cosAz * sinEl + y * sinAz * sinEl - z * cosEl);
  return [screenX, screenY];
}

/** Projects ONE world point onto the plan view (x east, north up). */
export function projectPlan(point: Vec3): Point2D {
  return [quantize(point[0]), quantize(-point[1])];
}

/** Projects one polygon through either projection (verbatim order). */
export function projectPolygon(
  polygon: readonly Vec3[],
  view: ProjectionView,
  projection: "plan" | "axonometric",
): readonly Point2D[] {
  return polygon.map((point) =>
    projection === "plan" ? projectPlan(point) : projectAxonometric(point, view),
  );
}
