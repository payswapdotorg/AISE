/**
 * Deterministic measurements with first-order uncertainty propagation
 * (AISE-013).
 *
 * Every measurement returns `{ value, uncertainty }` where `uncertainty` is
 * the propagated physical 1σ (never a confidence — see uncertainty.ts) or
 * null when any contributing σ is unknown. null is NEVER silently replaced
 * by 0; conversely 0 is a legitimate EXPLICIT "measured exactly" input.
 * Optional σ parameters that are omitted are treated as UNKNOWN (null), so
 * a caller asserting an exact reference plane passes uNormal = 0 explicitly.
 *
 * Formulas (documented per the work order; all first-order / linear):
 *
 *  - distancePointPoint(a, σa, b, σb):
 *      d = |a − b|.  With σa, σb the isotropic per-axis 1σ of each point's
 *      position and independent errors: ∂d/∂(a position) = û, ∂d/∂(b) = −û
 *      ⇒ var(δd) = σa²|û|² + σb²|û|² = σa² + σb².
 *      σ_d = sqrt(σa² + σb²).
 *
 *  - distancePointPlane(p, σp, plane, σn):
 *      s = n̂·p + d (signed; positive on the normal's side), with the plane
 *      normalized to a unit normal internally (scaling (n, d) by a common
 *      factor is the same plane). Query-point term: ∂s/∂p = n̂ ⇒ σp².
 *      Normal-direction term: σn is the ANGULAR 1σ of the normal (radians);
 *      rotating n̂ by θ about the plane point p₀ = −d·n̂ changes s by
 *      dot(δn, p − p₀), so the first-order worst case (Cauchy–Schwarz over
 *      in-plane rotation axes) contributes (σn·|p − p₀|)². This dominates
 *      the axial term |dot(n̂, p₀ − p)| = |s|, which it subsumes.
 *      σ_s = sqrt(σp² + (σn·|p − p₀|)²). The plane offset d itself is
 *      treated as exact in this signature (documented limitation: a fitted
 *      plane's offset σ must be composed by the caller).
 *
 *  - angleBetween(v1, v2, σ1, σ2):
 *      θ = acos(clamp(v̂1·v̂2)). With σ1, σ2 the angular 1σ of each
 *      direction and independent errors: δθ = −δc/sqrt(1−c²),
 *      var(δc) = (1−c²)(σ1² + σ2²) ⇒ var(δθ) = σ1² + σ2² — the
 *      sqrt(1−c²) factors cancel, so σ_θ = sqrt(σ1² + σ2²) is the exact
 *      first-order result for ALL angles including the small-angle regime.
 *      (Near c = ±1 the acos VALUE itself is ill-conditioned; the σ is not.)
 *
 *  - angleBetweenPlanes(p1, p2): acute dihedral θ = acos(|n̂1·n̂2|) ∈
 *      [0, π/2] — plane normals have no canonical orientation, so the acute
 *      angle is the orientation-independent convention. The signature
 *      carries no σ inputs, so uncertainty is null (never fabricated).
 *
 *  - dimensionBetweenParallelPlanes(p1, p2): non-negative separation
 *      |d1 − d2′| where d2′ is d2 flipped to normal-1's orientation; the
 *      measured inter-normal angle must be within
 *      PARALLEL_ANGLE_TOLERANCE_RAD or a NON_PARALLEL_PLANES error naming
 *      the measured angle is thrown. uncertainty is null (no σ inputs).
 */

import { GeometryError } from "./errors";
import type { Plane } from "./fitting";
import { propagateUncertainty, type Measurement } from "./uncertainty";
import {
  canonicalZero,
  type Vec3,
  vecDot,
  vecNorm,
  vecScale,
  vecSub,
} from "./vector";

/** Signed point-plane distance with both magnitude and absolute value. */
export interface PointPlaneDistance extends Measurement {
  /** |value| — the unsigned distance. */
  readonly absolute: number;
}

/**
 * Maximum inter-normal angle (radians) still accepted as "parallel" by
 * dimensionBetweenParallelPlanes. Named constant (~0.0057°); the typed
 * error names the measured angle so borderline callers see the deviation.
 */
export const PARALLEL_ANGLE_TOLERANCE_RAD = 1e-4;

/** Normalize a plane to a unit normal (scaling (n, d) is the same plane). */
function normalizePlane(plane: Plane): Plane {
  const scale = vecNorm(plane.normal);
  if (scale === 0) {
    throw new GeometryError(
      "DEGENERATE_PLANE_NORMAL",
      "plane normal has zero length; the plane is undefined",
    );
  }
  return {
    normal: [
      plane.normal[0] / scale,
      plane.normal[1] / scale,
      plane.normal[2] / scale,
    ],
    d: plane.d / scale,
  };
}

/**
 * Euclidean point-point distance. σa/σb are the isotropic per-axis 1σ of
 * each point (null = unknown ⇒ null result). See the module header for the
 * sqrt(σa² + σb²) derivation.
 */
export function distancePointPoint(
  a: Vec3,
  ua: number | null,
  b: Vec3,
  ub: number | null,
): Measurement {
  const delta = vecSub(a, b);
  const value = vecNorm(delta);
  return propagateUncertainty(value, [1, 1], [ua, ub]);
}

/**
 * Signed distance from a point to a plane: value = n̂·p + d (positive on
 * the normal's side), absolute = |value|. up is the point's isotropic
 * per-axis 1σ; uNormal (default null = unknown) is the plane normal's
 * ANGULAR 1σ in radians (pass 0 explicitly for an exact reference plane).
 * σ_s = sqrt(up² + (uNormal·|p − p₀|)²) with p₀ = −d·n̂ — see header.
 */
export function distancePointPlane(
  p: Vec3,
  up: number | null,
  plane: Plane,
  uNormal: number | null = null,
): PointPlaneDistance {
  const unit = normalizePlane(plane);
  const signed = vecDot(unit.normal, p) + unit.d;
  const value = canonicalZero(signed);

  // First-order rotation sensitivity about p₀ = −d·n̂: |p − p₀|.
  const pivot = vecScale(unit.normal, -unit.d);
  const leverArm = vecNorm(vecSub(p, pivot));
  const measurement = propagateUncertainty(value, [1, leverArm], [
    up,
    uNormal,
  ]);

  return {
    value,
    absolute: canonicalZero(Math.abs(value)),
    uncertainty: measurement.uncertainty,
  };
}

/**
 * Angle between two vectors, in radians (0 … π). u1/u2 are the vectors'
 * angular 1σ in radians (null/omitted = unknown ⇒ null result).
 * σ_θ = sqrt(u1² + u2²) — the exact first-order result at every angle; see
 * the header derivation. Zero-length vector ⇒ typed ZERO_LENGTH_VECTOR.
 */
export function angleBetween(
  v1: Vec3,
  v2: Vec3,
  u1: number | null = null,
  u2: number | null = null,
): Measurement {
  const n1 = safeNormalize(v1, "first vector");
  const n2 = safeNormalize(v2, "second vector");
  const cosine = Math.min(1, Math.max(-1, vecDot(n1, n2)));
  const value = Math.acos(cosine);
  return propagateUncertainty(value, [1, 1], [u1, u2]);
}

/**
 * Acute dihedral angle between two planes: acos(|n̂1·n̂2|) ∈ [0, π/2]
 * (orientation-independent convention). uncertainty is null — the
 * signature carries no σ inputs and none is fabricated; compose with
 * angleBetween on the normals when their σs are known. Zero-length normal
 * ⇒ typed DEGENERATE_PLANE_NORMAL.
 */
export function angleBetweenPlanes(p1: Plane, p2: Plane): Measurement {
  const n1 = safePlaneNormal(p1, "first plane");
  const n2 = safePlaneNormal(p2, "second plane");
  const cosine = Math.min(1, Math.max(-1, Math.abs(vecDot(n1, n2))));
  return { value: Math.acos(cosine), uncertainty: null };
}

/**
 * Dimension (height/width) between two parallel planes: the non-negative
 * separation |d1 − d2′| along the common normal, where d2′ is plane 2's
 * offset re-expressed in plane 1's normal orientation. Always ≥ 0
 * (documented sign convention: separation magnitude; for a signed offset
 * use distancePointPlane against one plane). Non-parallel beyond
 * PARALLEL_ANGLE_TOLERANCE_RAD ⇒ typed NON_PARALLEL_PLANES error naming
 * the measured angle. uncertainty is null — no σ inputs in the signature.
 */
export function dimensionBetweenParallelPlanes(
  p1: Plane,
  p2: Plane,
): Measurement {
  const unit1 = normalizePlane(p1);
  const unit2 = normalizePlane(p2);
  const alignment = vecDot(unit1.normal, unit2.normal);
  const deviation = Math.acos(Math.min(1, Math.max(-1, Math.abs(alignment))));
  if (deviation > PARALLEL_ANGLE_TOLERANCE_RAD) {
    throw new GeometryError(
      "NON_PARALLEL_PLANES",
      `planes are not parallel: measured inter-normal angle ${deviation} rad (${(deviation * 180) / Math.PI}°) exceeds tolerance ${PARALLEL_ANGLE_TOLERANCE_RAD} rad`,
    );
  }
  // Express plane 2 with plane 1's normal orientation: n₂' = ±n₁ ⇒ d₂' = ±d₂.
  const d2Aligned = alignment >= 0 ? unit2.d : -unit2.d;
  const value = canonicalZero(Math.abs(unit1.d - d2Aligned));
  return { value, uncertainty: null };
}

function safeNormalize(v: Vec3, label: string): Vec3 {
  const norm = vecNorm(v);
  if (norm === 0) {
    throw new GeometryError(
      "ZERO_LENGTH_VECTOR",
      `angleBetween: ${label} has zero length; the angle is undefined`,
    );
  }
  return [v[0] / norm, v[1] / norm, v[2] / norm];
}

function safePlaneNormal(plane: Plane, label: string): Vec3 {
  const norm = vecNorm(plane.normal);
  if (norm === 0) {
    throw new GeometryError(
      "DEGENERATE_PLANE_NORMAL",
      `angleBetweenPlanes: ${label} has a zero-length normal; the dihedral angle is undefined`,
    );
  }
  return [
    plane.normal[0] / norm,
    plane.normal[1] / norm,
    plane.normal[2] / norm,
  ];
}
