/**
 * Deterministic distance queries (AISE-009).
 *
 * Conventions (explicit, per the work order's "explicit units" and
 * "defined conventions" requirements):
 *
 * - **point ↔ point** — Euclidean distance, unsigned, in the
 *   entities' common unit (mismatched units fail closed).
 * - **point ↔ line** — perpendicular distance from the point to
 *   the INFINITE line (not a segment), unsigned.
 * - **point ↔ plane** — `signedDistancePointPlane` returns the
 *   signed distance `dot(p − p₀, n̂)`: positive on the side the
 *   normal points to, negative behind; `distancePointPlane`
 *   returns the unsigned magnitude. The sign is defined relative
 *   to the caller-supplied normal orientation — documented, not
 *   guessed.
 *
 * Uncertainty propagation (first-order, isotropic per-axis σ):
 *
 * - point–point: u = √(σ₁² + σ₂²) — requires BOTH σ stated; if
 *   either is absent, the result carries NO uncertainty (absent is
 *   "not stated", never zero);
 * - point–line: u = √(σ_p² + σ_a² + (L·u_θ)²) with L the along-axis
 *   separation |(p − a)·d̂| and u_θ the line direction angular σ;
 *   requires every involved σ stated;
 * - point–plane: u = √(σ_p² + σ_a² + (r·u_θ)²) with r the in-plane
 *   distance between the point and the plane's anchor, u_θ the
 *   normal angular σ; requires every involved σ stated.
 *
 * Epistemic semantics: the result carries the WEAKEST input state
 * (e.g. an OBSERVED point measured against an INFERRED line yields
 * an INFERRED distance). Provenance pins both entities.
 */
import { requireSameUnit } from "../units.js";
import { buildDerivedMeasurement, type DerivedMeasurement } from "./measure.js";
import type { LineEntity, PlaneEntity, PointEntity } from "./entities.js";

/** Point-to-point Euclidean distance. */
export function distancePointToPoint(a: PointEntity, b: PointEntity): DerivedMeasurement {
  requireSameUnit(a.unit, b.unit);
  const dx = b.point.x - a.point.x;
  const dy = b.point.y - a.point.y;
  const dz = b.point.z - a.point.z;
  const value = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const uncertainty =
    a.standardUncertainty !== undefined && b.standardUncertainty !== undefined
      ? {
          kind: "standard" as const,
          u: Math.sqrt(
            (a.standardUncertainty as number) ** 2 + (b.standardUncertainty as number) ** 2,
          ),
        }
      : undefined;
  return buildDerivedMeasurement({
    method: "distance/point-point",
    parameters: { unit: a.unit, leftKind: "point", rightKind: "point" },
    entities: [a, b],
    value,
    unit: a.unit,
    ...(uncertainty === undefined ? {} : { uncertainty }),
  });
}

/** Perpendicular distance from a point to an infinite line (unsigned). */
export function distancePointToLine(point: PointEntity, line: LineEntity): DerivedMeasurement {
  requireSameUnit(point.unit, line.unit);
  const dx = point.point.x - line.point.x;
  const dy = point.point.y - line.point.y;
  const dz = point.point.z - line.point.z;
  // Perpendicular component: v − (v·d)d.
  const along = dx * line.direction.x + dy * line.direction.y + dz * line.direction.z;
  const px = dx - along * line.direction.x;
  const py = dy - along * line.direction.y;
  const pz = dz - along * line.direction.z;
  const value = Math.sqrt(px * px + py * py + pz * pz);

  const uPoint = point.standardUncertainty;
  const uAnchor = line.standardUncertainty;
  const uDirection = line.directionStandardUncertainty;
  const uncertainty =
    uPoint !== undefined && uAnchor !== undefined && uDirection !== undefined
      ? {
          kind: "standard" as const,
          u: Math.sqrt(
            (uPoint as number) ** 2 +
              (uAnchor as number) ** 2 +
              (Math.abs(along) * (uDirection as number)) ** 2,
          ),
        }
      : undefined;

  return buildDerivedMeasurement({
    method: "distance/point-line",
    parameters: { unit: point.unit, lineConvention: "infinite", sign: "unsigned-perpendicular" },
    entities: [point, line],
    value,
    unit: point.unit,
    ...(uncertainty === undefined ? {} : { uncertainty }),
  });
}

/**
 * Signed distance from a point to a plane: positive on the side the
 * normal points toward (`dot(p − p₀, n̂)`), negative behind.
 */
export function signedDistancePointToPlane(point: PointEntity, plane: PlaneEntity): DerivedMeasurement {
  return pointPlaneMeasurement(point, plane, "distance/point-plane-signed", true);
}

/** Unsigned distance from a point to a plane. */
export function distancePointToPlane(point: PointEntity, plane: PlaneEntity): DerivedMeasurement {
  return pointPlaneMeasurement(point, plane, "distance/point-plane", false);
}

function pointPlaneMeasurement(
  point: PointEntity,
  plane: PlaneEntity,
  method: string,
  signed: boolean,
): DerivedMeasurement {
  requireSameUnit(point.unit, plane.unit);
  const dx = point.point.x - plane.point.x;
  const dy = point.point.y - plane.point.y;
  const dz = point.point.z - plane.point.z;
  const alongNormal = dx * plane.normal.x + dy * plane.normal.y + dz * plane.normal.z;
  const value = signed ? alongNormal : Math.abs(alongNormal);

  const uPoint = point.standardUncertainty;
  const uAnchor = plane.standardUncertainty;
  const uNormal = plane.normalStandardUncertainty;
  let uncertainty:
    | { kind: "standard"; u: number }
    | undefined;
  if (uPoint !== undefined && uAnchor !== undefined && uNormal !== undefined) {
    // In-plane lever arm r: distance from the plane's anchor to the
    // point's projection onto the plane.
    const rx = dx - alongNormal * plane.normal.x;
    const ry = dy - alongNormal * plane.normal.y;
    const rz = dz - alongNormal * plane.normal.z;
    const lever = Math.sqrt(rx * rx + ry * ry + rz * rz);
    uncertainty = {
      kind: "standard",
      u: Math.sqrt(
        (uPoint as number) ** 2 +
          (uAnchor as number) ** 2 +
          (lever * (uNormal as number)) ** 2,
      ),
    };
  }

  return buildDerivedMeasurement({
    method,
    parameters: {
      unit: point.unit,
      sign: signed ? "positive-toward-normal" : "unsigned",
      planeConvention: "infinite",
    },
    entities: [point, plane],
    value,
    unit: point.unit,
    ...(uncertainty === undefined ? {} : { uncertainty }),
  });
}
