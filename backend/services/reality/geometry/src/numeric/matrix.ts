/**
 * Deterministic numeric core for the geometry primitives (AISE-009).
 *
 * Everything here is:
 *
 * - **free of ambient state** — no randomness, no clock reads, no
 *   iteration-order dependence on hash structures;
 * - **fixed-order** — accumulations run over caller-independent
 *   canonical sequences, sweeps visit a fixed (p, q) order, pivots
 *   are chosen deterministically;
 * - **IEEE-754 disciplined** — only +, −, ×, /, sqrt, abs, min,
 *   max appear in the core solvers (all exactly specified for
 *   doubles); transcendental functions (acos/asin/atan-free) appear
 *   only at the very edge of the package (angle queries) and are
 *   documented there.
 *
 * The Jacobi eigensolver is the classic cyclic method for symmetric
 * 3×3 matrices: each step zeroes one off-diagonal element with a
 * Givens rotation (angle chosen from the smaller-magnitude root,
 * "Numerical Recipes" formulation, computed algebraically — no
 * transcendental calls); a sweep visits (0,1), (0,2), (1,2) in
 * fixed order; at most 30 sweeps. Eigenvalues are sorted ascending
 * with their eigenvectors (stable sort — ties keep index order),
 * and eigenvector signs are fixed canonically — making the output a
 * pure function of the input matrix.
 */
import { GeometryError } from "../errors.js";

/** A 3×3 matrix, row-major. */
export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** A 3D vector (numeric-core-local structural type). */
export interface Vec3N {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** An eigenpair set of a symmetric 3×3, eigenvalues ascending. */
export interface Eigen3 {
  readonly eigenvalues: readonly [number, number, number];
  /** Unit-length eigenvector for eigenvalues[i], sign-fixed. */
  readonly eigenvectors: readonly [Vec3N, Vec3N, Vec3N];
}

const JACOBI_MAX_SWEEPS = 30;
const JACOBI_OFF_THRESHOLD = 1e-14;
const PIVOT_EPS = 1e-14;

/**
 * Symmetric 3×3 eigendecomposition (cyclic Jacobi).
 * Input must be symmetric; off-diagonal asymmetry above 1e-12·scale
 * fails closed (a caller handing us a non-symmetric matrix is a
 * bug, not something to average away).
 */
export function eigensystemSymmetric3(m: Matrix3): Eigen3 {
  const scale = Math.max(
    1,
    Math.abs(m[0][0] as number),
    Math.abs(m[0][1] as number),
    Math.abs(m[0][2] as number),
    Math.abs(m[1][1] as number),
    Math.abs(m[1][2] as number),
    Math.abs(m[2][2] as number),
  );
  const asymmetry = Math.max(
    Math.abs((m[0][1] as number) - (m[1][0] as number)),
    Math.abs((m[0][2] as number) - (m[2][0] as number)),
    Math.abs((m[1][2] as number) - (m[2][1] as number)),
  );
  if (asymmetry > 1e-12 * scale) {
    throw new GeometryError("VALIDATION_FAILED", "eigensystem input matrix must be symmetric", {
      details: { asymmetry: String(asymmetry) },
    });
  }

  // Working copies (mutable).
  const a: number[][] = [
    [m[0][0] as number, m[0][1] as number, m[0][2] as number],
    [m[1][0] as number, m[1][1] as number, m[1][2] as number],
    [m[2][0] as number, m[2][1] as number, m[2][2] as number],
  ];
  // V accumulates the rotations; starts as identity.
  const v: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  const eps = JACOBI_OFF_THRESHOLD * scale;
  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS; sweep += 1) {
    if (offDiagonalMass(a) < eps) {
      break;
    }
    // Cyclic sweeps in fixed (p, q) order — deterministic.
    rotate(a, v, 0, 1);
    rotate(a, v, 0, 2);
    rotate(a, v, 1, 2);
  }

  const pairs = [0, 1, 2].map((i) => ({
    value: a[i]?.[i] as number,
    vector: { x: v[0]?.[i] as number, y: v[1]?.[i] as number, z: v[2]?.[i] as number },
  }));
  // Ascending eigenvalues; stable for ties (index order preserved).
  const sorted = insertionSortPairs(pairs);

  const eigenvalues = [
    sorted[0]?.value as number,
    sorted[1]?.value as number,
    sorted[2]?.value as number,
  ] as const;
  const eigenvectors: readonly [Vec3N, Vec3N, Vec3N] = [
    fixSign(normalizeVec(sorted[0]?.vector as Vec3N)),
    fixSign(normalizeVec(sorted[1]?.vector as Vec3N)),
    fixSign(normalizeVec(sorted[2]?.vector as Vec3N)),
  ];
  return { eigenvalues, eigenvectors };
}

function insertionSortPairs<T extends { value: number }>(items: T[]): T[] {
  const out = [...items];
  for (let i = 1; i < out.length; i += 1) {
    const current = out[i] as T;
    let j = i - 1;
    while (j >= 0 && (out[j] as T).value > current.value) {
      out[j + 1] = out[j] as T;
      j -= 1;
    }
    out[j + 1] = current;
  }
  return out;
}

function offDiagonalMass(a: number[][]): number {
  return (
    Math.abs(a[0]?.[1] as number) + Math.abs(a[0]?.[2] as number) + Math.abs(a[1]?.[2] as number)
  );
}

/**
 * One Jacobi rotation in the (p, q) plane, applied in place to the
 * working matrix `a` (as A ← JᵀAJ, row update then column update)
 * and to the accumulated eigenvectors `v` (V ← VJ).
 *
 * tan φ is the smaller-magnitude root of t² + 2θt − 1 = 0 with
 * θ = (a_qq − a_pp)/(2·a_pq) — computed algebraically (sqrt only),
 * sign-safe at θ = 0 (t = 1, the ±π/4 rotation that zeroes a_pq
 * when the diagonal entries are equal).
 */
function rotate(a: number[][], v: number[][], p: number, q: number): void {
  const apq = a[p]?.[q] as number;
  if (apq === 0) {
    return; // plane already diagonal
  }
  const app = a[p]?.[p] as number;
  const aqq = a[q]?.[q] as number;
  const theta = (aqq - app) / (2 * apq);
  const t =
    theta >= 0
      ? 1 / (theta + Math.sqrt(theta * theta + 1))
      : 1 / (theta - Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;

  // Row update: A ← JᵀA (rows p and q).
  for (let j = 0; j < 3; j += 1) {
    const apj = a[p]?.[j] as number;
    const aqj = a[q]?.[j] as number;
    a[p]![j] = c * apj - s * aqj;
    a[q]![j] = s * apj + c * aqj;
  }
  // Column update: A ← AJ (columns p and q) — completes JᵀAJ.
  for (let i = 0; i < 3; i += 1) {
    const aip = a[i]?.[p] as number;
    const aiq = a[i]?.[q] as number;
    a[i]![p] = c * aip - s * aiq;
    a[i]![q] = s * aip + c * aiq;
  }
  // Eigenvector accumulation: V ← VJ.
  for (let i = 0; i < 3; i += 1) {
    const vip = v[i]?.[p] as number;
    const viq = v[i]?.[q] as number;
    v[i]![p] = c * vip - s * viq;
    v[i]![q] = s * vip + c * viq;
  }
}

function normalizeVec(v: Vec3N): Vec3N {
  const norm = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (norm < 1e-300) {
    throw new GeometryError("INTERNAL_ERROR", "eigenvector norm underflow", {
      details: {},
    });
  }
  return { x: v.x / norm, y: v.y / norm, z: v.z / norm };
}

function fixSign(v: Vec3N): Vec3N {
  let lead = v.x;
  if (Math.abs(v.y) > Math.abs(lead)) {
    lead = v.y;
  }
  if (Math.abs(v.z) > Math.abs(lead)) {
    lead = v.z;
  }
  return lead < 0 ? { x: -v.x, y: -v.y, z: -v.z } : v;
}

/**
 * Solves the 3×3 linear system A·x = b by Gaussian elimination with
 * deterministic partial pivoting (largest |pivot| in the column;
 * ties keep the earlier row). Singular within tolerance →
 * `DEGENERATE_GEOMETRY` (the caller's geometry does not determine a
 * unique solution — e.g. collinear projected points for a circle
 * fit).
 */
export function solveLinear3(
  aIn: readonly [readonly number[], readonly number[], readonly number[]],
  bIn: readonly [number, number, number],
): readonly [number, number, number] {
  const a = [aIn[0]?.slice() as number[], aIn[1]?.slice() as number[], aIn[2]?.slice() as number[]];
  const b = [bIn[0] as number, bIn[1] as number, bIn[2] as number];

  for (let col = 0; col < 3; col += 1) {
    // Deterministic partial pivot: largest absolute value, ties → earlier row.
    let pivotRow = col;
    let pivotAbs = Math.abs(a[col]?.[col] as number);
    for (let row = col + 1; row < 3; row += 1) {
      const candidate = Math.abs(a[row]?.[col] as number);
      if (candidate > pivotAbs) {
        pivotAbs = candidate;
        pivotRow = row;
      }
    }
    if (pivotAbs < PIVOT_EPS) {
      throw new GeometryError(
        "DEGENERATE_GEOMETRY",
        `linear system is singular (pivot magnitude ${pivotAbs} at column ${col}) — the input does not determine a unique solution`,
        { details: { pivot: String(pivotAbs), column: col } },
      );
    }
    if (pivotRow !== col) {
      const tmpRow = a[col] as number[];
      a[col] = a[pivotRow] as number[];
      a[pivotRow] = tmpRow;
      const tmpB = b[col] as number;
      b[col] = b[pivotRow] as number;
      b[pivotRow] = tmpB;
    }
    const pivot = a[col]?.[col] as number;
    for (let row = col + 1; row < 3; row += 1) {
      const factor = (a[row]?.[col] as number) / pivot;
      if (factor === 0) {
        continue;
      }
      for (let j = col; j < 3; j += 1) {
        a[row]![j] = (a[row]?.[j] as number) - factor * (a[col]?.[j] as number);
      }
      b[row] = (b[row] as number) - factor * (b[col] as number);
    }
  }

  // Back substitution.
  const x: number[] = [0, 0, 0];
  for (let row = 2; row >= 0; row -= 1) {
    let sum = b[row] as number;
    for (let j = row + 1; j < 3; j += 1) {
      sum -= (a[row]?.[j] as number) * (x[j] as number);
    }
    const value = sum / (a[row]?.[row] as number);
    if (!Number.isFinite(value)) {
      throw new GeometryError("DEGENERATE_GEOMETRY", "linear system solution is non-finite", {
        details: {},
      });
    }
    x[row] = value;
  }
  return [x[0] as number, x[1] as number, x[2] as number] as const;
}
