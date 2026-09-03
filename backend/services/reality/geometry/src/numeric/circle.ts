/**
 * Deterministic 2D circle fitting (AISE-009).
 *
 * Used by the cylinder fit: once points are projected onto the
 * plane perpendicular to a candidate axis, the cross-section of a
 * cylinder is a circle. Two stages:
 *
 * 1. **Algebraic (Kása) fit** — the closed-form linear least
 *    squares solution of x² + y² + D·x + E·y + F = 0, solved via a
 *    3×3 normal-equations system with deterministic partial
 *    pivoting. Unbiased for full circles, cheap, and completely
 *    deterministic. Collinear projected points make the system
 *    singular → `DEGENERATE_GEOMETRY` (a line is a circle of
 *    infinite radius; we fail closed instead of returning one).
 *
 * 2. **Geometric refinement** — a bounded Gauss-Newton iteration on
 *    the true objective Σ(‖pᵢ − c‖ − R)² over (cx, cy, R). The
 *    Kása fit minimizes an algebraic surrogate, which is biased for
 *    partial arcs; the refinement removes that bias. Fixed
 *    iteration cap and convergence threshold; deterministic.
 *
 * Inputs arrive in canonical order (sorted by the caller) and are
 * accumulated in that order, so results are invariant to the
 * caller's input permutation.
 */
import { GeometryError } from "../errors.js";
import { solveLinear3 } from "./matrix.js";

/** A 2D point. */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/** A fitted circle. */
export interface Circle2 {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
}

const GEOMETRIC_MAX_ITERATIONS = 50;
const GEOMETRIC_CONVERGENCE = 1e-12;

/** Minimum points to determine a circle (3 parameters). */
export const MIN_CIRCLE_POINTS = 3;

/**
 * Fits a circle to 2D points: Kása algebraic fit followed by
 * geometric Gauss-Newton refinement. Throws
 * `INSUFFICIENT_POINTS` below 3 points, `NON_FINITE_INPUT` on
 * non-finite coordinates, `DEGENERATE_GEOMETRY` when the points
 * are collinear (singular normal equations) or the fit produces a
 * non-positive radius.
 */
export function fitCircle2(points: readonly Point2[]): Circle2 {
  if (!Array.isArray(points) || points.length < MIN_CIRCLE_POINTS) {
    throw new GeometryError(
      "INSUFFICIENT_POINTS",
      `circle fit requires at least ${MIN_CIRCLE_POINTS} points, got ${points.length}`,
      { details: { required: MIN_CIRCLE_POINTS, actual: points.length } },
    );
  }
  for (const [index, point] of points.entries()) {
    if (typeof point.x !== "number" || !Number.isFinite(point.x)) {
      throw new GeometryError("NON_FINITE_INPUT", `points[${index}].x must be finite`, {
        details: { index, coordinate: "x", value: String(point.x) },
      });
    }
    if (typeof point.y !== "number" || !Number.isFinite(point.y)) {
      throw new GeometryError("NON_FINITE_INPUT", `points[${index}].y must be finite`, {
        details: { index, coordinate: "y", value: String(point.y) },
      });
    }
  }

  // Kása: minimize Σ(x² + y² + D·x + E·y + F)² over (D, E, F).
  // Normal equations: [Σxx Σxy Σx; Σxy Σyy Σy; Σx Σy n]·[D;E;F] = [−Σ(x²+y²)x? …]
  // Standard assembly (accumulate in canonical input order):
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sx = 0;
  let sy = 0;
  let sxr2 = 0; // Σ x·(x²+y²)
  let syr2 = 0; // Σ y·(x²+y²)
  let sr2 = 0; // Σ (x²+y²)
  const n = points.length;
  for (const point of points) {
    const x = point.x;
    const y = point.y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sx += x;
    sy += y;
    const r2 = x * x + y * y;
    sxr2 += x * r2;
    syr2 += y * r2;
    sr2 += r2;
  }
  // Minimize Σ(x² + y² + D x + E y + F)²:
  // ∂/∂D: Σ(x²+y²)x + D Σxx + E Σxy + F Σx = 0
  // ∂/∂E: Σ(x²+y²)y + D Σxy + E Σyy + F Σy = 0
  // ∂/∂F: Σ(x²+y²) + D Σx + E Σy + F n = 0
  const [d, e, f] = solveLinear3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [-sxr2, -syr2, -sr2],
  );

  const centerX = -d / 2;
  const centerY = -e / 2;
  const radiusSq = (d * d + e * e) / 4 - f;
  if (!Number.isFinite(radiusSq) || radiusSq <= 0) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      `algebraic circle fit produced a non-positive radius² (${String(radiusSq)}) — the points do not bound a circle`,
      { details: { radiusSq: String(radiusSq) } },
    );
  }
  const algebraic: Circle2 = { centerX, centerY, radius: Math.sqrt(radiusSq) };
  return refineGeometric(points, algebraic);
}

/**
 * Gauss-Newton refinement of (cx, cy, R) on the geometric residual
 * rᵢ = ‖pᵢ − c‖ − R. Each iteration solves the 3×3 normal equations
 * of the linearized problem; the step is applied only when it
 * reduces the sum of squared residuals (a simple deterministic
 * line-search-free safeguard: reject non-improving steps and stop).
 */
function refineGeometric(points: readonly Point2[], initial: Circle2): Circle2 {
  let cx = initial.centerX;
  let cy = initial.centerY;
  let radius = initial.radius;
  let cost = geometricCost(points, cx, cy, radius);

  for (let iteration = 0; iteration < GEOMETRIC_MAX_ITERATIONS; iteration += 1) {
    // Linearize around (cx, cy, R): residual rᵢ = dᵢ − R,
    // ∂r/∂cx = −(xᵢ−cx)/dᵢ, ∂r/∂cy = −(yᵢ−cy)/dᵢ, ∂r/∂R = −1.
    let a11 = 0;
    let a12 = 0;
    let a13 = 0;
    let a22 = 0;
    let a23 = 0;
    let a33 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    for (const point of points) {
      const dx = point.x - cx;
      const dy = point.y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 1e-300) {
        // A point exactly at the current center contributes no
        // information to the linearization; skip it.
        continue;
      }
      const gx = -dx / distance;
      const gy = -dy / distance;
      const gr = -1;
      const residual = distance - radius;
      a11 += gx * gx;
      a12 += gx * gy;
      a13 += gx * gr;
      a22 += gy * gy;
      a23 += gy * gr;
      a33 += gr * gr;
      b1 -= gx * residual;
      b2 -= gy * residual;
      b3 -= gr * residual;
    }
    let step: readonly [number, number, number];
    try {
      step = solveLinear3([[a11, a12, a13], [a12, a22, a23], [a13, a23, a33]], [b1, b2, b3]);
    } catch (error) {
      if (error instanceof GeometryError && error.code === "DEGENERATE_GEOMETRY") {
        break; // normal equations singular — we are at the optimum (or a flat direction)
      }
      throw error;
    }
    const nextCx = cx + (step[0] as number);
    const nextCy = cy + (step[1] as number);
    const nextRadius = radius + (step[2] as number);
    if (!Number.isFinite(nextCx) || !Number.isFinite(nextCy) || !Number.isFinite(nextRadius) || nextRadius <= 0) {
      break;
    }
    const nextCost = geometricCost(points, nextCx, nextCy, nextRadius);
    if (!(nextCost < cost)) {
      break; // no improvement — converged (deterministic stop)
    }
    const improvement = cost - nextCost;
    cx = nextCx;
    cy = nextCy;
    radius = nextRadius;
    cost = nextCost;
    if (improvement < GEOMETRIC_CONVERGENCE) {
      break;
    }
  }

  if (!Number.isFinite(radius) || radius <= 0) {
    throw new GeometryError("INVALID_FIT", `circle fit produced a non-positive radius: ${String(radius)}`, {
      details: { radius: String(radius) },
    });
  }
  return { centerX: cx, centerY: cy, radius };
}

function geometricCost(points: readonly Point2[], cx: number, cy: number, radius: number): number {
  let sum = 0;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const residual = Math.sqrt(dx * dx + dy * dy) - radius;
    sum += residual * residual;
  }
  return sum;
}
