/**
 * Deterministic angle queries (AISE-009).
 *
 * Conventions (explicit — angles between geometric entities are
 * conventionally ambiguous, so each query pins its own):
 *
 * - **line ↔ line** — the ACUTE angle between the direction
 *   vectors, ∈ [0, π/2]: lines are undirected, so 170° and 10° are
 *   the same angle and reported as 10° (via |cos|). Parallel lines
 *   → 0; orthogonal lines → π/2.
 * - **line ↔ plane** — the angle between the line and its
 *   projection onto the plane, ∈ [0, π/2] (equivalently
 *   asin(|d̂·n̂|)): a line lying in (or parallel to) the plane → 0;
 *   a line perpendicular to the plane → π/2.
 * - **plane ↔ plane** — the ACUTE dihedral angle between the
 *   normals, ∈ [0, π/2] (via |cos| of n̂₁·n̂₂): parallel planes → 0;
 *   orthogonal planes → π/2.
 *
 * All results are in radians with the unit field set to
 * `"radian"`; use `convertMeasurement` for degrees/gon.
 *
 * Numerical note: acos/asin are transcendental — the only place
 * this package leaves the exactly-specified IEEE-754 operation
 * set. Inputs to them are clamped to [−1, 1] to keep the result
 * finite even under floating-point roundoff (a dot product of
 * unit vectors can be 1 + 2⁻⁵²). Everything downstream of the
 * single acos/asin call is again exactly-specified arithmetic.
 *
 * Uncertainty propagation (first-order): for an angle θ between
 * two directions each carrying an angular 1σ (u₁, u₂ — line
 * direction or plane normal σ), u_θ = √(u₁² + u₂²) when BOTH are
 * stated; otherwise absent ("not stated", never zero).
 *
 * Epistemic semantics: the result carries the WEAKEST input state.
 */
import { requireSameUnit } from "../units.js";
import { buildDerivedMeasurement, type DerivedMeasurement } from "./measure.js";
import type { LineEntity, PlaneEntity } from "./entities.js";

const EPS = 1e-12;

/** Clamp a cosine/sine argument into [−1, 1] (guards roundoff). */
function clampUnitInterval(value: number): number {
  if (value > 1) {
    return 1;
  }
  if (value < -1) {
    return -1;
  }
  return value;
}

/** Acute angle between two lines, ∈ [0, π/2] (radians). */
export function angleLineToLine(a: LineEntity, b: LineEntity): DerivedMeasurement {
  requireSameUnit(a.unit, b.unit);
  const dot =
    a.direction.x * b.direction.x +
    a.direction.y * b.direction.y +
    a.direction.z * b.direction.z;
  const acuteCos = Math.abs(clampUnitInterval(dot));
  const value = Math.acos(acuteCos);

  const uA = a.directionStandardUncertainty;
  const uB = b.directionStandardUncertainty;
  const uncertainty =
    uA !== undefined && uB !== undefined
      ? { kind: "standard" as const, u: Math.sqrt((uA as number) ** 2 + (uB as number) ** 2) }
      : undefined;

  return buildDerivedMeasurement({
    method: "angle/line-line",
    parameters: {
      convention: "acute-undirected",
      range: "[0, pi/2]",
      resultUnit: "radian",
      clampEps: EPS,
    },
    entities: [a, b],
    value,
    unit: "radian",
    ...(uncertainty === undefined ? {} : { uncertainty }),
  });
}

/** Angle between a line and a plane, ∈ [0, π/2] (radians). */
export function angleLineToPlane(line: LineEntity, plane: PlaneEntity): DerivedMeasurement {
  requireSameUnit(line.unit, plane.unit);
  const dot =
    line.direction.x * plane.normal.x +
    line.direction.y * plane.normal.y +
    line.direction.z * plane.normal.z;
  const value = Math.asin(Math.abs(clampUnitInterval(dot)));

  const uLine = line.directionStandardUncertainty;
  const uPlane = plane.normalStandardUncertainty;
  const uncertainty =
    uLine !== undefined && uPlane !== undefined
      ? { kind: "standard" as const, u: Math.sqrt((uLine as number) ** 2 + (uPlane as number) ** 2) }
      : undefined;

  return buildDerivedMeasurement({
    method: "angle/line-plane",
    parameters: {
      convention: "line-vs-projection-on-plane",
      range: "[0, pi/2]",
      resultUnit: "radian",
      clampEps: EPS,
    },
    entities: [line, plane],
    value,
    unit: "radian",
    ...(uncertainty === undefined ? {} : { uncertainty }),
  });
}

/** Acute dihedral angle between two planes, ∈ [0, π/2] (radians). */
export function anglePlaneToPlane(a: PlaneEntity, b: PlaneEntity): DerivedMeasurement {
  requireSameUnit(a.unit, b.unit);
  const dot =
    a.normal.x * b.normal.x +
    a.normal.y * b.normal.y +
    a.normal.z * b.normal.z;
  const acuteCos = Math.abs(clampUnitInterval(dot));
  const value = Math.acos(acuteCos);

  const uA = a.normalStandardUncertainty;
  const uB = b.normalStandardUncertainty;
  const uncertainty =
    uA !== undefined && uB !== undefined
      ? { kind: "standard" as const, u: Math.sqrt((uA as number) ** 2 + (uB as number) ** 2) }
      : undefined;

  return buildDerivedMeasurement({
    method: "angle/plane-plane",
    parameters: {
      convention: "acute-dihedral",
      range: "[0, pi/2]",
      resultUnit: "radian",
      clampEps: EPS,
    },
    entities: [a, b],
    value,
    unit: "radian",
    ...(uncertainty === undefined ? {} : { uncertainty }),
  });
}
